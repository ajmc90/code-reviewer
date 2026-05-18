import { spawn } from 'child_process';
import { DiffFile, DiffHunk } from '../types';

export interface BranchInfo {
  name: string;
  fullRef: string;
  isCurrent: boolean;
  isRemote: boolean;
  remote?: string;
  upstream?: string;
  lastCommitISO?: string;
  lastAuthor?: string;
  lastSubject?: string;
}

export class GitService {
  constructor(private cwd: string) {}

  private exec(args: string[], opts: { maxBuffer?: number } = {}): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn('git', args, { cwd: this.cwd });
      const chunks: Buffer[] = [];
      const errChunks: Buffer[] = [];
      let total = 0;
      const max = opts.maxBuffer ?? 50 * 1024 * 1024;
      proc.stdout.on('data', (d: Buffer) => {
        total += d.length;
        if (total > max) {
          proc.kill();
          reject(new Error(`git ${args[0]} exceeded ${max} bytes`));
          return;
        }
        chunks.push(d);
      });
      proc.stderr.on('data', (d: Buffer) => errChunks.push(d));
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) {
          resolve(Buffer.concat(chunks).toString('utf8'));
        } else {
          reject(new Error(`git ${args.join(' ')} exited ${code}: ${Buffer.concat(errChunks).toString('utf8')}`));
        }
      });
    });
  }

  async isRepo(): Promise<boolean> {
    try {
      await this.exec(['rev-parse', '--is-inside-work-tree']);
      return true;
    } catch {
      return false;
    }
  }

  async currentBranch(): Promise<string> {
    return (await this.exec(['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
  }

  /**
   * Switch the working tree to `branch`. Bare `git checkout` — no force, no
   * stash. If the working tree has unstaged conflicts the git process exits
   * non-zero and our exec wrapper rejects, so the caller can surface the
   * error verbatim to the user instead of silently destroying their edits.
   */
  async checkout(branch: string): Promise<void> {
    await this.exec(['checkout', branch]);
  }

  async listBranches(): Promise<string[]> {
    const out = await this.exec(['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes']);
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  }

  async listBranchesRich(): Promise<BranchInfo[]> {
    // %09 = tab separator
    const fmt =
      '%(refname:short)%09' +
      '%(refname)%09' +
      '%(HEAD)%09' +
      '%(upstream:short)%09' +
      '%(committerdate:iso8601-strict)%09' +
      '%(authorname)%09' +
      '%(contents:subject)';
    const out = await this.exec(['for-each-ref', `--format=${fmt}`, 'refs/heads', 'refs/remotes']);
    const lines = out.split('\n').filter(Boolean);
    const items: BranchInfo[] = [];
    for (const line of lines) {
      const [shortName, refname, head, upstream, isoDate, author, subject] = line.split('\t');
      if (!shortName) continue;
      if (refname?.startsWith('refs/remotes/') && shortName.endsWith('/HEAD')) continue;
      const isRemote = refname?.startsWith('refs/remotes/') ?? false;
      const remote = isRemote ? shortName.split('/')[0] : undefined;
      items.push({
        name: shortName,
        fullRef: refname,
        isCurrent: head === '*',
        isRemote,
        remote,
        upstream: upstream || undefined,
        lastCommitISO: isoDate || undefined,
        lastAuthor: author || undefined,
        lastSubject: subject || undefined,
      });
    }
    return items;
  }

  async fetchAll(opts: { prune?: boolean } = {}): Promise<string> {
    const args = ['fetch', '--all', '--tags'];
    if (opts.prune) args.push('--prune');
    return this.exec(args, { maxBuffer: 4 * 1024 * 1024 });
  }

  async remotes(): Promise<string[]> {
    const out = await this.exec(['remote']);
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  }

  async aheadBehind(base: string, head: string): Promise<{ ahead: number; behind: number } | null> {
    try {
      const out = (await this.exec(['rev-list', '--left-right', '--count', `${base}...${head}`])).trim();
      const [behind, ahead] = out.split(/\s+/).map((n) => parseInt(n, 10));
      if (Number.isFinite(ahead) && Number.isFinite(behind)) return { ahead, behind };
    } catch {
      // ignore
    }
    return null;
  }

  async detectDefaultBaseBranch(): Promise<string> {
    const candidates = ['main', 'master', 'develop', 'dev', 'trunk'];
    const branches = new Set(await this.listBranches());
    for (const c of candidates) {
      if (branches.has(c) || branches.has(`origin/${c}`)) {
        return c;
      }
    }
    try {
      const head = (await this.exec(['symbolic-ref', 'refs/remotes/origin/HEAD'])).trim();
      const m = head.match(/refs\/remotes\/origin\/(.+)/);
      if (m) return m[1];
    } catch {
      // ignore
    }
    return 'main';
  }

  async mergeBase(base: string, head: string): Promise<string> {
    return (await this.exec(['merge-base', base, head])).trim();
  }

  async diffStat(base: string, head: string): Promise<{ filesChanged: number; insertions: number; deletions: number }> {
    const out = await this.exec(['diff', '--shortstat', `${base}...${head}`]);
    const m = out.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
    if (!m) return { filesChanged: 0, insertions: 0, deletions: 0 };
    return {
      filesChanged: parseInt(m[1] || '0', 10),
      insertions: parseInt(m[2] || '0', 10),
      deletions: parseInt(m[3] || '0', 10),
    };
  }

  async rawDiff(base: string, head: string): Promise<string> {
    return this.exec(['diff', '--no-color', '--unified=5', '--find-renames', `${base}...${head}`]);
  }

  async fileAtRef(ref: string, file: string): Promise<string> {
    try {
      return await this.exec(['show', `${ref}:${file}`]);
    } catch {
      return '';
    }
  }

  async listChangedFiles(base: string, head: string): Promise<DiffFile[]> {
    const out = await this.exec(['diff', '--name-status', '--find-renames', `${base}...${head}`]);
    const lines = out.split('\n').filter(Boolean);
    const files: DiffFile[] = [];
    for (const line of lines) {
      const parts = line.split('\t');
      const status = parts[0];
      let path1 = parts[1];
      let path2 = parts[2];
      let kind: DiffFile['status'] = 'modified';
      let oldPath: string | undefined;
      if (status.startsWith('A')) kind = 'added';
      else if (status.startsWith('D')) kind = 'deleted';
      else if (status.startsWith('R')) {
        kind = 'renamed';
        oldPath = path1;
        path1 = path2;
      } else if (status.startsWith('M')) kind = 'modified';
      files.push({
        path: path1,
        oldPath,
        status: kind,
        additions: 0,
        deletions: 0,
        hunks: [],
        binary: false,
      });
    }
    return files;
  }

  async listUntrackedFiles(): Promise<string[]> {
    const out = await this.exec(['ls-files', '--others', '--exclude-standard']);
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  }

  async parseDiffPerFile(base: string, head: string): Promise<DiffFile[]> {
    const raw = await this.rawDiff(base, head);
    return parseUnifiedDiff(raw);
  }
}

export function parseUnifiedDiff(raw: string): DiffFile[] {
  const files: DiffFile[] = [];
  const lines = raw.split('\n');
  let current: DiffFile | null = null;
  let currentHunk: DiffHunk | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('diff --git ')) {
      if (current) files.push(current);
      const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      current = {
        path: m ? m[2] : '',
        status: 'modified',
        additions: 0,
        deletions: 0,
        hunks: [],
        binary: false,
      };
      currentHunk = null;
    } else if (!current) {
      continue;
    } else if (line.startsWith('new file mode')) {
      current.status = 'added';
    } else if (line.startsWith('deleted file mode')) {
      current.status = 'deleted';
    } else if (line.startsWith('rename from ')) {
      current.status = 'renamed';
      current.oldPath = line.slice('rename from '.length);
    } else if (line.startsWith('Binary files ')) {
      current.binary = true;
    } else if (line.startsWith('@@')) {
      const m = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
      if (m) {
        currentHunk = {
          oldStart: parseInt(m[1], 10),
          oldLines: parseInt(m[2] || '1', 10),
          newStart: parseInt(m[3], 10),
          newLines: parseInt(m[4] || '1', 10),
          header: (m[5] || '').trim(),
          lines: [],
        };
        current.hunks.push(currentHunk);
      }
    } else if (currentHunk) {
      currentHunk.lines.push(line);
      if (line.startsWith('+') && !line.startsWith('+++')) current.additions++;
      else if (line.startsWith('-') && !line.startsWith('---')) current.deletions++;
    }
  }
  if (current) files.push(current);
  return files;
}

export function shouldIgnore(file: string, globs: string[]): boolean {
  return globs.some((g) => globMatch(g, file));
}

/**
 * Strip per-file sections out of a raw unified diff. Used to drop the diff
 * content of files matched by `contextExcludeGlobs` (e.g. lockfiles, snapshots)
 * without affecting the changed-files list — the user still sees that the file
 * changed, the model just doesn't pay cache_creation for hunks that wouldn't
 * inform the review.
 *
 * Operates on the raw string (not on parsed hunks) to preserve git's exact
 * output format. The diff is partitioned at `diff --git a/... b/...` headers,
 * which is git's contract for per-file boundaries.
 *
 * Returns the diff text with excluded files replaced by a one-line marker so
 * the model knows the file changed but the content was omitted by policy.
 */
export function stripExcludedFilesFromDiff(rawDiff: string, excludedPaths: Set<string>): string {
  if (excludedPaths.size === 0 || !rawDiff) return rawDiff;
  const lines = rawDiff.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (!m) {
      // Pre-header noise (shouldn't normally exist before first diff header);
      // keep as-is for safety.
      out.push(line);
      i++;
      continue;
    }
    const filePath = m[2];
    // Find the start of the next file section (or end of input).
    let j = i + 1;
    while (j < lines.length && !lines[j].startsWith('diff --git ')) j++;
    if (excludedPaths.has(filePath)) {
      out.push(`diff --git a/${filePath} b/${filePath}`);
      out.push(`(file content omitted from review context by claudeReviewer.contextExcludeGlobs)`);
      out.push('');
    } else {
      for (let k = i; k < j; k++) out.push(lines[k]);
    }
    i = j;
  }
  return out.join('\n');
}

function globMatch(pattern: string, str: string): boolean {
  const re = new RegExp(
    '^' +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*\//g, '(?:.*/)?')
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]') +
      '$',
  );
  return re.test(str);
}
