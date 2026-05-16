import { ReviewResult } from '../types';
import { Lang, t } from '../i18n';

export function renderReportMarkdown(r: ReviewResult, lang: Lang): string {
  const m = (key: Parameters<typeof t>[0], params?: Record<string, string | number>) => t(key, lang, params);
  const lines: string[] = [];
  const s = r.summary;
  lines.push(`# ${m('md.title')}`);
  lines.push('');
  lines.push(`**${m('md.branch')}:** \`${s.branch}\` vs \`${s.baseBranch}\``);
  lines.push(`**${m('md.verdict')}:** ${s.overallVerdict}`);
  lines.push(`**${m('md.filesChanged')}:** ${s.filesChanged} · **+${s.linesAdded} / -${s.linesRemoved}**`);
  lines.push(`**${m('md.riskScore')}:** ${s.riskScore}/100`);
  lines.push(`**${m('md.passesRun')}:** ${r.passesRun.join(', ')}`);
  lines.push('');
  lines.push(`## ${m('md.executiveSummary')}`);
  lines.push(s.executiveSummary);
  lines.push('');
  if (s.topConcerns.length) {
    lines.push(`## ${m('md.topConcerns')}`);
    for (const c of s.topConcerns) lines.push(`- ${c}`);
    lines.push('');
  }
  if (s.strengths.length) {
    lines.push(`## ${m('md.strengths')}`);
    for (const c of s.strengths) lines.push(`- ${c}`);
    lines.push('');
  }
  lines.push(`## ${m('md.findings')} (${r.findings.length})`);
  for (const f of r.findings) {
    lines.push('');
    lines.push(`### [${f.severity.toUpperCase()}] ${f.title}`);
    lines.push(`*${f.file}:${f.range.startLine}-${f.range.endLine}* · category: \`${f.category}\` · confidence: \`${f.confidence}\` · pass: \`${f.pass}\``);
    lines.push('');
    lines.push(f.description);
    if (f.reasoning) {
      lines.push('');
      lines.push(`**${m('md.reasoning')}**`);
      lines.push(f.reasoning);
    }
    if (f.questionsRaised.length) {
      lines.push('');
      lines.push(`**${m('md.questionsRaised')}**`);
      for (const q of f.questionsRaised) lines.push(`- ${q}`);
    }
    if (f.alternativesConsidered.length) {
      lines.push('');
      lines.push(`**${m('md.alternatives')}**`);
      for (const a of f.alternativesConsidered) lines.push(`- ${a}`);
    }
    if (f.evidence.length) {
      lines.push('');
      lines.push(`**${m('md.evidence')}**`);
      for (const e of f.evidence) lines.push(`> ${e.replace(/\n/g, '\n> ')}`);
    }
    if (f.suggestedFix) {
      lines.push('');
      lines.push(`**${m('md.suggestedFix', { level: f.suggestedFix.confidence })}**`);
      lines.push(f.suggestedFix.description);
      lines.push('```');
      lines.push(f.suggestedFix.replacement);
      lines.push('```');
    }
  }
  return lines.join('\n');
}
