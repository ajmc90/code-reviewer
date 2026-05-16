# Changelog

All notable changes to **Claude Branch Reviewer** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-05-16

### Added
- **Apply Fix preview** — suggested fixes now open as a VS Code diff editor. Edit the right side, then Apply or Discard from the editor title. New commands: `applyFixConfirm`, `applyFixCancel`.
- **Silence noise across reviews** — dismiss findings as "this exact one" or "this pattern, everywhere". Future reviews demote matches to a `silenced` badge with a 🔕 marker instead of nagging again. New commands: Restore Silenced Finding, Unsilence a Finding…, Clear All Silenced Findings.
- **On-demand per-finding translation** — each finding card has its own EN/ES chip that translates only that card via the Claude CLI. New `claudeReviewer.translationModel` setting picks a cheaper model for translations.
- **Sidebar dashboard** — second view in the activity bar showing run state, paused-banner with Resume/Discard, last review summary, and the last 5 reviews per branch (one click to rehydrate any).
- **Rehydratable review history** — finished reviews are stored and can be reopened from the sidebar without re-running.
- **Five-phase pipeline** (discovery → specialists → consolidation → completeness → critique) with phase tracking on the timeline and accurate per-pass progress fractions on the running card.
- **Consolidation phase** — local semantic dedupe of findings between specialists and completeness, with a "−N merged" badge explaining the count drop.
- **Change map** — explore pass classifies each changed file (`new-feature`, `refactor`, `bugfix`, …) with blast-radius, surfaced as a collapsible row above the findings grid.
- **Related-finding linking** — when a later pass refines a prior finding, the card shows a "Related" badge that scrolls + flashes the original.
- **Findings grouping** — group the findings tree by severity / file / category. Commands: Group Findings by Severity / File / Category, Refresh Findings.
- Run-time **pause / resume / per-pass retry** — if a pass fails or you cancel, the review snapshots itself; the panel and sidebar offer Resume + per-step Retry, plus a Discard action. Commands: Resume Paused Review, Retry a Single Pass, Discard Paused Review.
- README hero + findings-grid + expanded-finding screenshots.

### Changed
- **Internal refactor** — `reviewPanel.ts` (3521→244 for the class), `extension.ts` (1046→258), `orchestrator.ts` (871→thin class + data-driven passes), `summaryView.ts` (902→122). Webview UIs now split CSS, client JS, render functions, and lifecycle into separate files. No behavior change. Adding new passes / commands / panel sections is now a single-file edit.
- Pass selection UI redesigned: pills grouped by phase (Discovery / Specialists / Completeness / Critique), one-click presets (*fast*, *deep*, *security*), per-pass tooltips, and an Advanced toggle to hide the granular controls.
- Run card replaces the old Start button area with a sticky bottom card summarising branches + active passes + estimated runtime; live progress chips during a run (phase, findings, elapsed).
- `engines.vscode` unchanged at 1.85+; no breaking config or command renames.

## [0.1.2] — 2026-05-15

### Changed
- New activity-bar and view icon: replaced the placeholder info-circle with a monochrome branch-graph + robot-head + check-mark design that mirrors the Marketplace listing icon.

## [0.1.1] — 2026-05-15

### Changed
- New extension icon: cleaner branch-graph + check-mark robot design (256×256 PNG, proper format — previous 0.1.0 build accidentally shipped a JPEG renamed to `.png`).

## [0.1.0] — 2026-05-15

Initial public release.

### Added
- Multi-pass review pipeline: structural exploration, security, performance, accessibility, tests, gaps, alternatives, and self-critique.
- Branch picker with local + remote branches, ahead/behind counter, fetch & prune, and inline SSH-passphrase prompts.
- Live review panel with streaming pass timeline, severity-colored log, and drag-resizable layout.
- Findings grid with severity ribbons, category badges, jump-to-code, apply-fix, ask-follow-up, and dismiss actions.
- Executive summary view: verdict, risk score, top concerns, strengths.
- Editor decorations: gutter markers, end-of-line tags, and rich hovers with reasoning, evidence, and suggested fixes.
- Configurable reasoning depth (`fast` / `balanced` / `deep` / `obsessive`).
- Project-context auto-detection (`CLAUDE.md`, `README.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`).
- English and Spanish UI localization.
- Markdown export of the full review report.
