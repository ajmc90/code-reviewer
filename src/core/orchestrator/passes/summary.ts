import { Finding, ProjectContext, ReviewOptions, ReviewSummary, isVisibleFinding } from '../../../types';
import { buildSummaryPrompt } from '../../../claude/prompts';
import { parseClaudeOutput } from '../../../claude/parser';
import { OrchestratorDeps } from '../types';
import { runCli } from '../cli';
import { stripIdForPrompt } from '../helpers';
import { PassMetrics, metricsFromCliResult } from '../metrics';

function fallbackSummary(findings: Finding[]): ReviewSummary {
  const visible = findings.filter(isVisibleFinding);
  const critical = visible.filter((f) => f.severity === 'critical').length;
  const major = visible.filter((f) => f.severity === 'major').length;
  const verdict: ReviewSummary['overallVerdict'] = critical > 0 ? 'block' : major > 0 ? 'needs-changes' : 'approve-with-comments';
  return {
    branch: '',
    baseBranch: '',
    filesChanged: 0,
    linesAdded: 0,
    linesRemoved: 0,
    overallVerdict: verdict,
    executiveSummary: `Review produced ${visible.length} findings across multiple passes.`,
    topConcerns: visible.filter((f) => f.severity === 'critical' || f.severity === 'major').slice(0, 6).map((f) => f.title),
    strengths: visible.filter((f) => f.severity === 'praise').slice(0, 3).map((f) => f.title),
    riskScore: Math.min(100, critical * 25 + major * 8 + visible.length),
    generatedAt: new Date().toISOString(),
  };
}

export async function makeSummary(
  deps: OrchestratorDeps,
  opts: ReviewOptions,
  ctx: ProjectContext,
  stat: { filesChanged: number; insertions: number; deletions: number },
  findings: Finding[],
): Promise<{ summary: ReviewSummary; metrics?: PassMetrics }> {
  // The summary prompt should only see findings that will actually reach the
  // author — feeding critique-dropped/merged ones in just produces a stale
  // executive summary that contradicts the grid the user sees.
  const visible = findings.filter(isVisibleFinding);
  const prompt = buildSummaryPrompt({
    ctx,
    depth: opts.depth,
    allFindingsJson: JSON.stringify(visible.map(stripIdForPrompt)),
    diffStat: stat,
    lang: opts.lang,
  });
  try {
    const r = await runCli(deps, prompt, 'summary');
    const metrics = metricsFromCliResult(r, prompt.length);
    const parsed = parseClaudeOutput(r.text, opts.lang);
    if (parsed.summary) return { summary: parsed.summary, metrics };
    // Parser returned nothing — keep the metrics (the CLI call still cost us)
    // but use the local fallback summary.
    return { summary: fallbackSummary(findings), metrics };
  } catch (e) {
    deps.log(`Summary pass failed, using fallback: ${(e as Error).message}`);
  }
  return { summary: fallbackSummary(findings) };
}
