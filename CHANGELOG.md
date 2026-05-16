# Changelog

All notable changes to **Claude Branch Reviewer** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
