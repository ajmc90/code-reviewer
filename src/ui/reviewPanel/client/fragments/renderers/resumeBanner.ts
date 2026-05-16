/**
 * "Resume" banner shown above the run card when there is a saved partial
 * review state. Also exposes totalPassCount() which is used by the banner
 * (for the "X/Y passes pending" math) and by anyone else who needs to know
 * how many passes are turned on.
 */
export const RESUME_BANNER = `
  function renderResumeBanner(){
    const el = $('#resume-banner');
    if (!el) return;
    if (!state.partial || state.isRunning){
      el.removeAttribute('data-visible');
      return;
    }
    const p = state.partial;
    const remaining = totalPassCount() - p.completedPasses.length - p.skippedPasses.length;
    $('#resume-banner-title').textContent = tMsg('resume.title', {head: p.headBranch, base: p.baseBranch});
    const reason = p.pausedReason ? p.pausedReason : tMsg('resume.reasonDefault');
    const summary = tMsg('resume.summary', {
      completed: p.completedPasses.length,
      skipped: p.skippedPasses.length,
      pending: Math.max(0, remaining),
      findings: p.findingCount,
    });
    $('#resume-banner-detail').textContent = summary + ' — ' + reason;
    el.setAttribute('data-visible', '1');
  }

  function totalPassCount(){
    // Count active passes per the current opts.passes selection. We treat
    // anything the user toggled on as a "planned" pass for the % math.
    let n = 0;
    for (const k of Object.keys(state.passes)) if (state.passes[k]) n++;
    return n;
  }
`;
