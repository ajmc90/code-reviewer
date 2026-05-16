/**
 * Findings grid renderer and card builder.
 *
 * renderFindings filters state.findings by current severity/search/category
 * and rebuilds the grid. buildFindingCard generates one card's HTML.
 * rerenderFinding swaps a single card in place — used by the translation
 * flow so we don't reflow the entire grid for one row's language toggle.
 *
 * pickField / effectiveFindingLang resolve which language string to show
 * for a finding given the global LANG and per-row displayLang chip.
 */
export const FINDINGS = `
  // A finding is "revised" by self-critique if critique tagged it as drop /
  // merge / revise. Those rows live in state.findings as the audit trail but
  // are hidden from the main grid; the "Revised" filter surfaces them.
  function isRevisedFinding(f){
    return f.decision === 'drop' || f.decision === 'merge' || f.decision === 'revise';
  }
  function renderFindings(){
    const root = $('#findings'); root.innerHTML = '';
    const q = state.search.toLowerCase().trim();
    // Shared text + category filter — applied to every row regardless of
    // which group it ends up in (main / silenced / revised).
    function matchesTextAndCategory(f){
      if (state.categoryFilters.size && !state.categoryFilters.has(f.category || 'other')) return false;
      if (!q) return true;
      return [f.file,f.title,f.category,f.description].some(s=>String(s||'').toLowerCase().includes(q));
    }
    const wantRevised = state.filter === 'revised';
    const wantSilenced = state.filter === 'silenced';
    const wantAll = state.filter === 'all';
    // Three group buckets. For the dedicated chips (revised / silenced) we
    // bypass grouping entirely and show just that bucket — those chips ARE
    // the section header. The "all" filter shows everything but pushes the
    // audit-trail rows below their own separators so the user reads them as
    // aside, not as part of the main severity flow.
    const main = [];      // critical / major / minor / nit / praise / (no decision)
    const silenced = [];  // f.severity === 'silenced' (user-dismissed pattern that came back)
    const revised = [];   // f.decision === drop / merge / revise (critique audit trail)
    for (const f of state.findings){
      if (f.dismissed) continue;
      if (!matchesTextAndCategory(f)) continue;
      const isRevised = isRevisedFinding(f);
      const isSilenced = f.severity === 'silenced';
      if (wantRevised){
        if (isRevised) revised.push(f);
        continue;
      }
      if (wantSilenced){
        if (isSilenced) silenced.push(f);
        continue;
      }
      if (isRevised){
        if (wantAll) revised.push(f);
        continue;
      }
      if (isSilenced){
        if (wantAll) silenced.push(f);
        continue;
      }
      // Severity chips: must match the chip exactly (excluding revised/
      // silenced rows which were already routed above).
      if (!wantAll && f.severity !== state.filter) continue;
      main.push(f);
    }
    renderCategoryChips();
    // Live count next to the "Revisados" chip so the user knows how many
    // decisions critique made without having to click into the filter.
    const revisedCount = state.findings.filter(isRevisedFinding).length;
    const countEl = $('#filter-revised-count');
    if (countEl){
      countEl.textContent = revisedCount;
      countEl.hidden = revisedCount === 0;
    }
    const empty = $('#empty');
    const totalShown = main.length + silenced.length + revised.length;
    if (totalShown === 0){
      empty.hidden = false;
      // Distinguish "clean review" (truly zero findings) from "no match"
      // (everything got filtered out). The audit-trail rows (drop/merge)
      // shouldn't count toward "has findings" — a review where everything was
      // dropped should still read as "clean".
      const hasVisible = state.findings.some(function(f){
        return !f.dismissed && f.decision !== 'drop' && f.decision !== 'merge';
      });
      empty.textContent = state.result
        ? (hasVisible ? tMsg('panel.noMatch') : tMsg('panel.cleanReview'))
        : '';
      if (!state.result){
        empty.innerHTML = tMsg('panel.emptyState');
      }
      return;
    }
    empty.hidden = true;
    // Render main section (no header — those rows are the default content).
    for (const f of main) root.appendChild(buildFindingCard(f));
    // Aside sections only get their separator+header when filter=all AND
    // there's actually something to show. The dedicated chip filters
    // (revised / silenced) intentionally skip the separator: the chip in
    // the filter row already labels the list, a second header would be
    // redundant noise.
    if (wantAll && silenced.length > 0){
      root.appendChild(buildSectionDivider('silenced', silenced.length, tMsg('panel.silencedSectionTitle'), tMsg('panel.silencedSectionHint')));
      for (const f of silenced) root.appendChild(buildFindingCard(f));
    }
    if (wantAll && revised.length > 0){
      root.appendChild(buildSectionDivider('revised', revised.length, tMsg('panel.revisedSectionTitle'), tMsg('panel.revisedSectionHint')));
      for (const f of revised) root.appendChild(buildFindingCard(f));
    }
  }

  // Builds the horizontal-rule + title + count separator we put before the
  // silenced / revised sections when filter=all. Pulled out so the layout
  // stays consistent between both sections (and any future "aside" group).
  function buildSectionDivider(kind, count, title, hint){
    const el = document.createElement('div');
    el.className = 'findings-divider findings-divider--' + kind;
    el.setAttribute('role', 'separator');
    el.innerHTML =
      '<span class="findings-divider__line" aria-hidden="true"></span>' +
      '<span class="findings-divider__label">' +
        '<span class="findings-divider__title">'+esc(title)+'</span>' +
        '<span class="findings-divider__count">'+count+'</span>' +
        (hint ? '<span class="findings-divider__hint" title="'+escAttr(hint)+'" aria-hidden="true">ⓘ</span>' : '') +
      '</span>' +
      '<span class="findings-divider__line" aria-hidden="true"></span>';
    return el;
  }

  // Compute which language a finding's text is currently shown in.
  // Per-row displayLang (set via the in-card chip) wins; otherwise the
  // global LANG. Falls back to originalLang when no translation is cached yet.
  function effectiveFindingLang(f){
    const target = f.displayLang || LANG;
    const orig = f.originalLang || 'en';
    if (target === orig) return orig;
    if (f.translations && f.translations[target]) return target;
    return orig;
  }

  // Return the displayed string for one of a finding's translatable fields.
  function pickField(f, field){
    const target = f.displayLang || LANG;
    const orig = f.originalLang || 'en';
    if (target !== orig && f.translations && f.translations[target]) {
      const tr = f.translations[target];
      const v = tr[field];
      if (v !== undefined && v !== null) return v;
    }
    return f[field];
  }

  function buildFindingCard(f){
    const card = document.createElement('article');
    card.className = 'finding';
    card.dataset.id = f.id;
    card.dataset.severity = f.severity || 'minor';
    card.setAttribute('aria-expanded', 'false');
    const sev = f.severity || 'minor';
    const fix = f.suggestedFix;
    // Use translated field accessors so per-row chip and global toggle both work.
    const title = pickField(f, 'title') || '';
    const description = pickField(f, 'description') || '';
    const reasoning = pickField(f, 'reasoning') || '';
    const questionsRaised = pickField(f, 'questionsRaised') || [];
    const evidence = pickField(f, 'evidence') || [];
    const alternativesConsidered = pickField(f, 'alternativesConsidered') || [];
    // Translated fix fields when available; the code in suggestedFix.replacement
    // and structural fields like range/confidence are not translated.
    const fixTranslated = (() => {
      if (!fix) return null;
      const target = f.displayLang || LANG;
      const orig = f.originalLang || 'en';
      if (target !== orig && f.translations && f.translations[target] && f.translations[target].suggestedFix) {
        return f.translations[target].suggestedFix;
      }
      return { description: fix.description, replacement: fix.replacement };
    })();
    const showingLang = effectiveFindingLang(f);
    const otherLang = showingLang === 'es' ? 'en' : 'es';
    const otherLangLabel = tMsg('lang.' + otherLang);
    const otherLangFull = tMsg(otherLang === 'es' ? 'lang.spanishLong' : 'lang.englishLong');
    const isTranslating = !!f._translating;
    // Critique decision affects how the card renders: greyed out, badge added,
    // expanded body shows the reason and (for revise) what changed. Cards
    // without a decision render as before.
    const decision = f.decision;
    const decisionBadge = decision === 'drop'
      ? '<span class="decision-badge decision-badge--drop" title="'+escAttr(tMsg('card.decisionBadgeDroppedTooltip'))+'">'+esc(tMsg('card.decisionBadgeDropped'))+'</span>'
      : decision === 'merge'
      ? '<span class="decision-badge decision-badge--merge" title="'+escAttr(tMsg('card.decisionBadgeMergedTooltip'))+'">'+esc(tMsg('card.decisionBadgeMerged'))+'</span>'
      : decision === 'revise'
      ? '<span class="decision-badge decision-badge--revise" title="'+escAttr(tMsg('card.decisionBadgeRevisedTooltip'))+'">'+esc(tMsg('card.decisionBadgeRevised'))+'</span>'
      : '';
    if (decision) card.classList.add('finding--decision', 'finding--decision-' + decision);
    if (decision) card.dataset.decision = decision;
    // Build the "Critique's verdict" panel shown above .actions when the
    // finding carries a decision. Pulled out so the card-build string stays
    // legible.
    const decisionDetailHtml = (function(){
      if (!decision) return '';
      // Pull translated copies of the critique-decision prose when the user's
      // active language differs from originalLang and we already have a cached
      // translation. pickField returns the source string as a fallback, so a
      // not-yet-translated finding shows the original prose instead of going
      // blank.
      const decisionReason = pickField(f, 'decisionReason') || f.decisionReason || '';
      const translatedOriginal = (function(){
        if (!f.originalFinding) return null;
        const target = f.displayLang || LANG;
        const orig = f.originalLang || 'en';
        if (target !== orig && f.translations && f.translations[target] && f.translations[target].originalFinding){
          return f.translations[target].originalFinding;
        }
        return null;
      })();
      const blocks = [];
      // The reason critique gave — the single most user-valuable field.
      if (decisionReason){
        blocks.push(
          '<h4><span aria-hidden="true">🧠</span> '+esc(tMsg('card.decisionReasonLabel'))+'</h4>'+
          '<p class="decision-reason">'+esc(decisionReason)+'</p>'
        );
      }
      // Merge: surface the survivor + link/jump action.
      if (decision === 'merge'){
        const target = f.mergedIntoId
          ? (state.findings.find(function(x){ return x && x.id === f.mergedIntoId; }))
          : null;
        if (target){
          const targetLoc = esc(target.file)+':'+target.range.startLine;
          blocks.push(
            '<h4><span aria-hidden="true">🔗</span> '+esc(tMsg('card.decisionMergedIntoLabel'))+'</h4>'+
            '<p><a href="#" class="related-badge" data-related="'+escAttr(f.mergedIntoId)+'">'+
              esc(target.title)+' <span class="loc">'+targetLoc+'</span>'+
            '</a></p>'
          );
        } else {
          blocks.push(
            '<h4><span aria-hidden="true">🔗</span> '+esc(tMsg('card.decisionMergedIntoLabel'))+'</h4>'+
            '<p style="color:var(--fg-subtle)">'+esc(tMsg('card.decisionMergedIntoMissing'))+'</p>'
          );
        }
      }
      // Revise: show the pre-critique snapshot so the user can compare.
      if (decision === 'revise' && f.originalFinding){
        const o = f.originalFinding;
        // Translated prose fields override the original ones for display when
        // we have a cached translation; the enum/identifier fields (severity,
        // category, confidence, pass) never get translated.
        const oTitle = (translatedOriginal && translatedOriginal.title) || o.title;
        const oDescription = (translatedOriginal && translatedOriginal.description) || o.description;
        const oReasoning = (translatedOriginal && translatedOriginal.reasoning) || o.reasoning;
        // Compute which fields critique changed, so the user gets a quick
        // signal of what differs without diffing prose by eye.
        // Compare on the SOURCE strings (the snapshot fields are populated in
        // the original lang); comparing translated copies would generate
        // false "title changed" hits when the languages differ.
        const changedFields = [];
        if (o.severity !== f.severity) changedFields.push('severity ('+esc(o.severity)+' → '+esc(f.severity)+')');
        if (o.category !== f.category) changedFields.push('category ('+esc(o.category)+' → '+esc(f.category)+')');
        if (o.title !== f.title) changedFields.push('title');
        if (o.description !== f.description) changedFields.push('description');
        if (o.confidence !== f.confidence) changedFields.push('confidence ('+esc(o.confidence)+' → '+esc(f.confidence)+')');
        const changedLine = changedFields.length
          ? '<p class="decision-changed">'+esc(tMsg('card.decisionChangedFields', {fields: ''})) + changedFields.join(', ')+'</p>'
          : '';
        blocks.push(
          '<h4><span aria-hidden="true">📜</span> '+esc(tMsg('card.decisionOriginalLabel'))+'</h4>'+
          changedLine +
          '<div class="decision-original">'+
            '<div class="decision-original__head">'+
              '<span class="sev" data-sev="'+escAttr(o.severity)+'">'+esc(o.severity)+'</span>'+
              '<span class="cat">'+esc(o.category)+'</span>'+
              '<span class="title">'+esc(oTitle)+'</span>'+
            '</div>'+
            '<p>'+esc(oDescription)+'</p>'+
            (oReasoning ? '<p style="color:var(--fg-subtle)">'+esc(oReasoning)+'</p>' : '')+
            '<p class="decision-from-pass">'+esc(tMsg('card.decisionFromPass', {pass: o.pass}))+'</p>'+
          '</div>'
        );
      }
      // Drop: show which pass originally produced the finding (helps the user
      // judge whether they trust the original signal).
      if (decision === 'drop'){
        blocks.push(
          '<p class="decision-from-pass">'+esc(tMsg('card.decisionFromPass', {pass: f.pass||'?'}))+'</p>'
        );
      }
      // Wrap the block in a labelled section so when the card is expanded
      // the user immediately reads "this is critique's review of this
      // finding" — instead of inferring from a sea of h4s.
      const sectionIcon = decision === 'drop' ? '✕' : decision === 'merge' ? '⤳' : '✎';
      const sectionTitle = decision === 'drop'
        ? tMsg('card.decisionSectionDropped')
        : decision === 'merge'
        ? tMsg('card.decisionSectionMerged')
        : tMsg('card.decisionSectionRevised');
      return ''
        + '<section class="decision-detail" data-decision="'+escAttr(decision)+'" aria-label="'+escAttr(sectionTitle)+'">'
        +   '<header class="decision-detail__head">'
        +     '<span class="decision-detail__icon" aria-hidden="true">'+sectionIcon+'</span>'
        +     '<span class="decision-detail__title">'+esc(sectionTitle)+'</span>'
        +   '</header>'
        +   '<div class="decision-detail__body">'+blocks.join('')+'</div>'
        + '</section>';
    })();
    const locLabel = esc(f.file)+':'+f.range.startLine+(f.range.endLine!==f.range.startLine?'-'+f.range.endLine:'');
    // If the finding is "Related:" to a prior one, render a badge that jumps
    // to it. relatedTo is set by the parser when it links a Related: title to
    // an existing finding's id.
    const relatedBadge = f.relatedTo
      ? '<a class="related-badge" href="#" data-related="'+escAttr(f.relatedTo)+'" title="'+escAttr(tMsg('related.tooltip'))+'" aria-label="'+escAttr(tMsg('related.jumpTitle'))+'">'+esc(tMsg('related.badge'))+'</a>'
      : '';
    // Silenced findings get a badge that tells the user this is something
    // they previously dismissed — it came back, but Claude is honoring the
    // earlier decision and demoting it. Hover reveals the mode (this/pattern).
    const silencedBadge = f.severity === 'silenced'
      ? '<span class="silenced-badge" data-mode="'+escAttr(f.silencedMode||'this')+'" title="'+
          escAttr(tMsg(f.silencedMode === 'pattern' ? 'panel.silencedBadgeTooltipPattern' : 'panel.silencedBadgeTooltipThis'))+'">'+
          '<span aria-hidden="true">🔕</span> '+
          esc(tMsg(f.silencedMode === 'pattern' ? 'panel.silencedBadgePattern' : 'panel.silencedBadgeThis'))+
        '</span>'
      : '';
    card.innerHTML =
      '<div class="finding-head" role="button" tabindex="0" data-toggle="'+escAttr(f.id)+'" aria-controls="body-'+escAttr(f.id)+'" aria-label="'+escAttr(sev+': '+title)+'">' +
        '<svg class="chevron" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6 4l4 4-4 4z"/></svg>' +
        '<span class="sev" data-sev="'+escAttr(sev)+'">'+esc(sev)+'</span>' +
        '<span class="cat">'+esc(f.category||'other')+'</span>' +
        '<span class="title">'+esc(title)+'</span>' +
        relatedBadge +
        silencedBadge +
        decisionBadge +
        '<span class="loc" role="button" tabindex="0" data-open="'+escAttr(f.id)+'" aria-label="'+escAttr(tMsg('card.jumpTo', {loc: locLabel}))+'">'+locLabel+'</span>' +
        '<span class="conf">'+esc(f.confidence||'')+'</span>' +
        '<button class="lang-chip'+(isTranslating?' is-loading':'')+'" type="button" '+
          'data-act="translate" data-id="'+escAttr(f.id)+'" data-target="'+escAttr(otherLang)+'" '+
          'title="'+escAttr(tMsg('card.translateTo', {lang: otherLangFull}))+'" '+
          'aria-label="'+escAttr(tMsg('card.translateTo', {lang: otherLangFull}))+'">'+
          (isTranslating ? esc(tMsg('card.translating')) : esc(tMsg('lang.' + showingLang))) +
        '</button>' +
      '</div>' +
      '<div class="finding-body" id="body-'+escAttr(f.id)+'">' +
        '<div class="grid2">' +
          '<div class="col">' +
            '<h4><span aria-hidden="true">🔍</span> '+esc(tMsg('card.problem'))+'</h4>' +
            '<p>'+esc(description)+'</p>' +
            (reasoning ? '<h4><span aria-hidden="true">🧠</span> '+esc(tMsg('card.reasoning'))+'</h4><p>'+esc(reasoning)+'</p>' : '') +
            (questionsRaised && questionsRaised.length ? '<h4><span aria-hidden="true">❓</span> '+esc(tMsg('card.questions'))+'</h4><ul class="qa">'+questionsRaised.map(q=>'<li>'+esc(q)+'</li>').join('')+'</ul>' : '') +
            (evidence && evidence.length ? '<h4><span aria-hidden="true">📎</span> '+esc(tMsg('card.evidence'))+'</h4>'+evidence.map(e=>'<div class="evidence">'+esc(e)+'</div>').join('') : '') +
          '</div>' +
          '<div class="col">' +
            '<h4><span aria-hidden="true">🛠</span> '+esc(tMsg('card.solution'))+'</h4>' +
            (fix
              ? '<p>'+esc(fixTranslated.description||'')+'</p><pre class="fix">'+esc(fixTranslated.replacement||'')+'</pre><div class="fix-conf">'+esc(tMsg('card.fixConfidence', {level: fix.confidence||''}))+'</div>'
              : '<p style="color:var(--fg-subtle)">'+esc(tMsg('card.noAutoFix'))+'</p>') +
            (alternativesConsidered && alternativesConsidered.length ? '<h4><span aria-hidden="true">🔀</span> '+esc(tMsg('card.alternatives'))+'</h4><ul class="qa">'+alternativesConsidered.map(a=>'<li>'+esc(a)+'</li>').join('')+'</ul>' : '') +
            (f.relatedFiles && f.relatedFiles.length ? '<h4><span aria-hidden="true">🔗</span> '+esc(tMsg('card.relatedFiles'))+'</h4><ul class="qa">'+f.relatedFiles.map(a=>'<li>'+esc(a)+'</li>').join('')+'</ul>' : '') +
          '</div>' +
        '</div>' +
        decisionDetailHtml +
        '<div class="actions">' +
          // Apply fix gets primary treatment when present — it's the most
          // action-oriented thing the user can do. The other buttons stay
          // ghost so the card's CTA is unambiguous.
          (fix ? '<button class="btn btn--primary btn--xs btn--apply" type="button" data-act="apply" data-id="'+escAttr(f.id)+'" title="'+escAttr(tMsg('card.applyFixTitle'))+'">'+
            '<span class="btn__icon" aria-hidden="true">✦</span> '+esc(tMsg('card.applyFix'))+
          '</button>' : '') +
          '<button class="btn btn--ghost btn--xs" type="button" data-act="open" data-id="'+escAttr(f.id)+'">'+esc(tMsg('card.jumpToCode'))+'</button>' +
          '<button class="btn btn--ghost btn--xs" type="button" data-act="ask" data-id="'+escAttr(f.id)+'">'+esc(tMsg('card.askFollowUp'))+'</button>' +
          // When the finding is silenced, dismiss makes no sense (it already is).
          // Swap it for a Restore action that removes the stored rule.
          (f.severity === 'silenced'
            ? '<button class="btn btn--ghost btn--xs" type="button" data-act="restore" data-id="'+escAttr(f.id)+'" title="'+escAttr(tMsg('card.restoreTitle'))+'">'+esc(tMsg('card.restore'))+'</button>'
            : '<button class="btn btn--ghost btn--xs" type="button" data-act="dismiss" data-id="'+escAttr(f.id)+'">'+esc(tMsg('card.dismiss'))+'</button>') +
        '</div>' +
      '</div>';
    return card;
  }

  // Re-render a single finding card in place (for translation toggles).
  function rerenderFinding(id){
    const card = $('#findings').querySelector('[data-id="'+CSS.escape(id)+'"]');
    if (!card) return;
    const f = state.findings.find(x => x.id === id);
    if (!f) return;
    const wasExpanded = card.getAttribute('aria-expanded') === 'true';
    const replacement = buildFindingCard(f);
    if (wasExpanded) replacement.setAttribute('aria-expanded', 'true');
    card.parentNode.replaceChild(replacement, card);
  }
`;
