<div align="center">

# Claude Branch Reviewer

**The deepest code review you can get inside VS Code — powered by your local Claude Code CLI.**

No API key. No extra cost. Just your existing Claude subscription.

[![Marketplace](https://img.shields.io/visual-studio-marketplace/v/ajmc90.claude-branch-reviewer?label=Marketplace&logo=visualstudiocode&color=007ACC)](https://marketplace.visualstudio.com/items?itemName=ajmc90.claude-branch-reviewer)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/ajmc90.claude-branch-reviewer?color=007ACC)](https://marketplace.visualstudio.com/items?itemName=ajmc90.claude-branch-reviewer)
[![VS Code](https://img.shields.io/badge/VS_Code-1.85+-blue?logo=visualstudiocode&logoColor=white)](https://code.visualstudio.com/)
[![Claude](https://img.shields.io/badge/Powered_by-Claude_Code_CLI-7c5cff)](https://docs.anthropic.com/en/docs/claude-code)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](#license)

</div>

---

> Reviews **any git branch against any base**, in **any language**, with **multiple reasoning passes** that question themselves, explore alternatives, and anchor every comment to an exact file + line range — with an applicable fix.

## Highlights

- **🔬 Multi-pass reasoning** — not a single shot. Each pass has a job, and the final pass critiques the rest.
- **📍 Pinpoint anchoring** — every finding maps to `file:start-end`. One click jumps to the exact range.
- **🧠 Shows its work** — title, reasoning, questions raised, alternatives considered, evidence quotes, suggested fix.
- **🎨 Modern review panel** — toggleable passes, severity + category filters, drag-resizable layout, collapsible sidebar.
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

| Area | What it gives you |
|---|---|
| **Branch picker** | Local + remote branches, filterable, with last author / subject / age. Fetch & prune with one click; ahead/behind counter. SSH-passphrase prompts handled inline. |
| **Analysis passes** | Pill checkboxes for every pass (Structural, Exploration, Security, Performance, Accessibility, Tests, Gaps, Alternatives, Self-critique). All on by default — uncheck what you don't need. "All / None" shortcuts. Selection persists across sessions. |
| **Live activity** | Real-time timeline of each pass: queued → running → done, with elapsed time and a streaming snippet of what Claude is thinking. |
| **Log** | Raw streaming output, severity-colored. Copy or clear. |
| **Executive summary** | Verdict, risk score, top concerns, strengths — emitted once the review finishes. |
| **Findings grid** | Problem ↔ Solution cards. Severity ribbon, category badge, jump-to-code, apply fix, ask follow-up, dismiss. |
| **Filters** | Severity chips (critical / major / minor / nit / praise) + category chips (security, accessibility, performance, …) with live counts + free-text search. Combine freely. |
| **Collapse + resize** | Click ‹ to collapse the left pane into a vertical rail showing branches, current pass, spinner, and live severity counts. Drag the gutter between panes to resize (or `←/→` while focused, `Home/End` for min/max, dbl-click to reset). Width and collapse state persist. |

> **Keyboard:** `Cmd/Ctrl + \` toggles the sidebar. `Cmd/Ctrl + Alt + R` starts a review.

---

## What each pass does

| Pass | Focus |
|---|---|
| **Structural exploration** | Surveys the diff, identifies hot spots, scopes the work |
| **Exploration** | Open-ended walk through every changed file — correctness, regressions, integration risk |
| **Security** | Prompt / SQL / command / path injection, authn/z, secrets, deserialization, weak crypto |
| **Performance** | N+1, accidental O(n²), blocking I/O on hot paths, allocations |
| **Accessibility** | WCAG / ARIA issues for UI changes (auto-skipped if no UI files touched) |
| **Tests** | Missing coverage, brittle assertions, flaky patterns |
| **Gaps** | Pieces that should exist but don't — error handling, null checks, observability |
| **Alternatives** | Honest trade-off analysis for non-trivial changes (deep / obsessive depth only) |
| **Self-critique** | Re-reads its own findings; drops noise, sharpens wording, fills gaps |
| **Final summary** | Verdict · risk score · executive summary · top concerns · strengths |

Each finding includes:

- `file` + `startLine` + `endLine` (clickable → editor jumps to the range)
- **Title**, **description**, **reasoning** ("why is this a problem")
- **Questions Claude asked itself** at this spot
- **Alternatives considered**, with trade-offs
- **Evidence** — direct quotes from the diff
- **Suggested fix** with confidence and replacement code
- Gutter markers + end-of-line tags + rich hover

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

| Command | Default keybinding |
|---|---|
| `Claude Review: Open Review Panel` | — |
| `Claude Review: Review Branch vs Base` | `Cmd+Alt+R` / `Ctrl+Alt+R` |
| `Claude Review: Review Current Branch vs main` | — |
| `Claude Review: Review Uncommitted Changes` | — |
| `Claude Review: Ask Claude a Follow-Up` *(from a finding)* | — |
| `Claude Review: Apply Suggested Fix` *(from a finding)* | — |
| `Claude Review: Export Review Report (Markdown)` | — |
| `Claude Review: Clear Review Cache` | — |

---

## Settings

| Key | Default | Description |
|---|---|---|
| `claudeReviewer.claudeCliPath` | `claude` | Path to the Claude Code CLI binary |
| `claudeReviewer.model` | `""` | Optional `--model` override (`opus`, `sonnet`, …) |
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

```text
src/
├── extension.ts                # VS Code entry: commands, lifecycle, state
├── types.ts                    # Finding / ReviewResult / ProjectContext shapes
├── git/
│   ├── gitService.ts           # diff, merge-base, branch enumeration, parser
│   └── sshAuth.ts              # interactive SSH-key unlock
├── claude/
│   ├── cliClient.ts            # spawns `claude --print` — no API key
│   ├── prompts.ts              # multi-pass prompts
│   ├── parser.ts               # normalises + dedupes Claude's JSON
│   └── structuralParser.ts     # parses the structural-exploration pass
├── context/
│   ├── projectContext.ts       # auto-detect language, frameworks, tools
│   └── fileContext.ts          # per-file context Claude needs
├── core/
│   ├── orchestrator.ts         # runs passes, consolidates, summarises
│   └── events.ts               # live event bus → review panel
└── ui/
    ├── reviewPanel.ts          # the main webview (branch picker, passes, findings…)
    ├── findingsTree.ts         # activity-bar tree of findings
    ├── summaryView.ts          # verdict + risk + top concerns view
    ├── decorations.ts          # gutter + hover + inline tags
    └── statusBar.ts            # in-progress + counters in the status bar
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

## License

MIT.
