/**
 * Advanced options panel — surfaces the runtime knobs that affect cost and
 * detection quality, with the trade-off explained inline so users don't have
 * to dig through settings.json to know what each does.
 *
 * Lives inside the same #advanced-passes collapsible the pass selector
 * already uses (reuses the existing "▾ Advanced" toggle — no new opener).
 * Renders into #advanced-options which the template places below #passes.
 *
 * Each change writes through to vscode workspace settings (via the host's
 * updateSetting message), updates the local state for instant UI feedback,
 * and re-runs requestEstimate so the cost pill reflects the new config.
 */
export const ADVANCED_OPTIONS = `
  const DEPTH_OPTIONS = ['fast', 'balanced', 'deep', 'obsessive'];

  function renderAdvancedOptions(){
    const root = $('#advanced-options');
    if (!root) return;
    const depth = state.depth || 'deep';
    const useSessionReuse = state.useSessionReuse !== false;
    const devDiag = !!state.developerDiagnostics;

    root.innerHTML =
      // ─── Reasoning depth ───────────────────────────────────────
      '<div class="adv-opt adv-opt--depth">' +
        '<div class="adv-opt__label">' +
          '<span class="adv-opt__name">' + esc(tMsg('adv.depthName')) + '</span>' +
          '<span class="adv-opt__hint">' + esc(tMsg('adv.depthHint')) + '</span>' +
        '</div>' +
        '<div class="adv-opt__segmented" role="radiogroup" aria-label="' + escAttr(tMsg('adv.depthName')) + '">' +
          DEPTH_OPTIONS.map(d => {
            const selected = d === depth;
            return '<button type="button" role="radio" aria-checked="' + (selected ? 'true' : 'false') + '" ' +
                   'class="adv-opt__seg' + (selected ? ' adv-opt__seg--active' : '') + '" ' +
                   'data-setting="depth" data-value="' + escAttr(d) + '">' +
                   esc(tMsg('adv.depth.' + d)) +
                   '</button>';
          }).join('') +
        '</div>' +
      '</div>' +

      // ─── Session reuse ─────────────────────────────────────────
      '<label class="adv-opt adv-opt--toggle">' +
        '<div class="adv-opt__label">' +
          '<span class="adv-opt__name">' + esc(tMsg('adv.sessionReuseName')) + '</span>' +
          '<span class="adv-opt__hint">' + esc(tMsg('adv.sessionReuseHint')) + '</span>' +
        '</div>' +
        '<input type="checkbox" class="adv-opt__check" data-setting="useSessionReuse"' +
          (useSessionReuse ? ' checked' : '') + '/>' +
      '</label>' +

      // ─── Developer diagnostics ─────────────────────────────────
      '<label class="adv-opt adv-opt--toggle">' +
        '<div class="adv-opt__label">' +
          '<span class="adv-opt__name">' + esc(tMsg('adv.devDiagnosticsName')) + '</span>' +
          '<span class="adv-opt__hint">' + esc(tMsg('adv.devDiagnosticsHint')) + '</span>' +
        '</div>' +
        '<input type="checkbox" class="adv-opt__check" data-setting="developerDiagnostics"' +
          (devDiag ? ' checked' : '') + '/>' +
      '</label>';
  }

  /**
   * Called from the message router when the host pushes 'settings' — either
   * on initial ready or after updateSetting echoes back. Updates local state
   * to match what's actually in settings.json (truth source) and re-renders.
   */
  function applySettings(msg){
    if (typeof msg.depth === 'string') state.depth = msg.depth;
    if (typeof msg.useSessionReuse === 'boolean') state.useSessionReuse = msg.useSessionReuse;
    if (typeof msg.developerDiagnostics === 'boolean') state.developerDiagnostics = msg.developerDiagnostics;
    renderAdvancedOptions();
    // Cost estimate depends on depth + useSessionReuse, so refresh whenever
    // settings change.
    if (typeof requestEstimate === 'function') requestEstimate();
  }

  /**
   * Wire change events on the advanced options block. Delegates so segmented
   * buttons + checkboxes share a single listener.
   */
  function wireAdvancedOptions(){
    const root = $('#advanced-options');
    if (!root) return;
    root.addEventListener('click', (ev) => {
      const t = ev.target instanceof HTMLElement ? ev.target.closest('[data-setting]') : null;
      if (!t) return;
      const key = t.getAttribute('data-setting');
      if (!key) return;
      if (t.tagName === 'BUTTON'){
        const value = t.getAttribute('data-value');
        if (!value) return;
        // Optimistic update so the segmented control snaps immediately. The
        // host echoes back via 'settings' which re-renders to truth.
        state[key] = value;
        renderAdvancedOptions();
        vscode.postMessage({ type: 'updateSetting', key: mapSettingKey(key), value });
        if (typeof requestEstimate === 'function') requestEstimate();
      }
    });
    root.addEventListener('change', (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLInputElement)) return;
      const key = t.getAttribute('data-setting');
      if (!key) return;
      const value = t.checked;
      state[key] = value;
      vscode.postMessage({ type: 'updateSetting', key: mapSettingKey(key), value });
      if (typeof requestEstimate === 'function') requestEstimate();
    });
  }

  /**
   * Translate the panel's internal state key to the actual settings.json key
   * the host expects. They line up except for 'depth' → 'reasoningDepth'
   * (the settings key is more descriptive; the state key matches what the
   * estimator + UI labels use).
   */
  function mapSettingKey(internal){
    if (internal === 'depth') return 'reasoningDepth';
    return internal;
  }
`;
