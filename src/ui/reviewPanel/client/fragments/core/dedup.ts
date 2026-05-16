/**
 * Client-side dedupe + pending-findings buffer.
 *
 * dedupeFindingsClient — mirror of src/claude/parser.ts dedupeFindings, kept
 *   in lockstep so the panel's count matches the orchestrator after Phase C
 *   runs.
 * flushPendingPass / flushAllPending — drain the per-pass buffer that holds
 *   findings until the pass completes, so the user never sees a finding
 *   appear and then disappear during consolidation.
 * passLabelLong — i18n helper that is only used by renderTimeline today;
 *   colocated here because the timeline reads state.steps which is what the
 *   buffer ultimately feeds into.
 *
 * Reads: state.findings, state.pendingByPass, tMsg.
 * Writes: state.findings, state.pendingByPass.
 * Forward-references (resolved at call time): bumpCounter, renderFindings,
 *   renderRunCard.
 */
export const DEDUP = `
  function dedupeFindingsClient(findings){
    // Mirror of src/claude/parser.ts dedupeFindings — kept in lockstep so the
    // panel's count matches the orchestrator after Phase C runs.
    // Critique-decisioned findings (drop/merge/revise) live in state.findings
    // as the audit trail surfaced by the "Revised" chip. Never re-dedupe them
    // (the user would lose critique's explanation) and never pretend they're
    // duplicates of live findings. Partition first, dedupe only the live set,
    // then re-attach the decisioned tail.
    const live = [], archived = [];
    for (const f of findings){
      if (f && (f.decision === 'drop' || f.decision === 'merge')) archived.push(f);
      else live.push(f);
    }
    findings = live;
    const slack = 5;
    const STOP = new Set(['a','an','the','is','in','on','at','to','of','for','and','or','but','not','be','this','that','with','by','as','from','into','it','its','related','missing','should','could','may','might','when','if']);
    const norm = (s) => String(s||'').toLowerCase().replace(/^related:\\s*/i,'').replace(/[^a-z0-9]/g,'').slice(0, 40);
    const tokens = (s) => {
      const arr = String(s||'').toLowerCase().replace(/^related:\\s*/i,'').split(/[^a-z0-9]+/).filter(t => t.length >= 3 && !STOP.has(t));
      return new Set(arr);
    };
    const jaccard = (a, b) => {
      const ta = tokens(a), tb = tokens(b);
      if (ta.size === 0 || tb.size === 0) return 0;
      let inter = 0;
      for (const t of ta) if (tb.has(t)) inter++;
      const union = ta.size + tb.size - inter;
      return union === 0 ? 0 : inter / union;
    };
    const titlesSimilar = (a, b) => {
      const na = norm(a), nb = norm(b);
      if (!na || !nb) return false;
      if (na === nb) return true;
      if (na.length >= 12 && nb.includes(na)) return true;
      if (nb.length >= 12 && na.includes(nb)) return true;
      return jaccard(a, b) >= 0.5;
    };
    const isRelated = (f) => /^related:\\s*/i.test(f.title||'') || !!f.relatedTo;
    const overlap = (a, b, s) => (a.startLine - s) <= b.endLine && (b.startLine - s) <= a.endLine;
    const buckets = [];
    for (const f of findings){
      if (isRelated(f)){ buckets.push([f]); continue; }
      let placed = false;
      for (const b of buckets){
        const c = b[0];
        if (isRelated(c)) continue;
        if (c.file !== f.file) continue;
        if (!overlap(c.range, f.range, slack)) continue;
        if (titlesSimilar(c.title, f.title)) { b.push(f); placed = true; break; }
        if (c.category === f.category && overlap(c.range, f.range, 0)) { b.push(f); placed = true; break; }
        if (jaccard(c.title, f.title) >= 0.3) { b.push(f); placed = true; break; }
      }
      if (!placed) buckets.push([f]);
    }
    const rank = { critical:4, major:3, minor:2, nit:1, praise:0 };
    const deduped = buckets.map(b => b.sort((x,y) => (rank[y.severity]||0) - (rank[x.severity]||0))[0]);
    return deduped.concat(archived);
  }

  function passLabelLong(pass){
    return tMsg('timeline.' + pass);
  }

  /**
   * Move a pass's buffered findings into state.findings and refresh views.
   * Called from passDone; safe to call multiple times (each call drops what
   * was flushed). Also called from terminal events (paused/done) to drain any
   * stragglers from passes that ended without a passDone (e.g. via stop).
   *
   * Each buffer carries a buf.replaceAll flag set when the orchestrator
   * announced (via the findingAdded event) that this pass produces a full
   * replacement set. Today only critique sets it, but any future pass that
   * revises prior findings can opt in without the panel learning its name.
   */
  function flushPendingPass(pass){
    const buf = state.pendingByPass.get(pass);
    if (!buf || buf.length === 0){
      state.pendingByPass.delete(pass);
      return;
    }
    if (buf.replaceAll){
      // The pass returned the FULL revised set; mirror that on the panel by
      // swapping state.findings in place. Otherwise the user would see the
      // pre-revision findings + the revised ones side by side as duplicates.
      state.findings.splice(0, state.findings.length, ...buf);
    } else {
      // Append the new buffer, THEN dedupe the combined list. Without this
      // cross-pass dedupe step, two specialists that both flag the same SQL
      // injection would leave duplicate cards visible until the orchestrator's
      // Phase C consolidation eventually arrives — which can be tens of
      // seconds later when more passes are queued. The orchestrator runs the
      // same dedupe on its side after every pass; we mirror that here so the
      // UI converges immediately instead of waiting for the consolidation
      // event to round-trip.
      for (const f of buf) state.findings.push(f);
      const before = state.findings.length;
      state.findings = dedupeFindingsClient(state.findings);
      if (state.findings.length < before){
        // Drop any related-finding badge that pointed at an id we just merged
        // away. The badge would otherwise dead-link to a card that no longer
        // exists, scrolling the user to nothing.
        const liveIds = new Set(state.findings.map(f => f.id));
        for (const f of state.findings){
          if (f.relatedTo && !liveIds.has(f.relatedTo)) delete f.relatedTo;
        }
      }
    }
    state.pendingByPass.delete(pass);
    bumpCounter(); renderFindings(); renderRunCard();
  }
  function flushAllPending(){
    for (const pass of Array.from(state.pendingByPass.keys())) flushPendingPass(pass);
  }
`;
