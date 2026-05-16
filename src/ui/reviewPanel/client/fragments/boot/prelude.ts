/**
 * Opens the IIFE that wraps every client fragment. Captures the VS Code
 * webview API once and exposes the $/$$ query helpers used everywhere.
 */
export const PRELUDE = `
(function(){
  const vscode = acquireVsCodeApi();
  const $  = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
`;
