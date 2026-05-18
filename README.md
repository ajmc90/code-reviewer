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
  <img src="https://raw.githubusercontent.com/ajmc90/code-reviewer/main/public/panel-overview.png" alt="Claude Branch Reviewer — review panel" width="100%" />
</p>

## Highlights

- **🔬 Multi-pass reasoning** — five phases (discovery → specialists → consolidation → completeness → critique), each with a job. The final pass critiques the rest.
- **🧪 Self-critique with an audit trail** — the critique pass labels every prior finding **keep / revise / drop / merge** with an explicit reason. Dropped and merged findings don't vanish silently: they live under a dedicated **Revised** chip with the reasoning, so you can second-guess critique instead of trusting it blindly.
- **📍 Pinpoint anchoring** — every finding maps to `file:start-end`. One click jumps to the exact range.
- **🧠 Shows its work** — title, reasoning, questions raised, alternatives considered, evidence quotes, suggested fix.
- **🎨 Modern review panel** — toggleable passes, severity + category filters, drag-resizable layout, collapsible sidebar, sidebar dashboard for at-a-glance status.
- **⏸ Pause & resume** — if a pass fails or you cancel, the review snapshots itself and offers a one-click Resume with per-pass Retry.
- **🔁 Apply Fix preview** — every suggested fix opens as a VS Code diff editor. Edit the right side, then Apply or Discard from the editor title.
- **🔕 Silence noise** — dismiss findings as "this exact one" or "this pattern, everywhere". Future reviews demote matches to a `silenced` badge instead of nagging again. Restore any rule from the picker.
- **🌐 Bilingual UI** — full English/Spanish UI with on-demand per-finding translation (each card has its own EN/ES chip).
- **💰 Pre-flight cost estimate** — before you press RUN, a cost pill shows projected **tokens · wall-clock · USD reference** for the exact diff + passes + depth you've picked. Click it for a per-pass breakdown. A confirmation modal pops up when the estimate crosses ~200K tokens so a heavy review never starts by accident.
- **📈 Self-calibrating estimator** — each completed pass records real token / cost / wall-clock telemetry. After 5+ runs in a workspace, a per-workspace regression replaces the cold-start heuristics — the estimate gets noticeably tighter for *your* repo + *your* machine. A `cold / partial / calibrated` badge on the pill tells you which mode it's in.
- **♻ Session reuse** — passes share a Claude CLI session (`--session-id` / `--resume`) so the cached prompt context isn't paid for on every pass. Cuts review cost ~60-70% on large diffs. Toggleable from the Advanced Options panel.
- **⚙ Advanced Options panel** — depth (`fast / balanced / deep / obsessive`), session reuse, and developer diagnostics live inline next to the pass selector with the trade-off explained per option. Changes update settings.json and the cost estimate live.
- **🧩 Adapts to your project** — auto-detects language, framework, tests, and reads `CLAUDE.md` / `README.md` / `CONTRIBUTING.md` / `ARCHITECTURE.md`.
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

A second-screen-worthy UI built into VS Code.

<p align="center">
  <img src="https://raw.githubusercontent.com/ajmc90/code-reviewer/main/public/findings-grid.png" alt="Findings grid with severity ribbons and filters" width="100%" />
</p>

| Area | What it gives you |
|---|---|
| **Branch picker** | Local + remote branches, filterable, with last author / subject / age. Fetch & prune with one click; ahead/behind counter. SSH-passphrase prompts handled inline. |
| **Analysis passes** | Pill checkboxes grouped by phase (Discovery, Specialists, Completeness, Critique). Presets — *fast*, *deep*, *security focus*, *performance focus*, *accessibility focus* — flip the right set with one click. Per-pass tooltips explain what each does. Advanced toggle hides the granular controls when you don't need them. Selection persists across sessions. |
| **Advanced Options** | Lives inside the same *Advanced* collapsible: a segmented `fast / balanced / deep / obsessive` depth picker, a *Session reuse* toggle (`~60-70% cheaper`), and a *Developer diagnostics* toggle. Every change writes through to `settings.json` and re-runs the cost estimate so the pill stays in sync. |
| **Cost pill** | Above the RUN button: `~95K tokens · ~6 min · $0.45 ref` with a `cold / partial / calibrated` confidence badge. Click for a per-pass breakdown popover (tokens per pass + low / high / worst-case range + the human-readable factors driving the estimate: depth, session reuse, sample-count corrections). Auto-positions up or down depending on viewport space. |
| **Confirm-large-run modal** | When the estimate crosses ~200K tokens, pressing RUN opens a modal: headline tokens + range, "what's in this review" (files / lines / driving factors), subscription-cost disclaimer, and a "don't ask again under N tokens" checkbox that bumps your personal threshold to the next clean tier (250K / 500K / 1M / 2M / 5M). Escape, click-outside, or Cancel back out cleanly. |
| **Run card** | Sticky bottom card summarizes branches + active passes. One ▶ button covers Start / Stop. Live progress chips during a run: phase, findings found, elapsed time. The log lives collapsed inside the run card as an audit trail. |
| **Welcome surface** | When idle and no findings exist, the right pane shows the welcome panel: branches + diff preview + estimate, the four-phase pipeline cards, a big RUN proxy of the left button, the `Cmd+Alt+R` shortcut, a privacy reminder, and a daily-rotating tip. |
| **In-progress surface** | While the review is running and no findings have arrived yet, the right pane shows the in-progress panel: live tokens spent, files reviewed (with kind + blast-radius chips), elapsed time, animated skeleton placeholders. Once findings start arriving, a sticky progress header above the findings grid keeps those live signals visible. |
| **Live activity** | Real-time timeline of each pass: queued → running → done, with elapsed time, a streaming snippet of what Claude is thinking, and inline Retry / Skip / Stop on failure. Each completed pass also drops a `◆ $0.0123 in=42K (cache 78%) out=1.2K 8.3s` telemetry line so the cost shape is visible without opening the output channel. |
| **Change map** | When the explore pass classifies each changed file (`new-feature`, `refactor`, `bugfix`, `migration`, `config`, `deps`, `test`, `docs`, `style`) with a blast-radius badge, the panel surfaces it as a collapsible map above the findings grid. |
| **Log** | Raw streaming output, severity-colored. Collapsed inside the run card by default — toggle to expand. Copy or clear. |
| **Executive summary** | Verdict, risk score, top concerns, strengths — emitted once the review finishes. Verdict strings the model occasionally writes as full sentences (`"DO NOT MERGE…"`) get normalized into the badge enum so the sidebar layout never breaks. |
| **Findings grid** | Problem ↔ Solution cards. Severity ribbon, category badge, jump-to-code, apply fix, ask follow-up, dismiss / restore. Per-card EN/ES chip translates that finding on demand. "Related" badges link refinements back to their original finding. |
| **Filters** | Severity chips (critical / major / minor / nit / **praise** / silenced / **revised**) + category chips (security, accessibility, performance, …) with live counts + free-text search. Combine freely. *Praise* is a positive-signal severity — Claude calls out things the diff did well (good test coverage, clean abstractions, careful error handling) so the review isn't only negative. The *Revised* chip surfaces critique's audit trail; on the **All** filter, silenced + revised findings drop below a labeled separator so the main severity flow stays focused. |
| **Collapse + resize** | Click ‹ to collapse the left pane into a vertical rail showing branches, current pass, spinner, and live severity counts. Drag the gutter between panes to resize (or `←/→` while focused, `Home/End` for min/max, dbl-click to reset). Width and collapse state persist. |

### Sidebar dashboard

A second view lives in the activity-bar sidebar — the "always visible" companion to the big panel.

- **At-a-glance state** — idle / running / paused / failed / done, with a colored brand pill.
- **Live progress card** — phase fraction (e.g. `2/4 passes`), current pass label, live findings count, elapsed time. Cancel button included.
- **Paused review banner** — when a review stopped mid-flight, the banner shows completed / skipped / pending counts and offers **Resume** + **Discard**. Highlights when the paused review is from a different branch than your current checkout.
- **Last review summary** — branch pair, verdict, risk, severity chips, executive summary, top concerns, strengths, and **Export Report**.
- **History** — the most recent review for each `(base, head)` branch pair, up to 5 entries total. Click any row to rehydrate that review back into the panel + tree + decorations.

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

Each finding includes:

- `file` + `startLine` + `endLine` (clickable → editor jumps to the range)
- **Title**, **description**, **reasoning** ("why is this a problem")
- **Questions Claude asked itself** at this spot
- **Alternatives considered**, with trade-offs
- **Evidence** — direct quotes from the diff
- **Suggested fix** with confidence and replacement code
- **"Related" link** when a later pass refines a prior finding instead of duplicating it
- Gutter markers + end-of-line tags + rich hover

<p align="center">
  <img src="https://raw.githubusercontent.com/ajmc90/code-reviewer/main/public/finding-detail.png" alt="Expanded finding card showing Problem on the left and Solution on the right" width="100%" />
</p>

### Apply Fix — interactive preview

Hitting **Apply Fix** on a finding doesn't write to disk immediately. Instead it opens a VS Code diff editor: your file on the left, the proposed fix on the right. You can **edit the right side** before applying — Claude's suggestion is a starting point, not a final answer. The editor title gets two actions:

- **Apply this fix** — writes the right-pane contents to the real file and closes the diff.
- **Discard fix** — closes the preview without touching anything.

### Silence noise across reviews

Findings you dismiss are remembered. The dismiss popup offers two scopes:

- **Silence just this finding** — matches by `file:start-end + title`. Subsequent reviews demote the same finding at the same location.
- **Silence this pattern everywhere** — matches by `category + title`. Demotes any future finding with that signature anywhere in the project.

Matched findings come back as `severity: 'silenced'` with a 🔕 badge — visible (so you know it returned), muted (so it doesn't fight real-severity findings for attention). One click **Restore** un-silences. The command palette exposes **Unsilence a Finding…** to inspect/remove individual rules, and **Clear All Silenced Findings** to nuke the memory.

### Self-critique audit trail

The critique pass doesn't quietly delete findings. For every prior finding it emits one of four decisions:

- **keep** — load-bearing as-is.
- **revise** — wording, severity, or category changed. The card keeps a snapshot of the pre-critique version so you can compare.
- **drop** — judged not load-bearing for this branch. Stays in the panel with a `DROPPED` badge.
- **merge** — folded into another finding. Stays with a `MERGED` badge and a link to the survivor.

Dropped and merged findings don't appear in the main severity flow — they sit behind the **Revised** chip in the filter row. The sidebar progress card shows the delta in real time (`−6 dropped · −4 merged · 2 revised`), so the count drop is explained, not mysterious. Every decision has a reason from critique attached, surfaced inside the expanded card as a **Self-critique's review** section. Findings that critique referenced by an internal scaffolding id (e.g. `f3 describes the same SQL injection as f2`) get the ids substituted for the actual finding titles before display.

---

## Cost estimate & calibration

Before you press RUN, the panel preflights the actual diff (`git diff base...head`) and asks the estimator what a review of *this* diff with *these* passes at *this* depth will cost. The result lands in the cost pill above the RUN button.

**What the estimate shows**

- **Central tokens** — projected sum of effective input + output tokens across every planned pass. The headline metric, because subscription users pay in token budget, not USD.
- **Wall-clock duration** — per-pass baseline scaled by diff size (sub-linear curve) and depth multiplier.
- **USD reference** — what the same call sequence would cost at API-direct prices (Opus 4.7 1M, current cache/output tiers). Shown smaller, with a disclaimer that subscription users don't pay this amount.
- **Confidence badge** — `cold` (no samples yet, hardcoded coefficients), `partial` (1-4 samples — not enough for the regression), or `calibrated` (5+ samples — per-workspace correction is active).
- **Per-pass breakdown** — click the pill: token cost per pass + low / high / worst-case range + the human-readable factors (`session reuse on — saves ~15% on input tokens`, `depth=obsessive adds ~40% over deep`, `calibrated from 7 prior runs (×0.82 duration, ×0.91 cost)`, …).

**Cost components the estimator models**

- Per-pass base prompt (system preamble + JSON contract + pass instructions).
- Diff context tokens (raw diff for structural; enriched diff = raw + loaded file content for the rest).
- Per-pass output tokens, scaled by depth and by the running count of prior findings (critique re-serializes every prior finding — it grows fastest).
- Cache reuse curve: when session reuse is on, pass N within a session sees a ~`min(0.85, 0.4 + 0.07·N)` cache-read hit ratio. Modeled per-pass-index.
- Haiku-vs-Opus overhead from the CLI's internal routing.
- Variance band: low ×0.7, high ×1.5, worst-case ×2.5.

**How calibration works**

Every completed pass emits a telemetry record (token buckets, cost, cache split, model breakdown, tools invoked, retries, durations) — prefixed `[telemetry]` in the output channel as one-line NDJSON, plus a human-readable ◆ line in the live log. At end-of-review the orchestrator aggregates them into a sample, stored in two scopes:

- **workspaceState** — narrow, fits this repo's diff shapes and patterns.
- **globalState** — broader fallback across repos.

The estimator prefers workspace samples once 5+ exist; otherwise falls back to global, then to hardcoded coefficients. The regression fits a per-scope multiplicative correction (median actual ÷ predicted ratio, clamped 0.4×–2.5×) and surfaces MAPE so the confidence badge can flag drift. A schema version on each sample invalidates older ones when coefficients change so stale data can't poison the fit.

**Confirmation threshold**

When the central estimate crosses **200,000 tokens**, pressing RUN opens a confirmation modal instead of starting immediately. You can opt out under your own threshold via the "don't ask again" checkbox — it bumps your threshold to the next clean tier (100K / 250K / 500K / 1M / 2M / 5M / 10M) so suppression is intuitive. The preference is panel-local (per webview, via `vscode.setState`), not a project setting.

**Debug commands**

- `Claude Review: Estimate Review Cost (Debug)` — print the full estimator output (per-pass tokens, USD, factors, sample counts) to the output channel without running anything.
- `Claude Review: Dump Estimator Samples (Debug)` — dump every persisted sample so you can see what the regression is fitting.

---

## Session reuse

When session reuse is on (default), the orchestrator opens **two** Claude CLI sessions per review and shares each across the passes that fit:

- **`withTools` session** — structural pass only (tools: Read, Grep, Glob).
- **`noTools` session** — explore + specialists + completeness + critique + summary (no tools).

Each first call inside a session uses `--session-id <uuid>`; every subsequent call uses `--resume <uuid>` so the prompt cache from the previous call is reused. The CLI reports the saving as cache-read tokens (typically 10× cheaper than fresh input). Empirically: ~60-70% cost reduction vs. spawning isolated CLI processes per pass.

If `--resume` ever fails (session expired, corrupted state), the orchestrator resets that session and the next pass creates a fresh one — the review keeps running, you just lose cache reuse for one call.

Toggle it via the Advanced Options panel or `claudeReviewer.useSessionReuse`. Disable only if you suspect cross-pass interference (the prompt cache holds every prior call's context).

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

The codebase is organized into focused modules — no file mixes presentation, business logic, and state. Prompts are split per analysis pass (one file per specialist). Webview UIs are bundled from a tree of small fragments (each CSS section and each client-JS responsibility lives in its own file) so the working set stays small. The few top-level files you'll see inside `core/` are thin compatibility re-exports — the real code lives one level deeper, grouped by intent (`events/`, `stores/`, `controllers/`, `orchestrator/`).

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
code --install-extension claude-branch-reviewer-0.3.0.vsix
```

> **vsce + pnpm quirk:** `vsce publish` invokes `npm ls` under the hood and trips over pnpm's symlinked `node_modules` layout, even though `vsce package` works fine. Package first, then publish the produced `.vsix` explicitly: `npx vsce publish --packagePath claude-branch-reviewer-<version>.vsix`. See [RELEASE.md](RELEASE.md) for the full publish flow.

---

## Support the project ☕

This extension is free, MIT-licensed, and doesn't talk to any backend of its own — your Claude subscription does all the work. But building it, fixing your bug reports, and shipping new passes happens on nights and weekends, fueled by **a dangerous amount of coffee**.

If Claude Branch Reviewer caught a bug before code review did, saved you an hour of "what is this PR even doing", or just made your reviewer's job a little less painful — consider buying me a coffee.

<p align="center">
  <a href="https://buymeacoffee.com/ajmc90">
    <img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=☕&slug=ajmc90&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff" alt="Buy me a coffee" />
  </a>
</p>

Stars on GitHub and reviews on the Marketplace are also a great free way to help — they make the project visible to other devs who could use it.

> **Pro tip:** every coffee unlocks ~30 minutes of staring at TypeScript errors I will fix for you. ☕ = 🐛 ⬇

---

## License

MIT.
