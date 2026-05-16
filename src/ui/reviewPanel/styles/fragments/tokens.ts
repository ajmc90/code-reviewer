/**
 * Design tokens — single source of truth for spacing, type, color, radii.
 */
export const TOKENS_CSS = String.raw`
/* ─────────────────────────────────────────────────────────────────
 * Design tokens — single source of truth for spacing, type, color.
 * ────────────────────────────────────────────────────────────── */
:root{
  /* Spacing — 4px base */
  --s-1: 4px;  --s-2: 8px;  --s-3: 12px; --s-4: 16px;
  --s-5: 20px; --s-6: 24px; --s-7: 32px; --s-8: 40px;

  /* Type scale — 12 / 13 / 14 / 16 / 18 / 22 */
  --t-xs: 11px; --t-sm: 12px; --t-md: 13px; --t-lg: 14px; --t-xl: 16px; --t-2xl: 18px; --t-3xl: 22px;
  --lh-tight: 1.25; --lh-normal: 1.5; --lh-loose: 1.6;

  /* Radius */
  --r-sm: 4px; --r-md: 6px; --r-lg: 8px; --r-xl: 10px;

  /* Color — inherit from VS Code theme, with safe fallbacks */
  --bg:        var(--vscode-editor-background);
  --bg-elev:   var(--vscode-sideBar-background, var(--bg));
  --bg-inset:  var(--vscode-input-background, var(--bg));
  --bg-code:   var(--vscode-textCodeBlock-background, rgba(127,127,127,.1));
  --fg:        var(--vscode-foreground);
  --fg-muted:  color-mix(in srgb, var(--vscode-foreground) 65%, transparent);
  --fg-subtle: color-mix(in srgb, var(--vscode-foreground) 45%, transparent);
  --border:    var(--vscode-panel-border, rgba(127,127,127,.25));
  --border-strong: color-mix(in srgb, var(--vscode-foreground) 18%, transparent);

  /* Brand */
  --accent: #7c5cff;
  --accent-fg: #ffffff;
  --accent-tint: color-mix(in srgb, var(--accent) 14%, transparent);
  --accent-hover: #8c6dff;

  /* Severity — AA contrast verified on both light & dark themes */
  --sev-critical: #e5484d;
  --sev-major:    #f4b03c;
  --sev-minor:    #4493f8;
  --sev-nit:      #2eb886;
  --sev-praise:   #a374ff;
  /* Silenced is intentionally low-contrast — these are findings the user
     asked Claude to stop showing. They're visible but never compete with
     real-severity findings for attention. */
  --sev-silenced: #8a8a8a;

  /* Focus ring — same on all interactive elements */
  --focus: 0 0 0 2px var(--bg), 0 0 0 4px var(--accent);

  /* Motion */
  --dur-fast: 120ms;
  --dur-med: 200ms;
  --ease: cubic-bezier(.2,.7,.3,1);
}
@media (prefers-reduced-motion: reduce){
  :root{ --dur-fast: 0ms; --dur-med: 0ms; }
  *,*::before,*::after{ animation-duration:0ms!important; animation-iteration-count:1!important; transition-duration:0ms!important }
}

`;
