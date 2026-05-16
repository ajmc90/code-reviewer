import * as vscode from 'vscode';
import { Finding } from '../../types';

export function tagPass(findings: Finding[], pass: Finding['pass']): void {
  for (const f of findings) f.pass = pass;
}

export function stripIdForPrompt(f: Finding): any {
  const { id, dismissed, ...rest } = f;
  return rest;
}

export function report(
  p: vscode.Progress<{ message?: string; increment?: number }> | undefined,
  log: (m: string) => void,
  message: string,
  increment: number,
): void {
  p?.report({ message, increment });
  log(message);
}

export function checkCancel(token: vscode.CancellationToken | undefined): void {
  if (token?.isCancellationRequested) throw new Error('Cancelled');
}
