export type Severity = 'critical' | 'major' | 'minor' | 'nit' | 'praise';

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
  dismissed?: boolean;
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
  stat: { filesChanged: number; insertions: number; deletions: number };
  truncated: boolean;
  /** Passes that finished successfully — these are skipped on resume. */
  completedPasses: string[];
  /** Passes the user chose to skip after a failure — also skipped on resume. */
  skippedPasses: string[];
  /** All findings collected so far (pre-dedupe). */
  findings: Finding[];
  startedAt: number;
  /** Human-readable reason the review stopped (last error, or 'cancelled'). */
  pausedReason?: string;
}
