import { PartialReviewState } from '../../../types';
import { buildStructuralExplorationPrompt, buildContextSection } from '../../../claude/prompts';
import { parseStructuralOutput } from '../../../claude/structuralParser';
import { loadRelatedFiles, charsForBudget } from '../../../context/fileContext';
import { OrchestratorDeps } from '../types';
import { runCliWithTools } from '../cli';

function buildEnrichedDiff(loadedFiles: { path: string; content: string }[], rawDiff: string): string {
  const contextSection = buildContextSection(loadedFiles);
  return contextSection ? `${contextSection}\n\n--- UNIFIED DIFF (base...head) ---\n${rawDiff}` : rawDiff;
}

export async function runStructuralPass(deps: OrchestratorDeps, state: PartialReviewState): Promise<number> {
  const { log, workspaceRoot } = deps;
  const prompt = buildStructuralExplorationPrompt({
    ctx: state.ctx,
    diff: state.rawDiff,
    changedFiles: state.changedFiles,
    conventions: state.conventions,
  });
  const text = await runCliWithTools(deps, prompt, 'structural', ['Read', 'Grep', 'Glob']);
  const exploration = parseStructuralOutput(text);
  state.structuralRisks = exploration.observedRisks;
  log(`Structural pass: ${exploration.filesToInclude.length} extra files requested, ${exploration.observedRisks.length} risks observed.`);

  const usedBudget = state.loadedFiles.reduce((a, f) => a + f.content.length, 0);
  const totalBudgetChars = charsForBudget(60000);
  const diffBudgetReserved = Math.min(state.rawDiff.length, charsForBudget(40000));
  const contextBudget = Math.max(0, totalBudgetChars - diffBudgetReserved);
  const remainingChars = Math.max(0, contextBudget - usedBudget);
  const existingPaths = new Set(state.loadedFiles.map((f) => f.path));
  const related = loadRelatedFiles({
    workspaceRoot,
    requested: exploration.filesToInclude,
    existingPaths,
    budgetChars: remainingChars,
    perFileMaxChars: 30000,
  });
  state.loadedFiles.push(...related);
  log(`Structural pass added ${related.length} related files.`);
  state.enrichedDiff = buildEnrichedDiff(state.loadedFiles, state.rawDiff);
  return 0;
}
