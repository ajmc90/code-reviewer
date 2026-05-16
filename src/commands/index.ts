import * as vscode from 'vscode';
import { ExtensionRuntime } from '../core/extensionContext';
import { registerReviewCommands } from './reviewCommands';
import { registerFindingCommands } from './findingCommands';
import { registerMiscCommands } from './miscCommands';

export function registerAllCommands(rt: ExtensionRuntime, panelDeps: any): vscode.Disposable[] {
  return [
    ...registerReviewCommands(rt, panelDeps),
    ...registerFindingCommands(rt),
    ...registerMiscCommands(rt),
  ];
}
