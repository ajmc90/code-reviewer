import { GitService } from '../../git/gitService';
import { looksLikeSshAuthError, unlockSshKeyInteractive } from '../../git/sshAuth';
import { Lang, t } from '../../i18n';

export interface BranchSnapshot {
  branches: Awaited<ReturnType<GitService['listBranchesRich']>>;
  remotes: Awaited<ReturnType<GitService['remotes']>>;
  defaultBase: Awaited<ReturnType<GitService['detectDefaultBaseBranch']>> | null;
  currentBranch: string | null;
  error?: string;
}

export async function collectBranchSnapshot(git: GitService | null, lang: Lang): Promise<BranchSnapshot> {
  if (!git) {
    return { branches: [], remotes: [], defaultBase: null, currentBranch: null, error: t('notif.openFolderFirst', lang) };
  }
  const isRepo = await git.isRepo();
  if (!isRepo) {
    return { branches: [], remotes: [], defaultBase: null, currentBranch: null, error: t('notif.notGitRepoShort', lang) };
  }
  const [branches, remotes, defaultBase, currentBranch] = await Promise.all([
    git.listBranchesRich(),
    git.remotes(),
    git.detectDefaultBaseBranch(),
    git.currentBranch().catch(() => null),
  ]);
  return { branches, remotes, defaultBase, currentBranch };
}

export interface FetchHooks {
  onPrompt: (message: string) => void;
}

export async function fetchAllWithSshUnlock(
  git: GitService,
  prune: boolean,
  lang: Lang,
  hooks: FetchHooks,
): Promise<string> {
  try {
    return await git.fetchAll({ prune });
  } catch (e: any) {
    const stderr = String(e?.message ?? '');
    if (!looksLikeSshAuthError(stderr)) throw e;

    hooks.onPrompt(t('branch.fetchPrompt.ssh', lang));
    const r = await unlockSshKeyInteractive(stderr);
    if (r.outcome === 'cancel') {
      throw new Error('SSH unlock cancelled by user.');
    }
    if (r.outcome === 'fail') {
      throw new Error(`SSH unlock failed: ${r.error}`);
    }
    hooks.onPrompt(t('branch.fetchPrompt.retry', lang));
    return await git.fetchAll({ prune });
  }
}
