<div align="center">

# Claude Branch Reviewer

**The deepest code review you can get inside VS Code — powered by your local Claude Code CLI.**

No API key. No extra cost. Just your existing Claude subscription.

[![Marketplace](https://img.shields.io/visual-studio-marketplace/v/ajmc90.claude-branch-reviewer?label=Marketplace&logo=visualstudiocode&color=007ACC)](https://marketplace.visualstudio.com/items?itemName=ajmc90.claude-branch-reviewer)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/ajmc90.claude-branch-reviewer?color=007ACC)](https://marketplace.visualstudio.com/items?itemName=ajmc90.claude-branch-reviewer)
[![VS Code](https://img.shields.io/badge/VS_Code-1.85+-blue?logo=visualstudiocode&logoColor=white)](https://code.visualstudio.com/)
[![Claude](https://img.shields.io/badge/Powered_by-Claude_Code_CLI-7c5cff)](https://docs.anthropic.com/en/docs/claude-code)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](#license)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy_me_a_coffee-FFDD00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/ajmc90)

</div>

---

> Reviews **any git branch against any base**, in **any language**, with **multiple reasoning passes** that question themselves, explore alternatives, and anchor every comment to an exact file + line range — with an applicable fix.

<p align="center">
  <img src="https://raw.githubusercontent.com/ajmc90/code-reviewer/main/public/panel-overview.png" alt="Claude Branch Reviewer — full review panel with branch picker, analysis passes, cost pill, executive summary and findings grid" width="100%" />
</p>

<p align="center"><em>The review panel after a run: branch picker, pass selector and cost pill on the left; verdict, summary and filterable findings on the right; sidebar dashboard always visible.</em></p>

## Highlights

- **🔬 Multi-pass reasoning** — five phases (discovery → specialists → consolidation → completeness → critique). The final pass critiques the rest.
- **🧪 Self-critique audit trail** — critique tags every prior finding **keep / revise / drop / merge** with a reason. Dropped/merged ones live under a **Revised** chip instead of vanishing.
- **📍 Pinpoint anchoring** — every finding maps to `file:start-end`; one click jumps to the range. Gutter markers + hover included.
- **🧠 Shows its work** — title, reasoning, open questions, alternatives, evidence quotes and a suggested fix per finding.
- **💰 Pre-flight cost estimate** — a cost pill shows projected **tokens · wall-clock · USD ref** for *this* diff with *these* passes. A `cold / partial / calibrated` badge tells you how trustworthy it is, and a confirmation modal blocks accidental >200K-token runs.
- **📈 Self-calibrating** — every pass records real telemetry; after 5+ runs a per-workspace regression replaces cold-start heuristics so estimates tighten for *your* repo + *your* machine.
- **♻ Session reuse** — passes share a Claude CLI session (`--session-id` / `--resume`), reusing the prompt cache and cutting review cost ~60-70% on large diffs.
- **⏸ Pause, resume & retry** — failed or cancelled reviews snapshot themselves; one-click Resume with per-pass Retry.
- **🔁 Apply Fix preview** — fixes open as a VS Code diff editor; edit the right side, then Apply or Discard from the title bar.
- **🔕 Silence noise** — dismiss findings as "this one" or "this pattern, everywhere"; future matches come back muted with a 🔕 badge, restorable any time.
- **🌐 Bilingual UI** — English/Spanish UI with on-demand per-finding translation (EN/ES chip on each card).
- **🧩 Adapts to your project** — auto-detects language, framework, tests; reads `CLAUDE.md` / `README.md` / `CONTRIBUTING.md` / `ARCHITECTURE.md`.
- **🔐 No API key** — talks to the `claude` CLI you're already logged into.

---

## Install

- **VS Code Marketplace** — search for *“Claude Branch Reviewer”* or [install directly](https://marketplace.visualstudio.com/items?itemName=ajmc90.claude-branch-reviewer).
- **CLI** — `code --install-extension ajmc90.claude-branch-reviewer`

---

## Quick start

```bash
# 1. Install the Claude Code CLI and log in (once)
#    https://docs.anthropic.com/en/docs/claude-code
claude

# 2. Open your repo in VS Code and run:
⌘ ⇧ P  →  "Claude Review: Open Review Panel"
# or press  Cmd+Alt+R  /  Ctrl+Alt+R
```

The review panel opens beside your editor. Pick a base + head, choose which passes to run, hit **Start review**. Findings stream in live.

---

## The review panel

<p align="center">
  <img src="https://raw.githubusercontent.com/ajmc90/code-reviewer/main/public/findings-grid.png" alt="Live activity timeline with per-pass telemetry, plus a findings grid that includes a Revised by Critique section" width="100%" />
</p>

<p align="center"><em>While a review runs, the centre column streams a live timeline (one card per pass with <code>◆ tokens · cache % · cost · duration</code> telemetry); the right column fills with findings, including a <strong>Revised by Critique</strong> section where dropped and merged findings keep their audit trail.</em></p>

The panel is a drag-resizable two-pane layout with a collapsible left rail and an activity-bar sidebar that mirrors progress.

- **Branch picker** — local + remote branches with author / subject / age, fetch & prune in one click, ahead-behind counter, SSH-passphrase prompts handled inline. **Locate** clears the filter and scrolls to the selected base + head in long branch lists.
- **Analysis passes** — pill checkboxes grouped by phase, with presets (*fast*, *deep*, *security focus*, *performance focus*, *accessibility focus*). Selection persists across sessions.
- **Advanced Options** — inline `fast / balanced / deep / obsessive` depth picker, *Session reuse* toggle, *Developer diagnostics* toggle. Each change writes through to `settings.json` and re-runs the cost estimate.
- **Cost pill + confirm modal** — `~95K tokens · ~6 min · $0.45 ref` with a `cold / partial / calibrated` badge; click for a per-pass breakdown. Estimates above ~200K tokens open a confirmation modal with files / lines / driving factors and a "don't ask again under N tokens" opt-out.
- **Live activity** — per-pass timeline (queued → running → done), streaming snippet of Claude's current thinking, inline Retry / Skip / Stop on failure, and a `◆ in=42K (cache 78%) out=1.2K · $0.012 · 8.3s` line per completed pass. Each telemetry chip carries a tooltip explaining the metric and showing the underlying numbers (input/output split, cache hit ratio, CLI-vs-wall time, tool names).
- **Change map** — the explore pass classifies each changed file (`new-feature`, `refactor`, `bugfix`, `migration`, `config`, `deps`, `test`, `docs`, `style`) with a blast-radius badge, surfaced above the findings grid.
- **Executive summary** — verdict, risk score, top concerns, strengths — emitted on completion.
- **Findings grid + filters** — Problem ↔ Solution cards with severity ribbon, category badge, jump-to-code, apply fix, ask follow-up, dismiss/restore, and a per-card EN/ES translation chip. Filter by severity (critical / major / minor / nit / **praise** / silenced / **revised**), category, or free-text search. *Praise* surfaces what the diff did well; *Revised* surfaces critique's audit trail.

### Sidebar dashboard

The activity-bar view is the always-visible companion to the panel: idle / running / paused / failed / done state pill, a live progress card with phase fraction + findings count + elapsed time + Cancel, a paused-review banner with Resume / Discard (flagged when the paused review is on a different branch), the last review's verdict + risk + summary + Export Report, and a history of mini-cards (one per `(base, head)` pair, verdict-tinted strip on the left, up to 5) — click any to rehydrate.

> **Keyboard:** `Cmd/Ctrl + Alt + R` starts a review.

---

## What each pass does

Passes are organized into five phases. The pipeline goes **A → B → C → D → E**.

| Phase | Pass | Focus |
|---|---|---|
| **A · Discovery** | **Structural exploration** | Surveys the diff, identifies hot spots, requests extra files the specialists may need |
| | **Exploration** | Open-ended walk through every changed file — correctness, regressions, integration risk. Emits the per-file change map. |
| **B · Specialists** | **Security** | Prompt / SQL / command / path injection, authn/z, secrets, deserialization, weak crypto |
| | **Performance** | N+1, accidental O(n²), blocking I/O on hot paths, allocations |
| | **Accessibility** | WCAG / ARIA issues for UI changes (auto-skipped if no UI files touched) |
| | **Tests** | Missing coverage, brittle assertions, flaky patterns |
| **C · Consolidation** | *(local, no CLI)* | Semantic dedupe + clustering of findings from earlier passes. Surfaces a "−N merged" badge so the count drop is explained. |
| **D · Completeness** | **Gaps** | Pieces that should exist but don't — error handling, null checks, observability |
| | **Alternatives** | Honest trade-off analysis for non-trivial changes (deep / obsessive depth only; auto-skipped when there are no critical/major findings to alternativize) |
| **E · Critique + summary** | **Self-critique** | Tags every prior finding **keep / revise / drop / merge** with a reason. Dropped + merged ones go to the *Revised* chip (audit trail); revised ones keep a snapshot of what changed. |
| | **Final summary** | Verdict · risk score · executive summary · top concerns · strengths |

Each finding includes a clickable `file:start-end` range, title + description + reasoning, the open questions Claude asked itself, alternatives considered with trade-offs, evidence quotes from the diff, a suggested fix with confidence + replacement code, and a "Related" link when a later pass refines a prior finding. Gutter markers, end-of-line tags and rich hovers are wired in the editor.

<p align="center">
  <img src="https://raw.githubusercontent.com/ajmc90/code-reviewer/main/public/finding-detail.png" alt="Expanded finding card showing Problem, Reasoning, Solution with replacement code, open questions, alternatives, evidence and related files — Advanced Options panel visible on the left" width="100%" />
</p>

<p align="center"><em>An expanded finding: problem → reasoning → solution with the proposed diff and confidence badge, plus open questions, alternatives considered, evidence and related files. The Advanced Options panel (depth, session reuse) sits on the left.</em></p>

### Apply Fix — interactive preview

**Apply Fix** opens a VS Code diff editor (your file on the left, the proposed fix on the right) instead of writing to disk. Edit the right side, then use **Apply this fix** or **Discard fix** from the editor title bar — Claude's suggestion is a starting point, not the final word.

### Silence noise across reviews

Dismissing a finding offers two scopes: **just this finding** (`file:start-end + title`) or **this pattern everywhere** (`category + title`). Future matches return as `severity: 'silenced'` with a 🔕 badge — visible but muted. One-click **Restore** un-silences; the command palette has **Unsilence a Finding…** and **Clear All Silenced Findings** for managing the rule set.

### Self-critique audit trail

Critique emits a decision for every prior finding — **keep**, **revise** (wording / severity / category changed, with a snapshot of the pre-critique version), **drop** (`DROPPED` badge, not load-bearing) or **merge** (`MERGED` badge + link to the survivor). Dropped and merged findings move behind the **Revised** chip rather than vanishing, and the sidebar shows the delta live (`−6 dropped · −4 merged · 2 revised`). Each decision's reason is shown inside the expanded card as **Self-critique's review**.

---

## Cost estimate & calibration

Before you press RUN, the panel preflights the diff (`git diff base...head`) and estimates the cost of *this* diff with *these* passes at *this* depth. The cost pill shows projected **tokens · wall-clock · USD ref** with a confidence badge:

- `cold` — no samples yet, hardcoded coefficients.
- `partial` — 1-4 prior runs, not enough for the regression.
- `calibrated` — 5+ runs; a per-workspace multiplicative correction (clamped 0.4×–2.5×, MAPE-tracked) replaces the cold-start coefficients.

Click the pill for a per-pass breakdown with low / high / worst-case range and the factors driving the estimate. When the headline tokens cross **200K**, RUN opens a confirmation modal with a "don't ask again under N tokens" opt-out that bumps your threshold to the next clean tier (250K / 500K / 1M / 2M / 5M).

<details>
<summary>How the estimator works</summary>

The model accounts for per-pass base prompt (system + JSON contract + instructions), diff context (raw for structural, enriched for the rest), output tokens scaled by depth and by the running prior-findings count, the cache-reuse curve when session reuse is on (`~min(0.85, 0.4 + 0.07·N)` hit ratio at pass N), Haiku-vs-Opus routing overhead, and a variance band (low ×0.7, high ×1.5, worst-case ×2.5).

Every completed pass emits a telemetry record (token buckets, cost, cache split, model breakdown, retries, durations) — `[telemetry]` NDJSON in the output channel plus a ◆ line in the live log. End-of-review aggregates into a sample stored in **workspaceState** (preferred) and **globalState** (fallback). A schema version on each sample drops stale data when coefficients change.

**Debug commands**: `Estimate Review Cost (Debug)` prints the full estimator output without running anything; `Dump Estimator Samples (Debug)` shows what the regression is fitting.

</details>

---

## Session reuse

With session reuse on (default), the orchestrator opens **two** Claude CLI sessions per review — `withTools` (structural pass only) and `noTools` (everything else) — and threads `--session-id` / `--resume` so the prompt cache survives across passes. The CLI reports the saving as cache-read tokens (typically 10× cheaper than fresh input); empirically **~60-70% cost reduction** vs. spawning isolated processes.

If `--resume` ever fails (expired or corrupted session), the orchestrator resets that session and the next pass starts fresh — the review keeps running. Toggle via the Advanced Options panel or `claudeReviewer.useSessionReuse`; disable only if you suspect cross-pass interference.

---

## Reasoning depth

| Depth | Behavior |
|---|---|
| `fast` | Skims for clear bugs only |
| `balanced` | Reads carefully — correctness, security, tests |
| `deep` *(default)* | Reads every changed line; asks "what could go wrong" on each |
| `obsessive` | Enumerates ≥3 failure modes + ≥2 alternatives per change, then self-critiques |

---

## Commands

**Reviews**

| Command | Default keybinding |
|---|---|
| `Claude Review: Open Review Panel` | — |
| `Claude Review: Review Branch vs Base` | `Cmd+Alt+R` / `Ctrl+Alt+R` |
| `Claude Review: Review Current Branch vs main` | — |
| `Claude Review: Review Uncommitted Changes` | — |
| `Claude Review: Cancel Running Review` | — |
| `Claude Review: Resume Paused Review` | — |
| `Claude Review: Retry a Single Pass` | — |
| `Claude Review: Discard Paused Review` | — |
| `Claude Review: Export Review Report (Markdown)` | — |
| `Claude Review: Estimate Review Cost (Debug)` | — |
| `Claude Review: Dump Estimator Samples (Debug)` | — |
| `Claude Review: Clear Review Cache` | — |

**Per-finding actions** *(from the panel, findings tree, or command palette on a selected finding)*

| Command | Default keybinding |
|---|---|
| `Apply Suggested Fix` *(opens preview diff)* | — |
| `Apply this fix` / `Discard fix` *(from the preview's editor title)* | — |
| `Dismiss Finding` *(asks: this one, or this pattern everywhere?)* | — |
| `Restore Silenced Finding` | — |
| `Ask Claude a Follow-Up` *(opens a Claude CLI terminal preloaded with the finding)* | — |

**Silenced findings**

| Command | Default keybinding |
|---|---|
| `Claude Review: Unsilence a Finding…` | — |
| `Claude Review: Clear All Silenced Findings` | — |

**UI**

| Command | Default keybinding |
|---|---|
| `Claude Review: Group Findings by Severity / File / Category` | — |
| `Claude Review: Refresh Findings` | — |
| `Claude Review: Set Panel Language to English / Spanish` | — |

---

## Settings

| Key | Default | Description |
|---|---|---|
| `claudeReviewer.claudeCliPath` | `claude` | Path to the Claude Code CLI binary |
| `claudeReviewer.model` | `""` | Optional `--model` override (`opus`, `sonnet`, …) |
| `claudeReviewer.translationModel` | `""` | Optional `--model` override used only for per-finding on-demand translations (typically a fast/cheap model like `haiku`). Empty = same as `model`. |
| `claudeReviewer.baseBranch` | `""` | Default base branch (auto-detected if empty) |
| `claudeReviewer.reasoningDepth` | `deep` | `fast` / `balanced` / `deep` / `obsessive` |
| `claudeReviewer.passes` | all enabled | Project-level default for which passes run (the panel overrides per review) |
| `claudeReviewer.maxDiffBytes` | `1500000` | Chunk threshold for huge diffs |
| `claudeReviewer.contextFiles` | `[CLAUDE.md, README.md, CONTRIBUTING.md, ARCHITECTURE.md]` | Project docs Claude always reads |
| `claudeReviewer.ignoreGlobs` | sensible defaults | Glob patterns to exclude from the review entirely |
| `claudeReviewer.contextExcludeGlobs` | lockfiles + snapshots | Glob patterns whose **content** is omitted from the prompt context but whose files still appear in the changed-files list. Stops auto-generated content (lockfiles, `__snapshots__`, generated locales) from inflating the prompt without informing the review. Distinct from `ignoreGlobs`. |
| `claudeReviewer.useSessionReuse` | `true` | Reuse the Claude CLI session between passes to share prompt-cache hits. Cuts review cost ~60-70%. Toggleable from the Advanced Options panel. |
| `claudeReviewer.developerDiagnostics` | `false` | Emit a structured per-finding dump (`[devfinding] {...}`) plus per-pass finding summaries to the output channel at end of run, for A/B comparing prompt or cost-saving changes against a baseline. Toggleable from the Advanced Options panel. |
| `claudeReviewer.cliTimeoutMs` | `600000` | Per-pass CLI timeout |
| `claudeReviewer.includeUntrackedFiles` | `false` | Include untracked files in the review |

> **Tip:** The panel's pass-toggle UI overrides `claudeReviewer.passes` for the current review only. Your global default stays untouched.

---

## Requirements

- **VS Code** 1.85+
- **A git repo** open as your workspace
- **Claude Code CLI** installed and authenticated  
  Run `claude` once in a terminal — it'll walk you through login. Anything that works there works here.

---

## Architecture

The codebase is organised into focused modules — no file mixes presentation, business logic and state. Prompts are split per analysis pass (one file per specialist). Webview UIs are bundled from small fragments (each CSS section and each client-JS responsibility in its own file) so the working set stays small. Top-level files inside `core/` are thin compat re-exports; the real code lives one level deeper, grouped by intent (`events/`, `stores/`, `controllers/`, `orchestrator/`).

<details>
<summary>Full source tree</summary>

```text
src/
├── extension.ts                  # VS Code entry: builds runtime, wires deps
├── types.ts                      # Finding / ReviewResult / ProjectContext shapes + isVisibleFinding() predicate
│
├── i18n/
│   ├── index.ts                  # getLang / setLang / t() + language change emitter
│   ├── messages.ts               # compat re-export of ./messages
│   └── messages/
│       ├── index.ts              # exposes Lang + MsgKey union
│       ├── en.ts                 # English dictionary (~390 keys)
│       └── es.ts                 # Spanish dictionary (~400 keys)
│
├── git/
│   ├── gitService.ts             # diff, merge-base, branch enumeration, parser
│   └── sshAuth.ts                # interactive SSH-key unlock
│
├── claude/
│   ├── cliClient.ts              # spawns `claude --print` — no API key; parses usage/cost/modelUsage from the result event and supports --session-id / --resume for session reuse
│   ├── prompts.ts                # compat re-export of ./prompts
│   ├── prompts/
│   │   ├── index.ts              # public prompt API
│   │   ├── shared.ts             # JSON contract, anti-dup block, change map, language directive
│   │   ├── system.ts             # system preamble + extra-context builder
│   │   ├── summary.ts            # final per-result summary prompt
│   │   └── specialists/          # one file per analysis pass
│   │       ├── explore.ts        # exploration + structural exploration prompts
│   │       ├── security.ts
│   │       ├── performance.ts
│   │       ├── accessibility.ts
│   │       ├── tests.ts
│   │       ├── gaps.ts
│   │       ├── permute.ts
│   │       └── critique.ts
│   ├── parser.ts                 # normalises + dedupes Claude's JSON + relates findings (incl. normalizeVerdict — coerces full-sentence verdicts back into the enum)
│   ├── critiqueParser.ts         # parses critique's decision-by-id contract
│   ├── structuralParser.ts       # parses the structural-exploration pass
│   ├── translator.ts             # batched on-demand finding translation
│   └── onDemandTranslator.ts     # extension-side translation orchestration + caching
│
├── context/
│   ├── projectContext.ts         # auto-detect language, frameworks, tools
│   └── fileContext.ts            # per-file context Claude needs + UI-files heuristic
│
├── core/
│   ├── orchestrator.ts           # compat re-export → ./orchestrator/index
│   ├── events.ts                 # compat re-export → ./events/events
│   ├── extensionContext.ts       # compat re-export → ./events/extensionContext
│   ├── partialState.ts           # compat re-export → ./stores/partialState
│   ├── historyStore.ts           # compat re-export → ./stores/historyStore
│   ├── silenceStore.ts           # compat re-export → ./stores/silenceStore
│   ├── reviewController.ts       # compat re-export → ./controllers/reviewController
│   ├── reportMarkdown.ts         # ReviewResult → Markdown export (incl. critique audit section)
│   ├── events/
│   │   ├── events.ts             # live event bus → review panel + sidebar
│   │   └── extensionContext.ts   # ExtensionRuntime interface (shared deps bag)
│   ├── stores/
│   │   ├── partialState.ts       # paused-review state load / save / summarise
│   │   ├── historyStore.ts       # last-N reviews, per-(base, head) index + full results
│   │   └── silenceStore.ts       # persisted dismiss rules + apply-to-findings matcher
│   ├── controllers/
│   │   └── reviewController.ts   # runReview / executeReviewLoop / orchestrator wiring + estimator-sample recording
│   ├── estimator/                # pre-flight cost estimate + per-workspace calibration
│   │   ├── index.ts              # estimateReviewCost() + buildEstimatorInput() — pure pricing math
│   │   ├── coefficients.ts       # per-pass base tokens, output scaling, depth multipliers, Opus 4.7 1M pricing, cache hit curve, variance bands; schema-versioned
│   │   ├── regression.ts         # fits a multiplicative correction (clamped 0.4×-2.5×) from real samples + MAPE diagnostic
│   │   └── sampleStore.ts        # workspaceState + globalState sample arrays (≤20 each), drops samples on coefficient-schema bump
│   └── orchestrator/
│       ├── index.ts              # ReviewOrchestrator class (thin) — wires the metrics accumulator + dev diagnostics
│       ├── types.ts              # OrchestratorDeps + ReviewMetricsSummary
│       ├── errors.ts             # ReviewPausedError
│       ├── state.ts              # bootstrapState / hydrateForResume / computePlannedPasses
│       ├── phaseLoop.ts          # five-phase pipeline driver
│       ├── passRunner.ts         # executePassWithDecisions / runPlannedPass / shouldRun + telemetry emit per pass
│       ├── cli.ts                # runCli / runCliWithTools — bridges to ClaudeCliClient and threads session ids
│       ├── sessionManager.ts     # two-session bundle (withTools / noTools) — UUIDs + initialized flag + reset on resume failure
│       ├── metrics.ts            # PassMetrics shape + effectiveInputTokens (fresh + cacheRead + cacheCreation)
│       ├── telemetry.ts          # emitTelemetry NDJSON + human ◆ line + ReviewMetricsAccumulator
│       ├── devDiagnostics.ts     # [devfinding] / [devhidden] end-of-run dump for A/B comparison (off by default)
│       ├── helpers.ts            # tagPass / stripIdForPrompt / report / checkCancel
│       ├── diffSummarizer.ts     # oversized-diff chunker
│       └── passes/
│           ├── structural.ts     # Phase A: structural exploration
│           ├── explore.ts        # Phase A: open-ended walk + change map
│           ├── specialists.ts    # Phase B: security / performance / a11y / tests
│           ├── consolidation.ts  # Phase C: local semantic dedupe (no CLI)
│           ├── completeness.ts   # Phase D: gaps + alternatives
│           ├── critique.ts       # Phase E: self-critique (keep/revise/drop/merge decisions)
│           ├── summary.ts        # Phase E: final summary + fallback
│           └── runFocused.ts     # shared prompt → CLI → parse helper
│
├── commands/
│   ├── index.ts                  # registerAllCommands(rt, panelDeps)
│   ├── reviewCommands.ts         # show / run / cancel / resume / retry / discard
│   ├── findingCommands.ts        # open / applyFix(+confirm/cancel) / dismiss / restore / ask
│   └── miscCommands.ts           # export / language / groupBy / refresh + estimateReview (debug) + dumpSamples (debug)
│
└── ui/
    ├── reviewPanel.ts            # barrel re-export
    ├── reviewPanel/
    │   ├── index.ts              # ReviewPanel class (lifecycle, message routing, estimate + settings round-trip)
    │   ├── template.ts           # HTML body — includes cost pill + advanced options slot inside run card
    │   ├── client.ts             # compat re-export of ./client/bundle
    │   ├── styles.ts             # compat re-export of ./styles/bundle
    │   ├── branchOps.ts          # branch snapshot + SSH-unlock fetch helper
    │   ├── sanitize.ts           # sanitizePasses (input validation)
    │   ├── client/
    │   │   ├── bundle.ts         # buildClientScript(lang) — stitches the fragments together
    │   │   └── fragments/
    │   │       ├── boot/         # prelude / postlude / i18n bootstrap
    │   │       ├── core/         # state, dedup, passes registry, utils
    │   │       ├── handlers/     # buttons, collapse, DOM, event stream, message router
    │   │       └── renderers/    # branch picker, run card, timeline, findings, change map, counters, rail,
    │   │                         # cost pill (estimate chip + breakdown popover), confirm-run modal,
    │   │                         # advanced options (depth/sessionReuse/devDiag), right-pane state
    │   │                         # (welcome / in-progress / message + sticky in-progress header), …
    │   └── styles/
    │       ├── bundle.ts         # composes the fragments into one stylesheet
    │       └── fragments/        # tokens, layout, two-pane, findings cards, change map, timeline,
    │                             # cost pill, advanced options, right-pane state, unified tooltip (.tip / .tip-host), …
    ├── summaryView.ts            # barrel re-export
    ├── summaryView/
    │   ├── index.ts              # SummaryViewProvider (sidebar dashboard)
    │   ├── render.ts             # pure render functions + renderHtml
    │   ├── styles.ts             # CSS (isolated)
    │   ├── client.ts             # webview JS
    │   ├── types.ts              # SummaryDeps / HistoryEntry / RunState
    │   ├── eventReducer.ts       # pure ReviewEvent → RunState reducer (critique delta included)
    │   └── messageRouter.ts      # webview message dispatch
    ├── findingsTree.ts           # activity-bar tree of findings (visibility-filtered)
    ├── decorations.ts            # gutter + hover + inline tags
    ├── statusBar.ts              # in-progress + counters in the status bar
    └── fixPreview.ts             # claude-fix:// text-document provider for the diff preview
```

</details>

---

## Privacy

This extension **does not send code to any third-party API of its own**. It shells out to the `claude` CLI you've installed locally, which uses Anthropic's services under your own Claude account. State is stored only in VS Code's workspace storage.

---

## Develop locally

This project uses [**pnpm**](https://pnpm.io) as its package manager.

```bash
# Install pnpm if you don't have it yet
npm install -g pnpm        # or: corepack enable && corepack use pnpm@latest

pnpm install
pnpm run compile

# In VS Code, press F5 to launch a development host with the extension loaded.
```

Other useful scripts:

```bash
pnpm run watch    # incremental TypeScript compilation
pnpm run lint     # ESLint over src/
pnpm audit        # check for known vulnerabilities
```

Package as a `.vsix`:

```bash
pnpm run package
code --install-extension claude-branch-reviewer-0.4.0.vsix
```

> **vsce + pnpm quirk:** `vsce publish` invokes `npm ls` under the hood and trips over pnpm's symlinked `node_modules` layout, even though `vsce package` works fine. Package first, then publish the produced `.vsix` explicitly: `npx vsce publish --packagePath claude-branch-reviewer-<version>.vsix`. See [RELEASE.md](RELEASE.md) for the full publish flow.

---

## Support the project ☕

This extension is free, MIT-licensed and has no backend of its own — your Claude subscription does all the work. If it caught a bug before review did or saved you an hour of "what is this PR even doing", consider buying me a coffee.

<p align="center">
  <a href="https://buymeacoffee.com/ajmc90">
    <img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=☕&slug=ajmc90&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff" alt="Buy me a coffee" />
  </a>
</p>

Stars on GitHub and Marketplace reviews are also a free way to help — they make the project visible to other devs.

---

## License

MIT.
