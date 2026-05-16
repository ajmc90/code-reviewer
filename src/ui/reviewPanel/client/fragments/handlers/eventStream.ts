/**
 * The central event dispatcher. Routes each ReviewEvent from the orchestrator
 * to the appropriate state mutation + render. Also handles applyResult for
 * the final ReviewResult delivery.
 *
 * applyEvent is the *only* function that should mutate state.steps,
 * state.findings, state.consolidation, state.changeMap, and friends from a
 * server-side signal — keep it that way so the data flow stays auditable.
 *
 * Named A0/A1 (not 99) so it slots after collapse/buttons but before the
 * message router and the postlude.
 */
export const EVENT_STREAM = `
  function applyEvent(e){
    if (e.kind === 'start'){
      const pill = $('#branches');
      pill.setAttribute('data-visible', '1');
      pill.textContent = e.headBranch + ' ← ' + e.baseBranch;
      $('#verdict').dataset.v = 'running'; $('#verdict').textContent = 'RUNNING';
      state.findings = []; state.steps.clear(); state.result = null; state.isRunning = true;
      state.changeMap = []; state.consolidation = null; state.conditionalSkips = {};
      state.pendingByPass.clear();
      state.runStartedAt = e.at; state.currentPhase = null;
      $('#exec').hidden = true; $('#bullets').hidden = true;
      bumpCounter(); renderFindings(); renderTimeline(); renderBranchPicker(); renderResumeBanner(); renderChangeMap();
      appendLive('info', tMsg('log.reviewStarted', {head: e.headBranch, base: e.baseBranch}), 'review');
    } else if (e.kind === 'context'){
      state.steps.set('context', { status:'done', startedAt: e.at, endedAt: e.at, detail: (e.languages.join(', ')||'no lang') + (e.frameworks.length ? ' · '+e.frameworks.join(', ') : '') });
      renderTimeline();
      appendLive('info', tMsg('log.detected', {value: e.languages.join(', ')}), 'context');
    } else if (e.kind === 'diff'){
      state.steps.set('diff', { status:'done', startedAt: e.at, endedAt: e.at, detail: e.filesChanged+' files · +'+e.additions+' / -'+e.deletions + (e.truncated?' · TRUNCATED':'') });
      renderTimeline();
      appendLive('info', e.filesChanged+' files changed (+'+e.additions+'/-'+e.deletions+')'+(e.truncated?' [diff truncated]':''), 'diff');
    } else if (e.kind === 'passStart'){
      state.steps.set(e.pass, { status:'running', startedAt: e.at, detail: 'sending prompt to Claude…', lastActivity: '' });
      renderTimeline();
      appendLive('info', 'started', e.pass);
    } else if (e.kind === 'passOutput'){
      const step = state.steps.get(e.pass);
      const trimmed = String(e.chunk||'').trim();
      if (step){
        if (trimmed){
          step.lastActivity = trimmed.slice(0, 120);
          step.detail = 'streaming · ' + truncateForMeta(trimmed);
        }
        renderTimeline();
      }
      if (trimmed) appendLive('info', trimmed, e.pass);
    } else if (e.kind === 'passDone'){
      const existing = state.steps.get(e.pass) || {};
      state.steps.set(e.pass, { ...existing, status:'done', endedAt: e.at, detail: e.findingCount+' findings · '+(Math.round(e.durationMs/100)/10)+'s' });
      // Flush this pass's buffered findings into the visible list now that the
      // pass is complete. Holding them back during the pass avoids the
      // "appears then vanishes" effect when consolidation collapses duplicates.
      flushPendingPass(e.pass);
      renderTimeline();
      renderRunCard();
      appendLive('info', 'done · '+e.findingCount+' findings in '+(Math.round(e.durationMs/100)/10)+'s', e.pass);
    } else if (e.kind === 'passError'){
      const existing = state.steps.get(e.pass) || {};
      state.steps.set(e.pass, { ...existing, status:'error', endedAt: e.at, detail: e.error });
      // A failed pass produces no trustworthy findings — drop whatever it
      // streamed before the error so the count stays honest.
      state.pendingByPass.delete(e.pass);
      renderTimeline();
      appendLive('error', e.error, e.pass);
    } else if (e.kind === 'passAwaitDecision'){
      const existing = state.steps.get(e.pass) || {};
      state.steps.set(e.pass, { ...existing, status:'awaitDecision', endedAt: e.at, detail: tMsg('timeline.failedDecision', {error: e.error}) });
      renderTimeline();
      appendLive('warn', 'awaiting decision: '+e.error, e.pass);
    } else if (e.kind === 'passDecisionMade'){
      const existing = state.steps.get(e.pass) || {};
      // The next event (passStart for retry, paused for stop, nothing for skip)
      // will update status. For 'skip' specifically, transition here so the
      // step doesn't linger in awaitDecision while no further event arrives.
      if (e.decision === 'skip'){
        state.steps.set(e.pass, { ...existing, status:'skipped', endedAt: e.at, detail: tMsg('timeline.skipped') });
      } else if (e.decision === 'stop'){
        state.steps.set(e.pass, { ...existing, status:'error', endedAt: e.at, detail: existing.detail || tMsg('timeline.failed') });
      }
      renderTimeline();
      appendLive('info', 'decision: '+e.decision, e.pass);
    } else if (e.kind === 'paused'){
      // Drain anything still buffered (a pass may have streamed findings
      // without firing passDone before the pause). Better to show them than
      // silently drop signal.
      flushAllPending();
      state.isRunning = false;
      state.runStartedAt = null; state.currentPhase = null;
      $('#verdict').dataset.v = 'needs-changes'; $('#verdict').textContent = 'PAUSED';
      renderBranchPicker();
      renderTimeline();
      renderResumeBanner();
      appendLive('warn', tMsg('log.reviewPaused', {reason: e.reason}), 'review');
    } else if (e.kind === 'retryPassStart'){
      // Reserved for future use — the orchestrator currently fires passStart
      // for retries too, which is enough for the timeline.
    } else if (e.kind === 'findingAdded'){
      // Buffer per pass instead of pushing to state.findings immediately.
      // Findings are flushed on passDone (after the pass has reconciled and
      // consolidation has had a chance to merge), which removes the "appears
      // then disappears" flicker in the findings grid and counter.
      const pass = e.finding && e.finding.pass;
      if (pass){
        let buf = state.pendingByPass.get(pass);
        if (!buf){
          // Tag the buffer with the pass's emission mode. The orchestrator
          // tells us whether this pass produces additive findings (security,
          // performance, etc.) or a full replacement set (critique). The
          // panel doesn't need to know which pass does which — we just trust
          // the flag and replace vs. append on flush accordingly.
          buf = [];
          buf.replaceAll = !!e.replaceAll;
          state.pendingByPass.set(pass, buf);
        }
        buf.push(e.finding);
      } else {
        // No pass tag (shouldn't happen, but stay defensive) — render live.
        state.findings.push(e.finding); bumpCounter(); renderFindings(); renderRunCard();
      }
      appendLive('info', '+ ['+(e.finding.severity||'?')+'] '+e.finding.title+' @ '+e.finding.file+':'+e.finding.range.startLine, 'finding');
    } else if (e.kind === 'changeMap'){
      // explore pass produced its per-file classification — surface it as a
      // collapsible "Changes in this branch" section above the findings grid.
      state.changeMap = e.entries || [];
      renderChangeMap();
    } else if (e.kind === 'consolidation'){
      // Local Phase C ran. Stash the counters AND drop a synthetic step entry
      // into the same Map that drives the timeline — Maps preserve insertion
      // order, so consolidation lands in the right cronological slot (after
      // specialists, before critique) instead of always being rendered last.
      // The renderer detects this entry by its '__consolidation__' key and
      // renders the special UI from state.consolidation.
      state.consolidation = { before: e.before, after: e.after, merged: e.merged };
      state.steps.set('__consolidation__', {
        status: 'done',
        startedAt: e.at,
        endedAt: e.at,
        // detail/lastActivity unused — the renderer pulls from state.consolidation
      });
      // The orchestrator already replaced state.findings via splice, but the
      // panel keeps its own array — drop duplicates the same way.
      state.findings = dedupeFindingsClient(state.findings);
      // Clean up any relatedTo pointer that now points to a merged-away id —
      // otherwise clicking the "Related" badge would scroll to nothing.
      const liveIds = new Set(state.findings.map(f => f.id));
      for (const f of state.findings){
        if (f.relatedTo && !liveIds.has(f.relatedTo)) delete f.relatedTo;
      }
      bumpCounter(); renderFindings(); renderTimeline();
      appendLive('info', tMsg('consolidation.tooltip', {merged: e.merged, before: e.before, after: e.after}), 'consolidation');
    } else if (e.kind === 'conditionalSkip'){
      // A pass was skipped because a runtime condition was not met (e.g.
      // permute has nothing to alternativize). Render as a "skipped" timeline
      // entry whose tooltip explains why.
      state.conditionalSkips = state.conditionalSkips || {};
      state.conditionalSkips[e.pass] = e.reason;
      state.steps.set(e.pass, { status:'skipped', startedAt: e.at, endedAt: e.at, detail: tMsg('conditionalSkip.tooltip', {reason: e.reason}), autoSkipped: true });
      renderTimeline();
      appendLive('info', tMsg('conditionalSkip.tooltip', {reason: e.reason}), e.pass);
    } else if (e.kind === 'phaseStart'){
      // Track the current phase so the Run card can show "Phase X/N · label".
      state.currentPhase = e.phase;
      renderRunCard();
      appendLive('info', tMsg('phase.'+e.phase), 'phase');
    } else if (e.kind === 'log'){
      appendLive(e.level, e.message);
    } else if (e.kind === 'done'){
      flushAllPending();
      $('#verdict').dataset.v = e.verdict; $('#verdict').textContent = (e.verdict||'').toUpperCase();
      state.isRunning = false; state.runStartedAt = null; state.currentPhase = null;
      renderBranchPicker(); renderResumeBanner();
    } else if (e.kind === 'cancelled'){
      // Drop anything still buffered — the user canceled, partial in-flight
      // findings would be noise.
      state.pendingByPass.clear();
      $('#verdict').dataset.v = 'needs-changes'; $('#verdict').textContent = 'CANCELLED';
      state.isRunning = false; state.runStartedAt = null; state.currentPhase = null;
      renderBranchPicker(); renderResumeBanner();
    }
  }

  function applyResult(r){
    state.result = r;
    if (!r){
      $('#exec').hidden = true; $('#bullets').hidden = true;
      state.findings = []; bumpCounter(); renderFindings(); return;
    }
    state.findings = r.findings || [];
    bumpCounter(); renderFindings();
    $('#exec').hidden = false;
    $('#exec-text').textContent = r.summary.executiveSummary || '';
    $('#bullets').hidden = false;
    $('#concerns').innerHTML = (r.summary.topConcerns||[]).map(c => '<li>'+esc(c)+'</li>').join('') || '<li style="color:var(--fg-subtle)">none</li>';
    $('#strengths').innerHTML = (r.summary.strengths||[]).map(c => '<li>'+esc(c)+'</li>').join('') || '<li style="color:var(--fg-subtle)">none</li>';
    $('#verdict').dataset.v = r.summary.overallVerdict || 'approve-with-comments';
    $('#verdict').textContent = (r.summary.overallVerdict || '').toUpperCase();
    const pill = $('#branches');
    pill.setAttribute('data-visible', '1');
    pill.textContent = r.summary.branch + ' ← ' + r.summary.baseBranch;
  }
`;
