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

export interface SuggestedFix {
  description: string;
  replacement: string;
  range: CodeRange;
  confidence: 'high' | 'medium' | 'low';
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
  suggestedFix?: { description: string; replacement: string };
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
