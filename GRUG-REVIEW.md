# Grug Brain Review of Claude Code Reviewer

> grug read entire codebase. grug not big brain. but grug see things. grug share wisdom.
> grug review with love. club is metaphorical.

**Date:** 2026-05-14
**Reviewed by:** grug (channeled through Claude)
**Codebase:** `code-reviewer` VS Code extension (~2,800 lines across 17 files)

---

## Overall Impression

grug see ambitious project. multi-pass code review with live UI, streaming events, SSH auth, branch picking. grug respect ambition. but grug also see complexity demon has been invited in through several doors. grug will point at doors.

**Verdict:** good bones, complexity demon nesting in specific spots. most fixable without big rewrite.

---

## Findings by Module

### 1. `extension.ts` — The God Activate Function

**Severity:** 🟡 Major complexity smell
**Location:** `src/extension.ts` (420 lines)

grug see 420-line `activate()` function. grug heart hurt. this one function:
- creates 6 UI objects
- registers 10+ commands with inline handlers
- defines `runReview()` (90 lines) as nested function
- defines `buildCli()`, `buildOrchestrator()`, `pickBranch()` as closures
- manually spreads 9 boolean pass config fields with `??` fallbacks

**what grug do instead:**
- extract command handlers to separate file (`commands.ts`)
- extract `runReview()` to own module — it is a workflow, not a command registration detail
- the pass config spreading (lines 146-156) is begging for `Object.fromEntries` or a defaults helper
- `renderReportMarkdown()`, `stripFinding()`, `escapeHtml()` at bottom of file — these not extension concerns, move to `utils/`

**grug principle:** *"locality of behavior is good, but 420 lines of behavior in one function is not locality, that is crowd"*

---

### 2. `orchestrator.ts` — The 270-Line Method

**Severity:** 🟡 Major complexity smell
**Location:** `src/core/orchestrator.ts:42-308`

grug see `review()` method is 270 lines. grug need scroll many times. inside grug find:
- token budget math
- structural exploration pass with try/catch
- file context loading
- 8 sequential pass invocations with `if` guards
- dedup + summary generation

the inner `runPass()` function (lines 153-200) is 50 lines capturing 6 closures. grug understand WHY it exist — avoid repeating pass boilerplate. but function-inside-function-capturing-closures is where complexity demon whisper.

**what grug do instead:**
- `runCli()` and `runCliWithTools()` are 95% identical (lines 367-404). merge into one: `runCli(prompt, pass, tools?: string[])`. grug hate copy-paste with one param difference.
- extract pass execution to a loop over a pass registry. each pass is `{ name, guard, buildPrompt }`. orchestrator just iterates.
- the budget math (lines 97-110) could be its own function `computeContextBudget()`

**grug principle:** *"grug know that 270-line method means grug cannot hold whole thing in head. if grug cannot hold in head, bug will hide there"*

---

### 3. `cliClient.ts` — Three Truths Are Two Too Many

**Severity:** 🟠 Moderate complexity, well-documented
**Location:** `src/claude/cliClient.ts:46-186`

grug see `run()` is 140-line Promise constructor. grug flinch. but then grug read comments and understand: Claude CLI emits text in THREE overlapping forms, and client must pick one. the complexity here is ESSENTIAL — it comes from Claude CLI's stream-json protocol.

grug respect the comment block (lines 72-80) explaining the duplication bug. this is good. this is wisdom earned through pain.

**still, grug notice:**
- the `handleStreamEvent()` function (75 lines, lines 213-288) is a big switch on event types. this fine for now — grug not reach for visitor pattern. but if more event types come, consider a dispatch map.
- `proc.on('close')` handler (lines 142-175) has the source-of-truth selection logic mixed with error handling. could extract `pickSourceOfTruth(resultText, assistantText, streamedText)` — small, testable, pure.

**grug principle:** *"sometimes complexity come from outside. grug accept, but grug document WHY. this code do that. grug approve with minor grumble."*

---

### 4. `parser.ts` — The Hand-Rolled JSON Extractor

**Severity:** 🟢 Necessary complexity, well-structured
**Location:** `src/claude/parser.ts`

grug see `extractBalancedObjects()` — a manual char-by-char JSON brace balancer. grug first reaction: "why not use library?" but then grug think... Claude output is NOT valid JSON. it has markdown fences, prose, smart quotes. no library handle this.

the fallback chain is good engineering:
1. fenced code block
2. balanced objects scored by likelihood
3. first-to-last brace

`scoreReviewLikelihood()` is clever. grug approve.

**one concern:** `normalizeFinding()` ID generation uses `Date.now()` + `Math.random()`. for dedup key this fine. but if findings ever need to be stable across re-parses, this break. grug mention, not insist.

**grug principle:** *"grug approve parser. complexity here is earned. parser must be paranoid because LLM output is chaos."*

---

### 5. `prompts.ts` — The Prompt Factory

**Severity:** 🟡 Moderate complexity smell
**Location:** `src/claude/prompts.ts`

grug see 9 prompt builder functions. each one:
1. calls `buildSystemPreamble()`
2. adds pass-specific instructions
3. appends full diff (potentially 1.5MB)
4. appends `JSON_CONTRACT`

**what worry grug:**
- every pass gets the FULL `enrichedDiff`. for a big branch, that is 1.5MB × 9 passes. that is a lot of tokens. a LOT of money. grug wallet hurt.
- no validation that prompt fits in context window. if diff too big + file context too big, Claude just... truncates? errors? grug not know. that scary.
- the builders have duplicated structure: system preamble + specific instructions + diff + contract. a `buildPassPrompt({ pass, instructions, extras })` helper would reduce 9 functions to 1 + config.

**what grug do instead:**
- add a `warnIfPromptTooLarge(prompt, maxChars)` guard
- consider pass-specific diff slicing (security pass only needs security-relevant files, not the CSS changes)

**grug principle:** *"grug not know how many tokens cost. but grug know that sending 1.5MB nine times is not what grug ancestors would do."*

---

### 6. `gitService.ts` + `sshAuth.ts` — The Git Layer

**Severity:** 🟢 Mostly clean, one concern
**Location:** `src/git/gitService.ts`, `src/git/sshAuth.ts`

grug like `GitService`. methods are focused. `exec()` has buffer protection. `parseUnifiedDiff()` is a clean state machine.

**grug concern #1:** `globMatch()` (line 266) is hand-rolled glob-to-regex. handles `**`, `*`, `?` but NOT `{a,b}` or `[abc]`. this fine if globs are simple ignore patterns. but if user puts `{src,lib}/**` in `ignoreGlobs` config, it silently fail. grug say: add comment documenting limitations, or use `minimatch`/`picomatch` (tiny, well-tested).

**grug concern #2:** `sshAuth.ts` writes passphrase to temp file (line 101). file has `mode: 0o600` — good. cleanup happens in `finally`-style callback — good. but if process crashes between write and cleanup, passphrase stays on disk. grug not have better solution, but grug want this documented as known risk.

**grug concern #3:** `fs.readdirSync(root)` in `projectContext.ts` for .NET and Swift detection (lines 97, 127). if workspace root has 50,000 files, this blocks extension host. could use `glob` with depth limit instead.

**grug principle:** *"gitService is what grug aspire to. focused methods, clear names, buffer limits. grug give approving grunt."*

---

### 7. UI Layer — The Inline HTML Empire

**Severity:** 🔴 Biggest complexity demon nest
**Location:** `src/ui/reviewPanel.ts` (~800 lines), `src/ui/summaryView.ts` (339 lines)

grug must speak truth. `reviewPanel.ts` is ~800 lines of TypeScript containing:
- ~350 lines of inline CSS in template literal
- ~250 lines of inline JavaScript in template literal
- branch picker, pass selector, live timeline, findings grid, filter system
- SSH unlock flow
- drag-to-resize gutter logic

this is biggest complexity demon nest in codebase. grug understand WHY — VS Code webview API requires sending HTML as string. but:

**what grug do instead:**
- extract CSS to a `.css` file, read it with `fs.readFileSync` at build time or use `webview.asWebviewUri()`
- extract the webview JS to a separate `.js` file bundled alongside
- split the panel into logical parts: `branchPicker.ts`, `passSelector.ts`, `findingsGrid.ts`, `timeline.ts` — each producing an HTML fragment
- the `summaryView.ts` has 180 lines of CSS that overlaps 80% with `reviewPanel.ts`. shared stylesheet would cut duplication

**what is fine:**
- `decorations.ts` (159 lines) — clean, focused, grug approve
- `findingsTree.ts` (124 lines) — clean tree provider, grug approve
- `statusBar.ts` (106 lines) — nice dot visualization, grug approve with smile
- `summaryView.ts` logic (excluding CSS) — fine

**grug principle:** *"grug understand constraint of VS Code webview. but 800 lines of three languages in one template literal is not constraint — that is giving up. grug have seen this movie before. it end with 'nobody want to touch that file'."*

---

### 8. `types.ts` — The Type Layer

**Severity:** 🟢 Clean, one minor note
**Location:** `src/types.ts`

grug like centralized types. `Finding` has 17 fields — grug think that many, but code review IS complex domain. each field earn its place.

**minor note:** `PassConfig` has 9 booleans. when you add a pass, you must update: PassConfig, extension.ts defaults, orchestrator.ts pass invocations, prompts.ts builder, events.ts PassName, statusBar.ts PASS_ORDER. that is 6 places. a pass registry pattern would make this 1 place.

**grug principle:** *"types good. types prevent bug. grug approve."*

---

## Summary: Where Complexity Demon Lives

| Location | Severity | Issue | Grug Fix |
|---|---|---|---|
| `extension.ts` activate() | 🟡 Major | 420-line god function | Split into commands + workflow modules |
| `orchestrator.ts` review() | 🟡 Major | 270-line method, duplicate runCli methods | Merge CLI methods, extract pass loop |
| `reviewPanel.ts` | 🔴 Critical | 800 lines, 3 languages in 1 template literal | Extract CSS/JS files, split panel components |
| `prompts.ts` | 🟡 Moderate | 9 similar builders, no size validation | Generic builder + prompt size guard |
| `gitService.ts` globMatch | 🟢 Minor | Hand-rolled glob missing features | Document limits or use picomatch |
| `projectContext.ts` | 🟢 Minor | Sync readdirSync on root | Use async with depth limit |
| `cliClient.ts` | 🟢 Minor | 140-line Promise constructor | Extract source-of-truth picker |
| `types.ts` | ✅ Clean | — | — |
| `parser.ts` | ✅ Clean | Earned complexity | — |
| `decorations.ts` | ✅ Clean | — | — |
| `findingsTree.ts` | ✅ Clean | — | — |
| `statusBar.ts` | ✅ Clean | — | — |
| `structuralParser.ts` | ✅ Clean | — | — |

## Cross-Cutting Concerns

1. **No tests.** grug notice zero `.spec.ts` or `.test.ts` files. parser, git service, prompt builders — all pure-function-heavy and very testable. grug say: parser and gitService deserve integration tests at minimum. *"grug not mass fan of unit test, but parser that handle LLM chaos? that NEED test."*

2. **Pass registry.** adding a new review pass requires touching 6+ files. a single pass registry (`{ name, guard, promptBuilder, passName }[]`) would make this one-file change.

3. **Shared UI styles.** reviewPanel and summaryView duplicate ~80% of CSS variables and component styles. extract to shared stylesheet.

4. **Error boundaries.** if Claude returns garbage that parser can't handle, the finding count is 0 and a warning logs. good. but user sees "0 findings" with no explanation in the panel. consider a "parse warnings" section.

---

---

## Execution Plan

> **This section is machine-readable.** Hand this entire document to an AI coding assistant and say: *"Execute the grug review plan, phase by phase."* Each task has exact files, what to do, and acceptance criteria.

### Phase 1 — Quick Wins (Small effort, no architecture changes)

These are safe, isolated refactors. Each can be a single commit. No tests break because there are no tests.

#### Task 1.1: Merge duplicate `runCli` methods
- **File:** `src/core/orchestrator.ts`
- **What:** `runCli()` (lines 387-404) and `runCliWithTools()` (lines 367-385) are 95% identical. Merge into one method: `private async runCli(prompt: string, pass: PassName, allowedTools?: string[]): Promise<string>`
- **How:** Copy `runCliWithTools`, add `allowedTools?: string[]` param, pass it to `cli.run()`. Delete the old `runCli()`. Update the 2 call sites: structural pass uses `['Read', 'Grep', 'Glob']`, all other passes use `undefined`.
- **Done when:** Single `runCli` method, both call patterns work, no behavior change.

#### Task 1.2: Extract utility functions from `extension.ts`
- **Create:** `src/utils/formatting.ts`
- **Move from `src/extension.ts`:**
  - `escapeHtml()` (line 355)
  - `stripFinding()` (line 350)
  - `renderReportMarkdown()` (lines 359-420)
- **Update imports** in `extension.ts` to use new module.
- **Done when:** `extension.ts` imports from `utils/formatting.ts`, functions work identically.

#### Task 1.3: Extract `pickSourceOfTruth` from CLI client
- **File:** `src/claude/cliClient.ts`
- **What:** Extract lines 156-170 (the `result > assistant > stream > empty` selection) into a pure function:
  ```typescript
  function pickSourceOfTruth(
    resultText: string,
    assistantText: string,
    streamedText: string[]
  ): { text: string; source: 'result' | 'assistant' | 'stream' | 'empty' }
  ```
- **Done when:** Pure function exists, `proc.on('close')` handler calls it, same behavior.

#### Task 1.4: Simplify pass config defaults in `extension.ts`
- **File:** `src/extension.ts`, lines 126-158
- **What:** Replace 9 manual `overridePasses?.X ?? passesCfg.X ?? true` lines with:
  ```typescript
  const DEFAULT_PASSES: PassConfig = { structural: true, explore: true, critique: true, permute: true, security: true, performance: true, tests: true, accessibility: true, gaps: true };
  const finalPasses = { ...DEFAULT_PASSES, ...passesCfg, ...overridePasses };
  ```
- **Done when:** Pass config built in 3 lines instead of 12, same behavior.

---

### Phase 2 — Structural Refactors (Medium effort, improves maintainability)

These change file boundaries. Do them in order.

#### Task 2.1: Create pass registry
- **Create:** `src/core/passRegistry.ts`
- **Define:**
  ```typescript
  export interface PassDefinition {
    name: PassName;
    label: string;
    shortLabel: string;          // for status bar
    guard: (opts: ReviewOptions, ctx: { uiFiles: string[] }) => boolean;
    buildPrompt: (args: PassPromptArgs) => string;
    tools?: string[];            // if pass needs CLI tools (structural)
    replaceAll?: boolean;        // critique pass replaces all findings
  }
  export const PASS_REGISTRY: PassDefinition[] = [ ... ];
  ```
- **Migrate:** Move pass definitions from orchestrator's `if` chain + prompts builders + `PASS_ORDER`/`PASS_SHORT` from statusBar into this single registry.
- **Update these files to consume registry:**
  - `src/core/orchestrator.ts` — replace 8 `if (opts.passes.X)` blocks with `for (const pass of PASS_REGISTRY)`
  - `src/ui/statusBar.ts` — derive `PASS_ORDER` and `PASS_SHORT` from registry
  - `src/core/events.ts` — derive `PassName` type from registry
  - `src/extension.ts` — derive `PassConfig` defaults from registry
- **Done when:** Adding a new pass = adding one object to `PASS_REGISTRY`. No other files need changes.

#### Task 2.2: Extract command handlers from `extension.ts`
- **Create:** `src/commands/reviewCommands.ts` and `src/commands/findingCommands.ts`
- **Move:**
  - `reviewCommands.ts`: `reviewBranch`, `reviewCurrentBranch`, `reviewChangedFiles`, `exportReport`, `clearCache`
  - `findingCommands.ts`: `openFinding`, `applyFix`, `dismissFinding`, `askFollowUp`
- **Each command** exported as `(deps: CommandDeps) => (...args) => Promise<void>` where `CommandDeps` holds shared state (lastResult, setResult, buildCli, etc.)
- **`extension.ts` becomes:** create deps → register commands → done. Target: under 80 lines.
- **Done when:** `activate()` is under 80 lines, all commands still work.

#### Task 2.3: Extract `runReview` workflow
- **Create:** `src/core/reviewWorkflow.ts`
- **Move:** `runReview()` function (currently lines 102-195 of `extension.ts`) into this module.
- **Signature:** `export async function runReview(opts, deps: WorkflowDeps): Promise<void>` where deps = `{ getWorkspaceRoot, buildOrchestrator, setResult, bus, context, panelDeps }`
- **Done when:** `extension.ts` doesn't contain review logic, workflow is independently testable.

#### Task 2.4: Generic prompt builder
- **File:** `src/claude/prompts.ts`
- **What:** Create `buildPassPrompt(args: { preamble, passInstructions: string, diff, contract, extras? })` that all 9 builders delegate to.
- **Keep** individual builder functions as thin wrappers (for pass-specific extras like `structuralRisks`, `uiFiles`, `priorFindingsJson`).
- **Add:** `warnIfPromptTooLarge(prompt: string, maxChars: number, log: Logger): void` — logs warning if prompt exceeds ~800K chars (~200K tokens).
- **Done when:** Each builder is <15 lines, prompt size gets a warning log.

---

### Phase 3 — UI Decomposition (Large effort, biggest impact on maintainability)

This is the biggest refactor. `reviewPanel.ts` is the #1 complexity demon.

#### Task 3.1: Extract shared webview styles
- **Create:** `src/ui/webview/shared.css`
- **Extract:** CSS variables (`:root { --s-1, --sev-critical, ... }`), reset, button styles, `.btn`, `.chip`, `.counter`, `.verdict` — shared between `reviewPanel.ts` and `summaryView.ts`.
- **Both panels** load this CSS via `webview.asWebviewUri()` or inline it from `fs.readFileSync` at activation.
- **Done when:** Shared CSS in one file, both views use it, no visual changes.

#### Task 3.2: Extract reviewPanel CSS and JS
- **Create:** `src/ui/webview/reviewPanel.css` and `src/ui/webview/reviewPanel.js`
- **Move:** ~350 lines of CSS and ~250 lines of JS out of the template literal in `reviewPanel.ts`.
- **Load:** Use `fs.readFileSync` at panel creation (or bundle with esbuild).
- **`reviewPanel.ts`** keeps only: TypeScript class, HTML template (referencing external CSS/JS), message handling.
- **Done when:** `reviewPanel.ts` is under 300 lines. CSS/JS are separate files.

#### Task 3.3: Split reviewPanel HTML into fragments
- **Create:** `src/ui/webview/fragments/` with:
  - `branchPicker.ts` — `export function renderBranchPicker(): string`
  - `passSelector.ts` — `export function renderPassSelector(): string`
  - `timeline.ts` — `export function renderTimeline(): string`
  - `findingsGrid.ts` — `export function renderFindingsGrid(): string`
- **`reviewPanel.ts`** composes: `html = header + branchPicker() + passSelector() + timeline() + findingsGrid()`
- **Done when:** Each fragment is independently readable, panel still works.

#### Task 3.4: Extract summaryView CSS
- **File:** `src/ui/summaryView.ts`
- **What:** Move inline CSS (~180 lines) to `src/ui/webview/summaryView.css`, importing shared styles from Task 3.1.
- **Done when:** `summaryView.ts` is under 120 lines.

---

### Phase 4 — Quality Gate (Medium effort, prevents regressions)

No refactoring phase should happen without tests to catch regressions.

#### Task 4.1: Parser tests
- **Create:** `src/claude/parser.spec.ts`
- **Test cases:**
  - `extractJson()` with: fenced JSON, fenced code (no json tag), bare JSON in prose, multiple JSON objects (pick review-like one), smart quotes, trailing commas, empty input, no JSON at all
  - `parseClaudeOutput()` with: valid review JSON, partial findings, missing fields (normalization), completely unparseable text
  - `dedupeFindings()` with: exact dupes, same location different titles, different severities (keep highest)
  - `normalizeFinding()` with: missing startLine, out-of-range values, missing severity (defaults to minor)
- **Done when:** `vitest run src/claude/parser.spec.ts` passes, covers all branches of `extractJson`.

#### Task 4.2: Git service tests
- **Create:** `src/git/gitService.spec.ts`
- **Test cases:**
  - `parseUnifiedDiff()` with: single file add, multi-file modify, rename, delete, binary file, empty diff
  - `shouldIgnore()` / `globMatch()` with: `**/*.test.ts`, `node_modules/**`, `*.lock`, edge cases like `{a,b}` (document that it doesn't work)
  - `detectDefaultBaseBranch()` — mock `listBranches` to test priority order
- **Done when:** `vitest run src/git/gitService.spec.ts` passes.

#### Task 4.3: Prompt builder tests
- **Create:** `src/claude/prompts.spec.ts`
- **Test cases:**
  - Each builder produces string containing `JSON_CONTRACT`
  - `buildSystemPreamble()` includes project context fields
  - `buildExplorePrompt()` includes structural risks when provided
  - `warnIfPromptTooLarge()` logs warning above threshold, silent below
- **Done when:** `vitest run src/claude/prompts.spec.ts` passes.

#### Task 4.4: Document `globMatch` limitations
- **File:** `src/git/gitService.ts`, above `globMatch()` function
- **Add comment:**
  ```typescript
  /**
   * Simple glob matcher. Supports: **, *, ?
   * Does NOT support: {a,b} alternation, [abc] character classes.
   * For full glob support, consider picomatch.
   */
  ```
- **Done when:** Comment exists, or replaced with `picomatch` (either acceptable).

#### Task 4.5: Add `projectContext` async safety
- **File:** `src/context/projectContext.ts`, lines 97 and 127
- **What:** Replace `fs.readdirSync(root).some(f => f.endsWith('.csproj'))` with a targeted glob or `fs.existsSync` on known paths. Same for Swift `.xcodeproj` detection.
- **Alternative:** Wrap in try/catch with timeout — if `readdirSync` blocks >500ms on huge directory, skip that detection.
- **Done when:** No unbounded `readdirSync(root)` calls remain.

---

### Phase Dependency Graph

```
Phase 1 (all tasks independent, can parallelize)
    │
    ▼
Phase 2.1 (pass registry) ──► Phase 2.2 + 2.3 + 2.4 (can parallelize)
    │
    ▼
Phase 3.1 (shared CSS) ──► Phase 3.2 + 3.4 (can parallelize) ──► Phase 3.3
    │
    ▼
Phase 4 (tests — can start alongside Phase 2, cover refactored code)
```

### Effort Estimates

| Phase | Tasks | Estimated Effort | Risk |
|-------|-------|-----------------|------|
| Phase 1 | 4 tasks | ~1-2 hours | Very low — isolated changes |
| Phase 2 | 4 tasks | ~3-5 hours | Low — file moves + registry pattern |
| Phase 3 | 4 tasks | ~4-6 hours | Medium — UI refactor, visual regression possible |
| Phase 4 | 5 tasks | ~2-3 hours | Very low — additive, no behavior change |

**Total:** ~10-16 hours of focused work. Can be spread across multiple sessions.

---

### How to Use This Plan with AI

1. **Start a session:** paste this document and say *"Execute Phase 1"*
2. **AI reads tasks,** opens exact files, makes exact changes
3. **After each phase:** verify the codebase compiles (`npm run build`)
4. **Phase 4 (tests):** run `npx vitest run` to verify
5. **Between phases:** commit. Each phase is a clean commit boundary.

> grug done. grug tired from reading 2,800 lines. grug need rest and think about simpler times.
> but grug want to say: this is good project. bones are solid. patterns are mostly right.
> complexity demon has crept in through the UI layer and the god-functions.
> club them out, and this codebase will be one grug is proud to work in.
>
> *"perfection is not when there is nothing left to add, but when there is nothing left to take away"*
> — not grug, but grug agree
