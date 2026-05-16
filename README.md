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
| **Analysis passes** | Pill checkboxes grouped by phase (Discovery, Specialists, Completeness, Critique). Presets — *fast*, *deep*, *security* — flip the right set with one click. Per-pass tooltips explain what each does. Advanced toggle hides the granular controls when you don't need them. Selection persists across sessions. |
| **Run card** | Sticky bottom card summarizes branches + active passes + estimated runtime. One ▶ button covers Start / Stop. Live progress chips during a run: phase, findings found, elapsed time. |
| **Live activity** | Real-time timeline of each pass: queued → running → done, with elapsed time, a streaming snippet of what Claude is thinking, and inline Retry / Skip / Stop on failure. |
| **Change map** | When the explore pass classifies each changed file (`new-feature`, `refactor`, `bugfix`, `migration`, `config`, `deps`, `test`, `docs`, `style`) with a blast-radius badge, the panel surfaces it as a collapsible map above the findings grid. |
| **Log** | Raw streaming output, severity-colored. Copy or clear. |
| **Executive summary** | Verdict, risk score, top concerns, strengths — emitted once the review finishes. |
| **Findings grid** | Problem ↔ Solution cards. Severity ribbon, category badge, jump-to-code, apply fix, ask follow-up, dismiss / restore. Per-card EN/ES chip translates that finding on demand. "Related" badges link refinements back to their original finding. |
| **Filters** | Severity chips (critical / major / minor / nit / praise / silenced / **revised**) + category chips (security, accessibility, performance, …) with live counts + free-text search. Combine freely. The *Revised* chip surfaces critique's audit trail; on the **All** filter, silenced + revised findings drop below a labeled separator so the main severity flow stays focused. |
| **Collapse + resize** | Click ‹ to collapse the left pane into a vertical rail showing branches, current pass, spinner, and live severity counts. Drag the gutter between panes to resize (or `←/→` while focused, `Home/End` for min/max, dbl-click to reset). Width and collapse state persist. |

### Sidebar dashboard

A second view lives in the activity-bar sidebar — the "always visible" companion to the big panel.

- **At-a-glance state** — idle / running / paused / failed / done, with a colored brand pill.
- **Live progress card** — phase fraction (e.g. `2/4 passes`), current pass label, live findings count, elapsed time. Cancel button included.
- **Paused review banner** — when a review stopped mid-flight, the banner shows completed / skipped / pending counts and offers **Resume** + **Discard**. Highlights when the paused review is from a different branch than your current checkout.
- **Last review summary** — branch pair, verdict, risk, severity chips, executive summary, top concerns, strengths, and **Export Report**.
- **History** — the last 5 reviews per branch pair. Click any row to rehydrate that review back into the panel + tree + decorations.

> **Keyboard:** `Cmd/Ctrl + \` toggles the panel sidebar. `Cmd/Ctrl + Alt + R` starts a review.

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
| `claudeReviewer.ignoreGlobs` | sensible defaults | Glob patterns to exclude |
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

The codebase is organized into focused modules — no file mixes presentation, business logic, and state. Webview UIs split CSS, client JS, render functions, and lifecycle into separate files so the working set stays small.

```text
src/
├── extension.ts                  # VS Code entry: builds runtime, wires deps
├── types.ts                      # Finding / ReviewResult / ProjectContext shapes
│
├── i18n/
│   ├── index.ts                  # getLang / setLang / t() + language change emitter
│   └── messages.ts               # EN + ES dictionaries (~900 keys)
│
├── git/
│   ├── gitService.ts             # diff, merge-base, branch enumeration, parser
│   └── sshAuth.ts                # interactive SSH-key unlock
│
├── claude/
│   ├── cliClient.ts              # spawns `claude --print` — no API key
│   ├── prompts.ts                # multi-pass prompts
│   ├── parser.ts                 # normalises + dedupes Claude's JSON + relates findings
│   ├── structuralParser.ts       # parses the structural-exploration pass
│   ├── translator.ts             # batched on-demand finding translation
│   └── onDemandTranslator.ts     # extension-side translation orchestration + caching
│
├── context/
│   ├── projectContext.ts         # auto-detect language, frameworks, tools
│   └── fileContext.ts            # per-file context Claude needs + UI-files heuristic
│
├── core/
│   ├── events.ts                 # live event bus → review panel + sidebar
│   ├── extensionContext.ts       # ExtensionRuntime interface (shared deps bag)
│   ├── partialState.ts           # paused-review state load / save / summarise
│   ├── historyStore.ts           # last-N reviews, per-(base, head) index + full results
│   ├── silenceStore.ts           # persisted dismiss rules + apply-to-findings matcher
│   ├── reportMarkdown.ts         # ReviewResult → Markdown export
│   ├── reviewController.ts       # runReview / executeReviewLoop / orchestrator wiring
│   ├── orchestrator.ts           # barrel re-export
│   └── orchestrator/
│       ├── index.ts              # ReviewOrchestrator class (thin)
│       ├── types.ts              # OrchestratorDeps
│       ├── errors.ts             # ReviewPausedError
│       ├── state.ts              # bootstrapState / hydrateForResume / planned passes
│       ├── phaseLoop.ts          # five-phase pipeline driver
│       ├── passRunner.ts         # executePassWithDecisions / runPlannedPass / shouldRun
│       ├── cli.ts                # runCli / runCliWithTools
│       ├── helpers.ts            # tagPass / stripIdForPrompt / report / checkCancel
│       ├── diffSummarizer.ts     # oversized-diff chunker
│       └── passes/
│           ├── structural.ts     # Phase A: structural exploration
│           ├── explore.ts        # Phase A: open-ended walk + change map
│           ├── specialists.ts    # Phase B: security / performance / a11y / tests
│           ├── consolidation.ts  # Phase C: local semantic dedupe (no CLI)
│           ├── completeness.ts   # Phase D: gaps + alternatives
│           ├── critique.ts       # Phase E: self-critique
│           ├── summary.ts        # Phase E: final summary + fallback
│           └── runFocused.ts     # shared prompt → CLI → parse helper
│
├── commands/
│   ├── index.ts                  # registerAllCommands(rt, panelDeps)
│   ├── reviewCommands.ts         # show / run / cancel / resume / retry / discard
│   ├── findingCommands.ts        # open / applyFix(+confirm/cancel) / dismiss / restore / ask
│   └── miscCommands.ts           # export / language / groupBy / refresh
│
└── ui/
    ├── reviewPanel.ts            # barrel re-export
    ├── reviewPanel/
    │   ├── index.ts              # ReviewPanel class (lifecycle, message routing)
    │   ├── template.ts           # HTML body
    │   ├── styles.ts             # CSS (isolated)
    │   ├── client.ts             # webview JS + buildClientScript(lang)
    │   ├── branchOps.ts          # branch snapshot + SSH-unlock fetch helper
    │   └── sanitize.ts           # sanitizePasses (input validation)
    ├── summaryView.ts            # barrel re-export
    ├── summaryView/
    │   ├── index.ts              # SummaryViewProvider (sidebar dashboard)
    │   ├── render.ts             # pure render functions + renderHtml
    │   ├── styles.ts             # CSS (isolated)
    │   ├── client.ts             # webview JS
    │   ├── types.ts              # SummaryDeps / HistoryEntry / RunState
    │   ├── eventReducer.ts       # pure ReviewEvent → RunState reducer
    │   └── messageRouter.ts      # webview message dispatch
    ├── findingsTree.ts           # activity-bar tree of findings
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
code --install-extension claude-branch-reviewer-0.1.0.vsix
```

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
