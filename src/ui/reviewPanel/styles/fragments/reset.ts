/**
 * Global reset and document-level rules (body, html, focus rings).
 */
export const RESET_CSS = String.raw`
/* ─────────────────────────────────────────────────────────────────
 * Reset & globals
 * ────────────────────────────────────────────────────────────── */
*,*::before,*::after{ box-sizing:border-box }
[hidden]{ display:none!important }
html,body{ margin:0; padding:0 }
body{
  font-family: var(--vscode-font-family);
  font-size: var(--t-md);
  line-height: var(--lh-normal);
  color: var(--fg);
  background: var(--bg);
  height: 100vh;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
:focus{ outline:none }
:focus-visible{ box-shadow: var(--focus); border-radius: var(--r-sm) }
.sr-only{ position:absolute; width:1px; height:1px; margin:-1px; padding:0; overflow:hidden; clip:rect(0 0 0 0); border:0 }

`;
