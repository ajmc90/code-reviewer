import { ReviewResult, isVisibleFinding } from '../types';
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
  const visible = r.findings.filter(isVisibleFinding);
  lines.push(`## ${m('md.findings')} (${visible.length})`);
  for (const f of visible) {
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
      // The fix payload may carry oldString/newString (new schema) or just
      // replacement (legacy). Either way we surface the resulting code so a
      // human reading the report can see what would land in the file.
      const fixCode = f.suggestedFix.newString ?? f.suggestedFix.replacement;
      if (fixCode) {
        lines.push('```');
        lines.push(fixCode);
        lines.push('```');
      }
    }
  }

  // Critique audit trail — only emit when there's something to show. Keeps
  // the export focused for branches where critique didn't reshape the list.
  const dropped = r.findings.filter((f) => f.decision === 'drop');
  const merged = r.findings.filter((f) => f.decision === 'merge');
  if (dropped.length > 0 || merged.length > 0) {
    lines.push('');
    lines.push(`## ${m('md.critiqueDecisions')}`);
    if (dropped.length > 0) {
      lines.push('');
      lines.push(`### ${m('md.critiqueDropped')} (${dropped.length})`);
      for (const f of dropped) {
        lines.push('');
        lines.push(`- **${f.title}** *(${f.file}:${f.range.startLine}, from \`${f.pass}\` pass)*`);
        if (f.decisionReason) lines.push(`  > ${f.decisionReason}`);
      }
    }
    if (merged.length > 0) {
      lines.push('');
      lines.push(`### ${m('md.critiqueMerged')} (${merged.length})`);
      for (const f of merged) {
        const target = f.mergedIntoId ? r.findings.find((x) => x.id === f.mergedIntoId) : null;
        const tail = target ? ` → into "${target.title}" *(${target.file}:${target.range.startLine})*` : '';
        lines.push('');
        lines.push(`- **${f.title}** *(${f.file}:${f.range.startLine})*${tail}`);
        if (f.decisionReason) lines.push(`  > ${f.decisionReason}`);
      }
    }
  }
  return lines.join('\n');
}
