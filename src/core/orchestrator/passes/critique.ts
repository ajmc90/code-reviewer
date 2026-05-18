import { Finding, PartialReviewState } from '../../../types';
import { buildCritiquePrompt } from '../../../claude/prompts';
import { OrchestratorDeps } from '../types';
import { stripIdForPrompt } from '../helpers';
import { runCli } from '../cli';
import { parseCritiqueOutput, normalizeCritiqueFinding } from '../../../claude/critiqueParser';
import { PassName } from '../../events';
import { PassMetrics, metricsFromCliResult } from '../metrics';

/**
 * Critique result: the full updated finding set, ready to replace state.findings.
 * Includes kept findings (untouched), revised findings (mutated in place with
 * originalFinding snapshot), dropped/merged findings (carried so the UI can
 * surface them under the "Revised" chip), and new findings critique discovered.
 *
 * The orchestrator returns this whole array so the panel's mirror stays in
 * lockstep — the decision metadata on each finding is what tells the UI which
 * variant to render.
 */
export interface CritiqueResult {
  findings: Finding[];
  counts: { kept: number; revised: number; dropped: number; merged: number; newFindings: number };
  metrics: PassMetrics;
}

/**
 * Run critique and apply per-finding decisions.
 *
 * Why short ids: the parser receives back `{ id: "f3", action: "drop", ... }`
 * objects from the LLM. Real finding ids look like `1715789000000-7-9xZkL2` —
 * too long for the model to keep stable across a long response. We rewrite to
 * `f1, f2, …` for the prompt, map back to real ids after parsing.
 */
export async function runCritiquePass(
  deps: OrchestratorDeps,
  state: PartialReviewState,
  passKey: PassName = 'critique',
): Promise<CritiqueResult> {
  const { log, events } = deps;
  const lang = state.opts.lang;

  // ── 1. Tag prior findings with short ids for the prompt ─────────
  const shortToReal = new Map<string, string>();
  const realToShort = new Map<string, string>();
  const prompted = state.findings.map((f, i) => {
    const short = `f${i + 1}`;
    shortToReal.set(short, f.id);
    realToShort.set(f.id, short);
    return { id: short, ...stripIdForPrompt(f) };
  });

  // ── 2. Call the CLI ─────────────────────────────────────────────
  const prompt = buildCritiquePrompt({
    ctx: state.ctx,
    depth: state.opts.depth,
    priorFindingsJson: JSON.stringify(prompted),
    diff: state.enrichedDiff,
    lang,
  });
  log(`[${passKey}] prompt = ${prompt.length} chars (${Math.round(prompt.length / 1024)} KB)`);
  const r = await runCli(deps, prompt, passKey);
  log(`[${passKey}] response = ${r.text.length} chars (${Math.round(r.text.length / 1024)} KB)`);
  const metrics = metricsFromCliResult(r, prompt.length);

  // ── 3. Parse ────────────────────────────────────────────────────
  const parsed = parseCritiqueOutput(r.text);
  if (parsed.decisions.length === 0 && parsed.newFindings.length === 0 && r.text.length > 0) {
    const preview = r.text.trim().slice(0, 600).replace(/\s+/g, ' ');
    log(`[${passKey}] parsed 0 decisions and 0 new findings. Response preview: ${preview}${r.text.length > 600 ? '…' : ''}`);
    events?.emit({
      kind: 'log',
      level: 'warn',
      message: `[${passKey}] parsed nothing usable. First 200 chars: ${preview.slice(0, 200)}`,
      at: Date.now(),
    });
    // Defensive fallback: leave the prior findings alone rather than silently
    // wiping them.
    return {
      findings: state.findings.slice(),
      counts: { kept: state.findings.length, revised: 0, dropped: 0, merged: 0, newFindings: 0 },
      metrics,
    };
  }

  // ── 4. Build new findings (assign real ids; remember temp ids for merges) ─
  const newFindings: Finding[] = [];
  const tempToRealNew = new Map<string, string>();
  for (let i = 0; i < parsed.newFindings.length; i++) {
    const realId = makeRealId(i);
    const { finding, tempId } = normalizeCritiqueFinding(parsed.newFindings[i], realId, lang);
    if (!finding.file) continue;
    newFindings.push(finding);
    if (tempId) tempToRealNew.set(tempId, realId);
  }

  // ── 5. Resolve mergeIntoId: a short id ("f3") or a new-finding temp id ("nf1") ─
  const resolveMergeTarget = (target: string | undefined): string | undefined => {
    if (!target) return undefined;
    if (shortToReal.has(target)) return shortToReal.get(target);
    if (tempToRealNew.has(target)) return tempToRealNew.get(target);
    return undefined;
  };

  // ── 5b. Build a title lookup for humanizing reasons ──────────────
  // The prompt asks Claude to write reasons for humans, but the model often
  // still drops "f3 and f2 describe the same SQL injection" into the text
  // because it just emitted those ids one field above. Substitute every
  // occurrence with the corresponding finding title in guillemets so the
  // user reads prose, not internal scaffolding.
  const titleByShortId = new Map<string, string>();
  for (const [short, realId] of shortToReal) {
    const prior = state.findings.find((f) => f.id === realId);
    if (prior) titleByShortId.set(short, prior.title);
  }
  for (const [tempId, realId] of tempToRealNew) {
    const nf = newFindings.find((f) => f.id === realId);
    if (nf) titleByShortId.set(tempId, nf.title);
  }
  const humanizeReason = (reason: string | undefined): string => humanizeIds(reason || '', titleByShortId);

  // ── 6. Apply decisions to prior findings ─────────────────────────
  const decisionById = new Map(parsed.decisions.map((d) => [d.id, d]));
  const counts = { kept: 0, revised: 0, dropped: 0, merged: 0, newFindings: newFindings.length };
  const updated: Finding[] = [];
  for (const prior of state.findings) {
    const short = realToShort.get(prior.id);
    const d = short ? decisionById.get(short) : undefined;
    if (!d || d.action === 'keep') {
      counts.kept++;
      // Defensive: clear any stale critique decision from a previous run.
      const clean = { ...prior };
      delete clean.decision;
      delete clean.decisionReason;
      delete clean.mergedIntoId;
      delete clean.originalFinding;
      updated.push(clean);
      continue;
    }
    if (d.action === 'drop') {
      counts.dropped++;
      updated.push({
        ...prior,
        decision: 'drop',
        decisionReason: humanizeReason(d.reason),
      });
      continue;
    }
    if (d.action === 'merge') {
      counts.merged++;
      const target = resolveMergeTarget(d.mergeIntoId);
      updated.push({
        ...prior,
        decision: 'merge',
        decisionReason: humanizeReason(d.reason),
        mergedIntoId: target,
      });
      continue;
    }
    if (d.action === 'revise' && d.revised) {
      counts.revised++;
      const snapshot = {
        severity: prior.severity,
        title: prior.title,
        description: prior.description,
        reasoning: prior.reasoning,
        category: prior.category,
        confidence: prior.confidence,
        pass: prior.pass,
      };
      // Apply the revised payload but keep the same id (so existing relatedTo
      // pointers and the panel's DOM data-id keys stay valid).
      const { finding: revised } = normalizeCritiqueFinding(d.revised, prior.id, lang);
      revised.decision = 'revise';
      revised.decisionReason = humanizeReason(d.reason);
      revised.originalFinding = snapshot;
      // Preserve fields the model wouldn't know about.
      if (prior.silencedFrom !== undefined) revised.silencedFrom = prior.silencedFrom;
      if (prior.silencedMode !== undefined) revised.silencedMode = prior.silencedMode;
      if (prior.silencedAt !== undefined) revised.silencedAt = prior.silencedAt;
      if (prior.dismissed) revised.dismissed = prior.dismissed;
      if (prior.relatedTo) revised.relatedTo = prior.relatedTo;
      if (prior.translations) revised.translations = prior.translations;
      if (prior.displayLang) revised.displayLang = prior.displayLang;
      updated.push(revised);
      continue;
    }
    // Unrecognised — fall back to keep.
    counts.kept++;
    updated.push(prior);
  }

  // ── 7. Append new findings ──────────────────────────────────────
  updated.push(...newFindings);

  return { findings: updated, counts, metrics };
}

function makeRealId(seed: number): string {
  return `${Date.now()}-c${seed}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Rewrite occurrences of short prompt ids (f1, f2, …, nf1, nf2, …) inside a
 * critique reason string with the corresponding finding title in guillemets
 * so the user reads prose, not internal scaffolding.
 *
 * Rules:
 *   - Match on word boundaries so we don't touch "fix1" or "interface3".
 *   - Match the longer "nfN" form first so "nf12" doesn't get treated as
 *     "n" + "f12".
 *   - Unknown ids (model invented one that doesn't exist) are left as-is
 *     rather than silently scrubbed — the surfaced gibberish at least
 *     signals to the user that critique referenced something we couldn't
 *     resolve, which is more honest than pretending the reason was clean.
 */
function humanizeIds(reason: string, titleByShortId: Map<string, string>): string {
  if (!reason) return '';
  // The regex captures either nfN or fN (order matters: nf first, then f).
  // Boundaries: must NOT be preceded by an alphanumeric (so "fix3", "Ref2",
  // "interface5" never match), and must NOT be followed by an alphanumeric
  // (so "f3a" never matches).
  return reason.replace(/(?<![A-Za-z0-9])(nf\d+|f\d+)(?![A-Za-z0-9])/g, (match) => {
    const title = titleByShortId.get(match);
    if (!title) return match;
    // Truncate runaway titles so the substitution doesn't bloat the reason
    // into a wall of text. 70 chars is enough to identify the finding while
    // keeping the surrounding sentence scannable.
    const short = title.length > 70 ? title.slice(0, 69) + '…' : title;
    return `«${short}»`;
  });
}
