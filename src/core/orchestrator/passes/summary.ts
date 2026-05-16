import { Finding, ProjectContext, ReviewOptions, ReviewSummary } from '../../../types';
import { buildSummaryPrompt } from '../../../claude/prompts';
import { parseClaudeOutput } from '../../../claude/parser';
import { OrchestratorDeps } from '../types';
import { runCli } from '../cli';
import { stripIdForPrompt } from '../helpers';

function fallbackSummary(findings: Finding[]): ReviewSummary {
  const critical = findings.filter((f) => f.severity === 'critical').length;
  const major = findings.filter((f) => f.severity === 'major').length;
  const verdict: ReviewSummary['overallVerdict'] = critical > 0 ? 'block' : major > 0 ? 'needs-changes' : 'approve-with-comments';
  return {
    branch: '',
    baseBranch: '',
    filesChanged: 0,
    linesAdded: 0,
    linesRemoved: 0,
    overallVerdict: verdict,
    executiveSummary: `Review produced ${findings.length} findings across multiple passes.`,
    topConcerns: findings.filter((f) => f.severity === 'critical' || f.severity === 'major').slice(0, 6).map((f) => f.title),
    strengths: findings.filter((f) => f.severity === 'praise').slice(0, 3).map((f) => f.title),
    riskScore: Math.min(100, critical * 25 + major * 8 + findings.length),
    generatedAt: new Date().toISOString(),
  };
}

export async function makeSummary(
  deps: OrchestratorDeps,
  opts: ReviewOptions,
  ctx: ProjectContext,
  stat: { filesChanged: number; insertions: number; deletions: number },
  findings: Finding[],
): Promise<ReviewSummary> {
  const prompt = buildSummaryPrompt({
    ctx,
    depth: opts.depth,
    allFindingsJson: JSON.stringify(findings.map(stripIdForPrompt)),
    diffStat: stat,
    lang: opts.lang,
  });
  try {
    const text = await runCli(deps, prompt, 'summary');
    const parsed = parseClaudeOutput(text, opts.lang);
    if (parsed.summary) return parsed.summary;
  } catch (e) {
    deps.log(`Summary pass failed, using fallback: ${(e as Error).message}`);
  }
  return fallbackSummary(findings);
}
