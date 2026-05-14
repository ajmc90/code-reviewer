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
