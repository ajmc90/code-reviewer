export type Severity = 'critical' | 'major' | 'minor' | 'nit' | 'praise' | 'silenced';

/**
 * Why a finding was demoted to severity='silenced' on this run. The two modes
 * mirror the dismiss popup: 'this' matched a single dismissed finding (same
 * file + line range + title), 'pattern' matched a dismissed pattern
 * (category + title regardless of location).
 */
export type SilencedMode = 'this' | 'pattern';

export type Category =
  | 'bug'
  | 'security'
  | 'performance'
  | 'correctness'
  | 'maintainability'
  | 'readability'
  | 'tests'
  | 'docs'
  | 'style'
  | 'architecture'
  | 'accessibility'
  | 'concurrency'
  | 'data-integrity'
  | 'api-contract'
  | 'other';

export interface CodeRange {
  startLine: number;
  endLine: number;
  startColumn?: number;
  endColumn?: number;
}

/**
 * Suggested fix payload. The canonical apply path is search/replace via
 * oldString/newString — robust against line-number drift between the model's
 * mental snapshot and the on-disk file. range stays for visual highlight (the
 * decoration on the editor + the location shown on the card). replacement is
 * kept as a legacy fallback so fixes from older review history (before the
 * search/replace schema landed) still apply via line-range substitution.
 */
export interface SuggestedFix {
  description: string;
  range: CodeRange;
  confidence: 'high' | 'medium' | 'low';
  /**
   * New schema: exact substring of the current file to replace. The applier
   * runs a 4-strategy cascade (exact / whitespace-insensitive / indent-
   * preserving / fuzzy) and refuses to write when there's no match or
   * multiple ambiguous matches.
   */
  oldString?: string;
  newString?: string;
  /**
   * Optional 1-3 lines of surrounding context the model can attach to
   * disambiguate when oldString happens to appear more than once in the file.
   * Only consulted by the applier when the initial search returns >1 match.
   */
  contextBefore?: string;
  contextAfter?: string;
  /**
   * Legacy field. Some history records pre-date the search/replace schema and
   * only carry a line-range + replacement. The applier falls back to a pure
   * line-range substitution when oldString is absent.
   */
  replacement?: string;
}

/**
 * User-visible string fields of a Finding that can be translated. JSON keys,
 * file paths, line numbers, severities, etc. are NEVER translated — they're
 * stable identifiers and contract values.
 */
export interface TranslatedFindingFields {
  title: string;
  description: string;
  reasoning: string;
  questionsRaised: string[];
  alternativesConsidered: string[];
  evidence: string[];
  /**
   * Only the prose description gets translated — oldString/newString/
   * replacement carry code which stays verbatim across languages.
   */
  suggestedFix?: { description: string };
  /**
   * Self-critique's verdict prose for this finding, when present. Translated
   * alongside the main fields so the "Self-critique's review" section in the
   * card doesn't show English reasoning while everything else is in Spanish.
   */
  decisionReason?: string;
  /**
   * Pre-critique snapshot for revised findings — only the prose fields are
   * translated (severity/category/confidence/pass are enums/identifiers).
   */
  originalFinding?: { title: string; description: string; reasoning: string };
}

export interface Finding {
  id: string;
  file: string;
  range: CodeRange;
  severity: Severity;
  category: Category;
  title: string;
  description: string;
  reasoning: string;
  questionsRaised: string[];
  alternativesConsidered: string[];
  evidence: string[];
  suggestedFix?: SuggestedFix;
  relatedFiles: string[];
  confidence: 'high' | 'medium' | 'low';
  pass: 'explore' | 'critique' | 'permute' | 'security' | 'performance' | 'tests' | 'accessibility' | 'gaps' | 'structural';
  /**
   * When a pass produces a finding that extends or refines a prior finding
   * (instead of being a true duplicate), it sets this to the prior finding's
   * id. UI renders a "Related" badge that jumps to the original.
   */
  relatedTo?: string;
  dismissed?: boolean;
  /**
   * When the finding matches a user-recorded dismiss rule, severity is
   * rewritten to 'silenced' and these fields preserve the original signal +
   * reason so the UI can render the badge and the "Restore" action.
   */
  silencedFrom?: Severity;
  silencedMode?: SilencedMode;
  silencedAt?: number;
  /** Language in which Claude generated this finding's user-visible text. */
  originalLang?: 'en' | 'es';
  /** Lazily-populated translations keyed by target language. Cached forever. */
  translations?: Partial<Record<'en' | 'es', TranslatedFindingFields>>;
  /** Per-row language override set by the user via the in-card chip. */
  displayLang?: 'en' | 'es';
  /**
   * Critique decision applied to this finding. Set only by the critique pass.
   *  'keep'    — finding survives as-is.
   *  'revise'  — the user-visible fields (severity/title/description/etc.) were
   *              updated by critique. originalFinding preserves the pre-revision
   *              snapshot so the UI can show what changed.
   *  'drop'    — critique judged this a false positive or low-value noise.
   *              The finding stays in state.findings (so the user can audit the
   *              decision) but is hidden from the main grid; surfaces only
   *              under the "Revised" filter chip.
   *  'merge'   — critique folded this finding into another (mergedIntoId).
   *              Same visibility as 'drop'.
   * When this field is missing, the finding is treated as 'keep'.
   */
  decision?: 'keep' | 'revise' | 'drop' | 'merge';
  /** Short justification from critique for revise/drop/merge. */
  decisionReason?: string;
  /** If decision='merge', the id of the finding that absorbed this one. */
  mergedIntoId?: string;
  /**
   * Snapshot of this finding BEFORE critique modified it. Set only when
   * decision='revise'. Lets the UI show "Critique changed X → Y" detail.
   * The snapshot omits volatile/large fields (translations) so it stays light.
   */
  originalFinding?: {
    severity: Severity;
    title: string;
    description: string;
    reasoning: string;
    category: Category;
    confidence: 'high' | 'medium' | 'low';
    pass: Finding['pass'];
  };
}

export interface ReviewSummary {
  branch: string;
  baseBranch: string;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  overallVerdict: 'block' | 'needs-changes' | 'approve-with-comments' | 'approve' | 'praise';
  executiveSummary: string;
  topConcerns: string[];
  strengths: string[];
  riskScore: number;
  generatedAt: string;
}

export interface ReviewResult {
  summary: ReviewSummary;
  findings: Finding[];
  passesRun: string[];
  durationMs: number;
}

/**
 * A finding is "visible" in the main grid when it isn't dismissed and wasn't
 * dropped/merged away by critique. Drop/merge findings still live in
 * state.findings (so the user can audit critique's decisions from the
 * "Revised" filter chip), but every count and the default grid filter must
 * exclude them.
 */
export function isVisibleFinding(f: Pick<Finding, 'dismissed' | 'decision'>): boolean {
  if (f.dismissed) return false;
  if (f.decision === 'drop' || f.decision === 'merge') return false;
  return true;
}

export interface ProjectContext {
  rootPath: string;
  language: string[];
  frameworks: string[];
  packageManagers: string[];
  testFrameworks: string[];
  buildTools: string[];
  conventionsFiles: string[];
  hasCLAUDEmd: boolean;
  monorepo: boolean;
  branchProtections: string[];
}

export interface DiffFile {
  path: string;
  oldPath?: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked';
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  binary: boolean;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  lines: string[];
}

export type ReasoningDepth = 'fast' | 'balanced' | 'deep' | 'obsessive';

/**
 * Per-file classification produced by the explore pass. Lets later specialists
 * focus their attention (e.g. security ignores `docs`, perf ignores `tests`)
 * and gives the UI a quick "what is this branch doing" map.
 */
export type ChangeKind =
  | 'new-feature'
  | 'refactor'
  | 'bugfix'
  | 'migration'
  | 'config'
  | 'deps'
  | 'test'
  | 'docs'
  | 'style'
  | 'other';

export type BlastRadius = 'local' | 'module' | 'cross-cutting';

export interface ChangeMapEntry {
  file: string;
  kind: ChangeKind;
  blastRadius: BlastRadius;
  note?: string;
}

/**
 * Compact, prompt-friendly representation of findings already produced by
 * earlier passes. Specialists receive this to avoid re-reporting the same
 * issue from a different angle.
 */
export interface FindingIndexEntry {
  file: string;
  startLine: number;
  endLine: number;
  severity: Severity;
  category: Category;
  title: string;
  pass: Finding['pass'];
}

/**
 * Phases used by the orchestrator to group passes for the UI timeline and to
 * decide what context each pass needs. The pipeline goes A → B → C → D → E.
 *  A discovery       — structural + explore (changeMap)
 *  B specialists     — security / performance / accessibility / tests
 *  C consolidation   — local semantic dedupe + clustering (no CLI call)
 *  D completeness    — gaps (sees all findings) + permute (only on critical)
 *  E critique+summary
 */
export type ReviewPhase = 'discovery' | 'specialists' | 'consolidation' | 'completeness' | 'critique';

export interface PassConfig {
  explore: boolean;
  critique: boolean;
  permute: boolean;
  security: boolean;
  performance: boolean;
  tests: boolean;
  accessibility: boolean;
  gaps: boolean;
  structural: boolean;
}

export interface ReviewOptions {
  baseBranch: string;
  headBranch: string;
  depth: ReasoningDepth;
  passes: PassConfig;
  includeUntracked: boolean;
  /** Language Claude should use for user-visible strings in this review. */
  lang: 'en' | 'es';
}

/**
 * Persisted snapshot taken after each completed phase so a review can resume
 * after a CLI failure (network/SSL/timeout) without re-collecting context,
 * re-running the diff, or re-asking Claude for passes that already succeeded.
 *
 * Persisted in workspaceState; bump `version` when the shape changes so old
 * snapshots are ignored on load.
 */
export interface PartialReviewFileEntry {
  path: string;
  content: string;
  reason?: string;
  truncated?: boolean;
}

export interface PartialReviewState {
  version: 1;
  opts: ReviewOptions;
  ctx: ProjectContext;
  conventions: string;
  changedFiles: DiffFile[];
  /** The original git diff text (possibly truncated by maxDiffBytes). */
  rawDiff: string;
  /** Files loaded into the prompt for context (changed-file contents + structural-pass additions). */
  loadedFiles: PartialReviewFileEntry[];
  /** Final string fed to focused passes (file context + raw diff). Rebuilt after structural augments loadedFiles. */
  enrichedDiff: string;
  structuralRisks: string[];
  /** Per-file classification produced by explore; consumed by specialists + UI. */
  changeMap: ChangeMapEntry[];
  stat: { filesChanged: number; insertions: number; deletions: number };
  truncated: boolean;
  /** Passes that finished successfully — these are skipped on resume. */
  completedPasses: string[];
  /** Passes the user chose to skip after a failure — also skipped on resume. */
  skippedPasses: string[];
  /** All findings collected so far (pre-dedupe). */
  findings: Finding[];
  /**
   * Last consolidation summary (count before/after, merge count). Surfaced in
   * the UI tooltip so the user understands why finding counts drop after the
   * consolidation phase.
   */
  lastConsolidation?: { before: number; after: number; merged: number };
  /**
   * Map of pass → reason it was skipped beyond user choice (e.g. permute
   * skipped because there were no critical findings to alternativize). UI
   * tooltips read this.
   */
  conditionalSkips?: Partial<Record<string, string>>;
  startedAt: number;
  /**
   * The list of passes this review was planned to run, in execution order.
   * Used by the UI to compute accurate progress ("2/4 done") and the paused
   * banner's pending count. Derived from opts.passes + conditional gating.
   */
  plannedPasses?: string[];
  /** Human-readable reason the review stopped (last error, or 'cancelled'). */
  pausedReason?: string;
}
