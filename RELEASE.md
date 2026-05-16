# Release process

Internal checklist for cutting a new version of **claude-branch-reviewer**.
Claude (the AI in this repo) follows this automatically when you ask for a new release; this file is the human-readable source of truth.

---

## 1. Decide the semver bump

Look at every commit since the last `v*` tag (or since the previous version in `CHANGELOG.md`).

| Bump | When | Examples |
|------|------|----------|
| **major** (`x.0.0`) | Breaking change to the extension's *public surface* | Rename/remove a `contributes.commands` ID, rename a `configuration` key (users' settings break silently), drop support for an old `engines.vscode`, change default behavior users have to react to |
| **minor** (`0.x.0`) | New user-visible capability, backwards-compatible | New command, new setting, new view, new analysis pass, new keybinding, new auto-detected language/framework |
| **patch** (`0.0.x`) | Bug fix, perf, internal refactor, docs, dep bump | Crash/regression fix, prompt-quality improvement with no API change, README typo, test-only change |

If the changeset mixes categories, pick the **highest** present.

---

## 2. Update `CHANGELOG.md`

Insert a new section above the previous one. Follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/):

```markdown
## [X.Y.Z] — YYYY-MM-DD

### Added
- New user-facing capabilities.

### Changed
- Behavior changes (not breaking).

### Fixed
- Bug fixes.

### Removed
- Things deleted.

### Security
- Vulnerability fixes.
```

Skip empty buckets. Write entries from the *user's* point of view, not "refactored XService" — say what they'll notice.

---

## 3. Sanity-check the build

```bash
pnpm install
pnpm run compile          # tsc must pass clean
pnpm run lint             # optional but recommended
pnpm run package          # produces a local .vsix to eyeball
code --install-extension claude-branch-reviewer-<version>.vsix   # smoke-test
```

---

## 4. Publish

Both marketplaces, in this order:

```bash
# VS Code Marketplace — also bumps package.json and creates a git tag
npx vsce publish patch     # or: minor / major

# Open VSX (Cursor / VSCodium users) — re-uses the .vsix just produced
npx ovsx publish claude-branch-reviewer-<new-version>.vsix -p $OPENVSX_TOKEN

# Push the tag vsce created
git push && git push --tags
```

> `vsce publish <bump>` updates `package.json`, commits it, tags `v<new-version>`, and uploads. Don't manually bump the version first or you'll skew the tag.

---

## 5. Verify

- VS Code Marketplace listing (may take 5–10 min to update): https://marketplace.visualstudio.com/items?itemName=ajmc90.claude-branch-reviewer
- Open VSX listing: https://open-vsx.org/extension/ajmc90/claude-branch-reviewer
- GitHub release tag: https://github.com/ajmc90/code-reviewer/releases

---

## Tokens

- **`vsce`** auth: `npx vsce login ajmc90` (one-time, stores Azure DevOps PAT). Re-run if `vsce publish` says you're not logged in.
- **`ovsx`** auth: set `OPENVSX_TOKEN` env var, or pass `-p <token>`. Generate at https://open-vsx.org/user-settings/tokens.

If the Open VSX namespace doesn't exist yet:

```bash
npx ovsx create-namespace ajmc90 -p $OPENVSX_TOKEN
```
