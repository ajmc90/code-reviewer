import { spawn, execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Detects whether a git error string looks like SSH could not unlock the
 * private key (passphrase needed, ssh-askpass missing, etc.).
 */
export function looksLikeSshAuthError(stderr: string): boolean {
  const s = stderr.toLowerCase();
  return (
    s.includes('ssh_askpass') ||
    s.includes('ssh-askpass') ||
    s.includes('permission denied (publickey') ||
    s.includes('host key verification failed') ||
    s.includes('could not read from remote repository') ||
    s.includes('please make sure you have the correct access rights')
  );
}

/**
 * Locates candidate private SSH keys in ~/.ssh that have passphrases (heuristic
 * — we treat anything matching `id_*` without a `.pub` filter as a key file).
 */
function listSshKeys(): string[] {
  const dir = path.join(os.homedir(), '.ssh');
  if (!fs.existsSync(dir)) return [];
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => /^id_(rsa|ed25519|ecdsa|dsa)(_.+)?$/.test(f))
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

/**
 * Lists keys currently loaded in the ssh-agent.
 */
async function agentFingerprints(): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('ssh-add', ['-l'], { env: process.env });
    return stdout.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Starts an ssh-agent for this VS Code session if one isn't already attached.
 * Mutates process.env so subsequent git spawns inherit SSH_AUTH_SOCK / SSH_AGENT_PID.
 * On macOS the system agent is already running at SSH_AUTH_SOCK; we only spawn one
 * if no agent is reachable.
 */
async function ensureAgent(): Promise<{ ok: boolean; error?: string }> {
  if (process.env.SSH_AUTH_SOCK) {
    try {
      await execFileAsync('ssh-add', ['-l'], { env: process.env });
      return { ok: true };
    } catch (e: any) {
      // ssh-add returns 1 if agent has no identities — still a working agent
      if (e?.code === 1) return { ok: true };
      // code 2 = could not connect to agent; fall through and start one
    }
  }
  try {
    const { stdout } = await execFileAsync('ssh-agent', ['-s']);
    // Parse `SSH_AUTH_SOCK=/path; export SSH_AUTH_SOCK; SSH_AGENT_PID=123; export SSH_AGENT_PID;`
    const sock = stdout.match(/SSH_AUTH_SOCK=([^;]+)/)?.[1];
    const pid = stdout.match(/SSH_AGENT_PID=([^;]+)/)?.[1];
    if (sock) process.env.SSH_AUTH_SOCK = sock;
    if (pid) process.env.SSH_AGENT_PID = pid;
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

/**
 * Runs `ssh-add <keyPath>` and feeds the passphrase on stdin via a wrapper
 * SSH_ASKPASS script so the prompt isn't echoed and no TTY is needed.
 *
 * Why not stdin directly? On many platforms ssh-add explicitly reads the
 * passphrase from /dev/tty, not stdin. The portable workaround is to set
 * SSH_ASKPASS to a one-shot script that prints the passphrase and use
 * `SSH_ASKPASS_REQUIRE=force` + `DISPLAY=` so ssh-add invokes it instead
 * of opening a TTY.
 */
async function addKey(keyPath: string, passphrase: string): Promise<{ ok: boolean; error?: string }> {
  // Write a one-shot askpass script.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-rev-askpass-'));
  const isWin = process.platform === 'win32';
  const scriptPath = path.join(dir, isWin ? 'askpass.cmd' : 'askpass.sh');
  const passFile = path.join(dir, 'pass');
  fs.writeFileSync(passFile, passphrase, { mode: 0o600 });
  if (isWin) {
    fs.writeFileSync(scriptPath, `@echo off\r\ntype "${passFile}"\r\n`, { mode: 0o700 });
  } else {
    fs.writeFileSync(scriptPath, `#!/bin/sh\ncat "${passFile}"\n`, { mode: 0o700 });
  }

  const env = {
    ...process.env,
    DISPLAY: process.env.DISPLAY ?? ':0',
    SSH_ASKPASS: scriptPath,
    SSH_ASKPASS_REQUIRE: 'force',
  };

  return new Promise((resolve) => {
    const proc = spawn('ssh-add', [keyPath], {
      env,
      detached: !isWin, // need new session so ssh-add doesn't see a controlling TTY
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', (e) => {
      cleanup();
      resolve({ ok: false, error: e.message });
    });
    proc.on('close', (code) => {
      cleanup();
      if (code === 0) resolve({ ok: true });
      else resolve({ ok: false, error: stderr.trim() || `ssh-add exited ${code}` });
    });
    // safety: detach so it can't inherit a TTY
    if (!isWin) proc.unref();
  });

  function cleanup() {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

/**
 * Public entry point used by GitService when a git command fails with an SSH
 * auth error. Prompts the user for a passphrase, loads the key into the agent,
 * and returns whether the caller should retry the original git operation.
 *
 * Returns:
 *   - 'retry'  if a key was successfully added
 *   - 'cancel' if the user dismissed the prompt
 *   - 'fail'   if we couldn't recover (with an error message)
 */
export async function unlockSshKeyInteractive(originalStderr: string): Promise<{ outcome: 'retry' | 'cancel' | 'fail'; error?: string }> {
  const agent = await ensureAgent();
  if (!agent.ok) {
    return { outcome: 'fail', error: `Could not start ssh-agent: ${agent.error}` };
  }

  const loaded = await agentFingerprints();
  // If the agent already has keys and we still got a public-key error, the
  // loaded keys don't grant access. Still let the user pick a new key.

  const candidates = listSshKeys();
  let keyPath: string | undefined;
  if (candidates.length === 0) {
    const manual = await vscode.window.showInputBox({
      title: 'SSH key needed for git fetch',
      prompt: 'No SSH keys auto-detected in ~/.ssh. Enter the full path to your private key.',
      placeHolder: '/Users/you/.ssh/id_ed25519',
      ignoreFocusOut: true,
    });
    if (!manual) return { outcome: 'cancel' };
    keyPath = manual;
  } else if (candidates.length === 1) {
    keyPath = candidates[0];
  } else {
    const pick = await vscode.window.showQuickPick(
      candidates.map((p) => ({ label: path.basename(p), description: p })),
      { title: 'Pick the SSH key to unlock', ignoreFocusOut: true },
    );
    if (!pick) return { outcome: 'cancel' };
    keyPath = pick.description;
  }
  if (!keyPath) return { outcome: 'cancel' };

  if (!fs.existsSync(keyPath)) {
    return { outcome: 'fail', error: `Key not found: ${keyPath}` };
  }

  const passphrase = await vscode.window.showInputBox({
    title: `Passphrase for ${path.basename(keyPath)}`,
    prompt: 'Enter the passphrase for your SSH private key. It will be loaded into ssh-agent and reused for this session only.',
    password: true,
    ignoreFocusOut: true,
  });
  if (passphrase === undefined) return { outcome: 'cancel' };

  const result = await addKey(keyPath, passphrase);
  if (!result.ok) {
    const friendly = /bad passphrase|incorrect/i.test(result.error ?? '')
      ? 'Incorrect passphrase.'
      : result.error ?? 'ssh-add failed.';
    return { outcome: 'fail', error: friendly };
  }

  void vscode.window.setStatusBarMessage(`SSH key '${path.basename(keyPath)}' loaded into agent.`, 5000);
  return { outcome: 'retry' };
}
