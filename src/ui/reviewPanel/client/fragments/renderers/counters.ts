/**
 * Severity counter chips at the top of the panel + the find-count badge.
 * Reads state.findings, mutates DOM (#c-<sev>), nothing else.
 *
 * bumpCounter is called from many places (findingAdded, applyResult,
 * flushPendingPass, dedupe, etc). Keep it cheap — it scans state.findings
 * each call.
 */
export const COUNTERS = `
  function bumpCounter(){
    const counts = {critical:0, major:0, minor:0, nit:0, praise:0, silenced:0};
    for (const f of state.findings){
      // Skip critique-dropped/merged findings — they live in state.findings
      // for the audit trail but should not inflate the visible severity
      // counters. (Without this, the top-right strip would still show the
      // pre-critique count, exactly the bug we're fixing.)
      if (f.decision === 'drop' || f.decision === 'merge') continue;
      if (counts[f.severity] != null) counts[f.severity]++;
    }
    let total = 0;
    for (const k of Object.keys(counts)){
      total += counts[k];
      const el = $('#c-'+k);
      if (el){
        el.textContent = counts[k];
        const parent = el.closest('.counter');
        if (parent) parent.setAttribute('data-active', counts[k] > 0 ? '1' : '0');
      }
    }
    // Dim the whole strip when nothing has been found yet — six "0" pills
    // in the header are pure noise until a review has produced numbers.
    const strip = document.querySelector('.counters');
    if (strip) strip.setAttribute('data-empty', total === 0 ? '1' : '0');
    // Re-render the category chip strip too — keeping it on bumpCounter means
    // the chip counts track live findings the same way as the severity dots,
    // fixing the "chips lag behind during critique" inconsistency where the
    // chip totals stayed at the pre-critique numbers until passDone.
    if (typeof renderCategoryChips === 'function') renderCategoryChips();
    if (state.leftCollapsed) renderRail();
  }
`;
