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
      setVerdict('running', tMsg('panel.verdictRunning'));
      state.findings = []; state.steps.clear(); state.result = null; state.isRunning = true;
      state.changeMap = []; state.consolidation = null; state.conditionalSkips = {};
      state.pendingByPass.clear();
      state.runStartedAt = e.at; state.currentPhase = null;
      $('#summary').hidden = true;
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
      state.steps.set(e.pass, {
        status:'running', startedAt: e.at,
        detail: tMsg('timeline.phase.sending'),
        lastActivity: '',
        // Structured streaming state: incrementally accumulated as chunks arrive.
        // streamedChars counts text_delta bytes from the LLM (NEVER rendered raw —
        // those used to be the JSON-fragment noise on the Security row).
        // tools tracks which tools the CLI invoked. metrics holds the parsed
        // telemetry summary line once the pass finishes.
        streamedChars: 0, tools: [], metrics: null,
      });
      renderTimeline();
      appendLive('info', 'started', e.pass);
    } else if (e.kind === 'passOutput'){
      const step = state.steps.get(e.pass);
      const chunk = String(e.chunk||'');
      const trimmed = chunk.trim();
      if (step){
        const classified = classifyChunk(trimmed);
        if (classified.kind === 'metrics'){
          // Final per-pass telemetry line ("◆ $0.49 in=... out=... 63s tools=2").
          // Store it structured so the renderer can lay out chips instead of the
          // dense one-liner. The chunk itself is still appended to the live log
          // verbatim so the raw audit trail stays intact. Note: telemetry is
          // emitted AFTER passDone by the orchestrator, so step.status is
          // already 'done' here — the chips will render on the next paint.
          step.metrics = classified.metrics;
        } else if (step.status !== 'running'){
          // Phase/tool/streamText updates only matter while the pass is live.
          // After passDone we want the chips to stay; flipping detail back to
          // "Streaming · 1234 chars" because a late text_delta arrived would
          // be wrong.
        } else if (classified.kind === 'tool'){
          // Only remember unique tool names; multiple same-tool invocations
          // would otherwise spam the chip count.
          if (classified.tool && !step.tools.includes(classified.tool)){
            step.tools = step.tools.concat([classified.tool]);
          }
          step.detail = renderToolDetail(step.tools);
          step.lastActivity = '';
        } else if (classified.kind === 'phase'){
          // High-signal lifecycle marker (thinking/writing/retry/parsing).
          step.detail = classified.label;
          step.lastActivity = '';
        } else if (classified.kind === 'streamText'){
          // Raw text_delta from the LLM — this is the JSON-fragment noise we
          // hide. Surface only a char counter so the user still sees progress.
          step.streamedChars = (step.streamedChars||0) + chunk.length;
          step.detail = tMsg('timeline.phase.streaming', { chars: fmtCount(step.streamedChars) });
          step.lastActivity = '';
        }
        // 'noise' (empty, usage echoes, etc.) is ignored on purpose — keeps the
        // last meaningful detail visible instead of flickering back to blank.
        renderTimeline();
      }
      if (trimmed) appendLive('info', trimmed, e.pass);
    } else if (e.kind === 'passDone'){
      const existing = state.steps.get(e.pass) || {};
      state.steps.set(e.pass, { ...existing, status:'done', endedAt: e.at, findingCount: e.findingCount, durationMs: e.durationMs, detail: '' });
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
      if (state.stopWatchdog){ clearTimeout(state.stopWatchdog); state.stopWatchdog = null; }
      setVerdict('needs-changes', tMsg('panel.verdictPaused'));
      renderBranchPicker();
      renderTimeline();
      renderResumeBanner();
      renderRunCard();
      renderRightPaneState();
      renderCostPill();
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
      // In-progress right-pane panel lists these files; repaint so the user
      // sees them stream in instead of waiting for the next 1s tick.
      renderRightPaneState();
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
      setVerdict(e.verdict);
      state.isRunning = false; state.runStartedAt = null; state.currentPhase = null;
      if (state.stopWatchdog){ clearTimeout(state.stopWatchdog); state.stopWatchdog = null; }
      renderBranchPicker(); renderResumeBanner();
      // The run card pinned itself to "Stopping…" when the user clicked Stop;
      // without an explicit re-render here it stays that way forever because
      // the renderRunCard for the running state was only re-invoked by the
      // 1-second tick that stops firing once isRunning is false.
      renderRunCard();
      renderCostPill();
      // Right-pane state transitions out of "in-progress" — repaint so the
      // sticky header is torn down and either the welcome (no findings) or
      // a clean-review message takes its place.
      renderRightPaneState();
    } else if (e.kind === 'cancelled'){
      // Drop anything still buffered — the user canceled, partial in-flight
      // findings would be noise.
      state.pendingByPass.clear();
      setVerdict('needs-changes', tMsg('panel.verdictCancelled'));
      state.isRunning = false; state.runStartedAt = null; state.currentPhase = null;
      if (state.stopWatchdog){ clearTimeout(state.stopWatchdog); state.stopWatchdog = null; }
      renderBranchPicker(); renderResumeBanner();
      renderRunCard();
      renderCostPill();
      renderRightPaneState();
    }
  }

  // Heuristic severity for a concern bullet. The LLM writes the bullets as
  // free-form strings; we don't have a real link back to a finding. So we
  // sniff keywords/phrases that strongly correlate with critical/major work
  // to color the bullet dot. Unknown → neutral. False positives are cheap
  // (a gray dot becomes orange), so we err on the side of marking things.
  function classifyConcernSeverity(text){
    const t = String(text||'').toLowerCase();
    if (/\b(sqli|sql injection|rce|remote code execution|xss|csrf|idor|auth(?:n|z)? (?:bypass|forge|collapse)|token (?:forg|leak)|secret (?:committed|leak|expos)|credential (?:leak|theft|expos)|backdoor|deserializ|prototype pollut|path traversal|directory traversal|ssrf|open redirect|hardcoded (?:secret|password|key)|jwt[_\s-]?secret)\b/.test(t)) return 'critical';
    if (/\b(security|vulnerab|injection|leak|expose|leaks|leaking|race condition|deadlock|data loss|memory leak|infinite loop|crash|panic|unhandled|null deref|use after free|unauthor|enumerat|bypass|regression|breaks?|broken|fails?|incorrect|wrong|missing validation|removed validation|stripped|swallow)/.test(t)) return 'major';
    if (/\b(accessibility|a11y|keyboard|aria|focus|contrast|typo|naming|style|docs?|comment|warn|lint|smell)\b/.test(t)) return 'minor';
    return '';
  }

  function renderSummaryBar(summary){
    const root = $('#summary');
    const verdict = summary.overallVerdict || 'approve-with-comments';
    root.dataset.verdict = verdict;

    // Verdict pill (visible even when body is collapsed).
    const verdictIcon = root.querySelector('.summary__verdict-icon');
    if (verdictIcon){
      verdictIcon.textContent = verdict === 'block' ? '!' : verdict === 'needs-changes' ? '?' : verdict === 'praise' ? '★' : '✓';
    }
    const verdictLabel = $('#summary-verdict-label');
    if (verdictLabel) verdictLabel.textContent = tMsg('verdict.' + verdict + '.title');

    // Meta line — file/line counts. Tabular numerals so they stay aligned.
    const meta = $('#summary-meta');
    if (meta){
      const files = Number(summary.filesChanged) || 0;
      const adds = Number(summary.linesAdded) || 0;
      const dels = Number(summary.linesRemoved) || 0;
      meta.textContent = tMsg('panel.summaryMeta', { files, adds, dels });
    }

    // Severity chips in the bar — derived from the *real* findings, not from
    // the concern bullets, so the count is authoritative. Hidden when zero
    // for that severity so the bar doesn't show "0 critical".
    const chips = $('#summary-sev-chips');
    if (chips){
      const counts = { critical: 0, major: 0, minor: 0 };
      for (const f of (state.findings || [])){
        if (counts[f.severity] !== undefined) counts[f.severity]++;
      }
      chips.innerHTML = ['critical','major','minor'].map(sev => {
        const n = counts[sev];
        const hidden = n === 0 ? ' hidden' : '';
        return '<span class="summary__sev-chip" data-sev="'+sev+'"'+hidden+'>'
          + '<span class="summary__sev-dot" aria-hidden="true"></span>'
          + n + ' ' + tMsg('panel.' + sev)
          + '</span>';
      }).join('');
    }
  }

  function renderSummaryBody(summary){
    const lead = $('#exec-text');
    const text = summary.executiveSummary || '';
    // innerHTML is safe here — escMd HTML-escapes first, then only adds
    // a fixed <code class="md-code"> wrapper around backtick spans. No
    // user-controlled tags survive the escape pass.
    lead.innerHTML = escMd(text);

    // Long summaries get clamped to 3 lines + inline expand toggle. The
    // threshold is generous (240 chars) so short summaries aren't gratuitously
    // truncated.
    const isLong = text.length > 240;
    lead.classList.toggle('summary__lead--clamped', isLong);
    const root = $('#summary');
    let expand = root.querySelector('.summary__expand');
    if (isLong){
      if (!expand){
        expand = document.createElement('button');
        expand.type = 'button';
        expand.className = 'summary__expand';
        expand.textContent = tMsg('panel.execExpand');
        expand.addEventListener('click', () => {
          const clamped = lead.classList.toggle('summary__lead--clamped');
          expand.textContent = tMsg(clamped ? 'panel.execExpand' : 'panel.execCollapse');
        });
        // Insert right after the lead paragraph.
        lead.insertAdjacentElement('afterend', expand);
      } else {
        expand.hidden = false;
        expand.textContent = tMsg('panel.execExpand');
      }
    } else if (expand){
      expand.hidden = true;
    }

    // Concerns — each bullet gets a heuristic severity for the colored dot.
    const concerns = summary.topConcerns || [];
    const concernsWrap = $('#summary-concerns');
    if (concerns.length){
      concernsWrap.hidden = false;
      $('#concerns-count').textContent = '· ' + concerns.length;
      $('#concerns').innerHTML = concerns.map(c => {
        const sev = classifyConcernSeverity(c);
        const attr = sev ? ' data-sev="'+sev+'"' : '';
        return '<li'+attr+'>'+escMd(c)+'</li>';
      }).join('');
    } else {
      concernsWrap.hidden = true;
    }

    // Strengths — secondary, smaller, no severity coloring.
    const strengths = summary.strengths || [];
    const strengthsWrap = $('#summary-strengths');
    if (strengths.length){
      strengthsWrap.hidden = false;
      $('#strengths-count').textContent = '· ' + strengths.length;
      $('#strengths').innerHTML = strengths.map(s => '<li>'+escMd(s)+'</li>').join('');
    } else {
      strengthsWrap.hidden = true;
    }
  }

  function applySummaryCollapse(){
    const root = $('#summary');
    if (root.hidden) return;
    const collapsed = !!state.summaryCollapsed;
    const body = $('#summary-body');
    const toggle = $('#summary-toggle');
    body.hidden = collapsed;
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  }

  function applyResult(r){
    state.result = r;
    if (!r){
      $('#summary').hidden = true;
      state.findings = []; bumpCounter(); renderFindings(); return;
    }
    state.findings = r.findings || [];
    bumpCounter(); renderFindings();

    const root = $('#summary');
    root.hidden = false;
    renderSummaryBar(r.summary);
    renderSummaryBody(r.summary);
    applySummaryCollapse();

    setVerdict(r.summary.overallVerdict || 'approve-with-comments');
    const pill = $('#branches');
    pill.setAttribute('data-visible', '1');
    pill.textContent = r.summary.branch + ' ← ' + r.summary.baseBranch;
  }
`;
