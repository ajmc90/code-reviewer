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
    // Compute counts for every severity chip — gives the user at-a-glance
    // distribution without having to click each filter. Counts mirror what
    // would render IF the user picked that chip (so "critical 3" means three
    // critical findings would show, regardless of current filter).
    var counts = { all: 0, critical: 0, major: 0, minor: 0, nit: 0, praise: 0, silenced: 0, revised: 0 };
    for (var i = 0; i < state.findings.length; i++){
      var f = state.findings[i];
      if (f.dismissed) continue;
      if (isRevisedFinding(f)){ counts.revised++; continue; }
      if (f.severity === 'silenced'){ counts.silenced++; counts.all++; continue; }
      if (counts[f.severity] != null) counts[f.severity]++;
      counts.all++;
    }
    var countEls = document.querySelectorAll('.filter__count[data-count-for]');
    for (var ci = 0; ci < countEls.length; ci++){
      var el = countEls[ci];
      var key = el.getAttribute('data-count-for');
      var n = counts[key] || 0;
      el.textContent = n;
      el.hidden = n === 0;
    }
    // The wrap as a whole only matters once there are findings or a finished
    // review — without that we want the welcome panel to own the right pane.
    var wrap = $('#filters-wrap');
    if (wrap) wrap.hidden = !state.result && state.findings.length === 0;
    // The right-pane "state surface" (welcome / in-progress / message) owns
    // the empty modes. Keep this renderer focused on findings; the surface
    // renderer figures out what to show based on state.isRunning,
    // state.result and visibleFindingsCount().
    renderRightPaneState();
    const totalShown = main.length + silenced.length + revised.length;
    if (totalShown === 0){
      return;
    }
    // Render main section (no header — those rows are the default content).
    for (const f of main) root.appendChild(buildFindingCard(f));
    // Aside sections only get their separator+header when filter=all AND
    // there's actually something to show. The dedicated chip filters
    // (revised / silenced) skip the separator (the chip in the filter row
    // already labels the list) but still need to render their cards — the
    // bucket was filled above for that purpose, and forgetting to flush it
    // here was the original cause of the "Revised chip shows N but the grid
    // is empty" bug.
    if (wantAll && silenced.length > 0){
      root.appendChild(buildSectionDivider('silenced', silenced.length, tMsg('panel.silencedSectionTitle'), tMsg('panel.silencedSectionHint')));
    }
    if (wantSilenced || wantAll){
      for (const f of silenced) root.appendChild(buildFindingCard(f));
    }
    if (wantAll && revised.length > 0){
      root.appendChild(buildSectionDivider('revised', revised.length, tMsg('panel.revisedSectionTitle'), tMsg('panel.revisedSectionHint')));
    }
    if (wantRevised || wantAll){
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
        (hint
          ? '<span class="findings-divider__hint tip-host" tabindex="0" aria-label="'+escAttr(hint)+'">'+
              '<span class="findings-divider__hint-dot" aria-hidden="true"></span>'+
              '<span class="tip tip--above" role="tooltip">'+
                '<span class="tip__hint">'+esc(hint)+'</span>'+
              '</span>'+
            '</span>'
          : '') +
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

  // Serialize a finding to plain text for the Copy button on the expanded
  // card. Mirrors the visual section order (severity/title/loc header, then
  // Problem → Reasoning → Solution → Open questions → Alternatives → Evidence
  // → Related files, then critique decision detail if any). Uses the same
  // pickField / extractPlainCode helpers the renderer uses so the user gets
  // the same language they're viewing and code without diff prefixes.
  function findingToPlainText(f){
    if (!f) return '';
    const lines = [];
    const sev = (f.severity || 'minor').toUpperCase();
    const title = pickField(f, 'title') || '';
    const loc = f.file ? (f.file + ':' + f.range.startLine +
      (f.range.endLine !== f.range.startLine ? '-' + f.range.endLine : '')) : '';
    lines.push('[' + sev + '] ' + title);
    if (loc) lines.push(loc);
    const metaParts = [];
    if (f.category) metaParts.push(f.category);
    if (f.confidence) metaParts.push(tMsg('card.confidenceLabel') + ': ' + f.confidence);
    if (metaParts.length) lines.push(metaParts.join(' · '));
    if (f.decision){
      const decLabel = f.decision === 'drop' ? tMsg('card.decisionBadgeDropped')
        : f.decision === 'merge' ? tMsg('card.decisionBadgeMerged')
        : tMsg('card.decisionBadgeRevised');
      lines.push(decLabel);
    }
    function pushSection(label, body){
      if (body == null || body === '') return;
      lines.push('');
      lines.push(label.toUpperCase());
      lines.push(body);
    }
    pushSection(tMsg('card.problem'), pickField(f, 'description') || '');
    const reasoning = pickField(f, 'reasoning') || '';
    if (reasoning) pushSection(tMsg('card.reasoning'), reasoning);
    const fix = f.suggestedFix;
    if (fix){
      const fixDesc = (function(){
        const target = f.displayLang || LANG;
        const orig = f.originalLang || 'en';
        if (target !== orig && f.translations && f.translations[target] && f.translations[target].suggestedFix){
          return f.translations[target].suggestedFix.description || '';
        }
        return fix.description || '';
      })();
      const fixCode = fix.newString || fix.replacement || '';
      const parts = [];
      if (fixDesc) parts.push(fixDesc);
      if (fix.confidence) parts.push(tMsg('card.fixConfChipLabel') + ' ' + tMsg('card.confidenceLabel').toLowerCase() + ': ' + fix.confidence);
      if (fixCode) parts.push(fixCode);
      pushSection(tMsg('card.solution'), parts.join('\\n\\n'));
    } else {
      pushSection(tMsg('card.solution'), tMsg('card.noAutoFix'));
    }
    const qs = pickField(f, 'questionsRaised') || [];
    if (qs.length){
      pushSection(tMsg('card.questions'), qs.map(function(q){ return '? ' + q; }).join('\\n'));
    }
    const alts = pickField(f, 'alternativesConsidered') || [];
    if (alts.length){
      pushSection(tMsg('card.alternatives'), alts.map(function(a){ return '→ ' + a; }).join('\\n'));
    }
    const ev = pickField(f, 'evidence') || [];
    if (ev.length){
      pushSection(tMsg('card.evidence'), ev.map(function(e){ return extractPlainCode(e); }).join('\\n\\n'));
    }
    if (f.relatedFiles && f.relatedFiles.length){
      pushSection(tMsg('card.relatedFiles'), f.relatedFiles.join('\\n'));
    }
    if (f.decision){
      const decisionReason = pickField(f, 'decisionReason') || f.decisionReason || '';
      const sectionTitle = f.decision === 'drop' ? tMsg('card.decisionSectionDropped')
        : f.decision === 'merge' ? tMsg('card.decisionSectionMerged')
        : tMsg('card.decisionSectionRevised');
      const blocks = [];
      if (decisionReason) blocks.push(tMsg('card.decisionReasonLabel') + ': ' + decisionReason);
      if (f.decision === 'merge'){
        const target = f.mergedIntoId
          ? (state.findings.find(function(x){ return x && x.id === f.mergedIntoId; }))
          : null;
        if (target){
          const targetLoc = target.file + ':' + target.range.startLine;
          blocks.push(tMsg('card.decisionMergedIntoLabel') + ': ' + target.title + ' (' + targetLoc + ')');
        } else {
          blocks.push(tMsg('card.decisionMergedIntoLabel') + ': ' + tMsg('card.decisionMergedIntoMissing'));
        }
      }
      if (f.decision === 'revise' && f.originalFinding){
        const o = f.originalFinding;
        const translatedOriginal = (function(){
          const target = f.displayLang || LANG;
          const orig = f.originalLang || 'en';
          if (target !== orig && f.translations && f.translations[target] && f.translations[target].originalFinding){
            return f.translations[target].originalFinding;
          }
          return null;
        })();
        const oTitle = (translatedOriginal && translatedOriginal.title) || o.title;
        const oDescription = (translatedOriginal && translatedOriginal.description) || o.description;
        const oReasoning = (translatedOriginal && translatedOriginal.reasoning) || o.reasoning;
        const changedFields = [];
        if (o.severity !== f.severity) changedFields.push('severity (' + o.severity + ' → ' + f.severity + ')');
        if (o.category !== f.category) changedFields.push('category (' + o.category + ' → ' + f.category + ')');
        if (o.title !== f.title) changedFields.push('title');
        if (o.description !== f.description) changedFields.push('description');
        if (o.confidence !== f.confidence) changedFields.push('confidence (' + o.confidence + ' → ' + f.confidence + ')');
        if (changedFields.length){
          blocks.push(tMsg('card.decisionChangedFields', {fields: ''}) + changedFields.join(', '));
        }
        const origBits = [
          tMsg('card.decisionOriginalLabel') + ':',
          '[' + (o.severity || '').toUpperCase() + '] ' + oTitle,
          oDescription,
        ];
        if (oReasoning) origBits.push(oReasoning);
        origBits.push(tMsg('card.decisionFromPass', {pass: o.pass}));
        blocks.push(origBits.join('\\n'));
      }
      if (f.decision === 'drop'){
        blocks.push(tMsg('card.decisionFromPass', {pass: f.pass || '?'}));
      }
      if (blocks.length){
        pushSection(sectionTitle, blocks.join('\\n\\n'));
      }
    }
    return lines.join('\\n');
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
    // Only the fix description is translated. The code fields (oldString /
    // newString / legacy replacement) stay verbatim across languages so the
    // applier can still match them against the source file.
    const fixDescription = (() => {
      if (!fix) return '';
      const target = f.displayLang || LANG;
      const orig = f.originalLang || 'en';
      if (target !== orig && f.translations && f.translations[target] && f.translations[target].suggestedFix) {
        return f.translations[target].suggestedFix.description || '';
      }
      return fix.description || '';
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
    // Render the decision badge as a tip-host so the explanation surfaces on
    // hover via the rich .tip pattern (consistent with verdict, preset, etc.)
    // instead of the browser's native title= tooltip which is small + bland.
    const decisionBadge = decision
      ? '<span class="decision-badge decision-badge--' + decision + ' tip-host" tabindex="0">' +
          esc(tMsg('card.decisionBadge' + (decision === 'drop' ? 'Dropped' : decision === 'merge' ? 'Merged' : 'Revised'))) +
          '<span class="tip tip--above" role="tooltip">' +
            '<span class="tip__hint">' +
              esc(tMsg('card.decisionBadge' + (decision === 'drop' ? 'Dropped' : decision === 'merge' ? 'Merged' : 'Revised') + 'Tooltip')) +
            '</span>' +
          '</span>' +
        '</span>'
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
          '<h4>'+esc(tMsg('card.decisionReasonLabel'))+'</h4>'+
          '<p class="decision-reason">'+escMd(decisionReason)+'</p>'
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
            '<h4>'+esc(tMsg('card.decisionMergedIntoLabel'))+'</h4>'+
            '<p><a href="#" class="related-badge" data-related="'+escAttr(f.mergedIntoId)+'">'+
              esc(target.title)+' <span class="loc">'+targetLoc+'</span>'+
            '</a></p>'
          );
        } else {
          blocks.push(
            '<h4>'+esc(tMsg('card.decisionMergedIntoLabel'))+'</h4>'+
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
          '<h4>'+esc(tMsg('card.decisionOriginalLabel'))+'</h4>'+
          changedLine +
          '<div class="decision-original">'+
            '<div class="decision-original__head">'+
              '<span class="sev" data-sev="'+escAttr(o.severity)+'">'+esc(o.severity)+'</span>'+
              '<span class="cat">'+esc(o.category)+'</span>'+
              '<span class="title">'+esc(oTitle)+'</span>'+
            '</div>'+
            '<p>'+escMd(oDescription)+'</p>'+
            (oReasoning ? '<p style="color:var(--fg-subtle)">'+escMd(oReasoning)+'</p>' : '')+
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
      const sectionTitle = decision === 'drop'
        ? tMsg('card.decisionSectionDropped')
        : decision === 'merge'
        ? tMsg('card.decisionSectionMerged')
        : tMsg('card.decisionSectionRevised');
      return ''
        + '<section class="decision-detail" data-decision="'+escAttr(decision)+'" aria-label="'+escAttr(sectionTitle)+'">'
        +   '<header class="decision-detail__head">'
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
          esc(tMsg(f.silencedMode === 'pattern' ? 'panel.silencedBadgePattern' : 'panel.silencedBadgeThis'))+
        '</span>'
      : '';
    // Header layout:
    //   row 1 — chevron · sev pill · TITLE (dominant) · badges · translate chip
    //   row 2 — category · ·dot· · [confidence when low/med] · ·dot· · path
    // Confidence:high is omitted because nearly every finding ships with
    // high confidence — showing it on every card adds noise without value.
    // The chip only surfaces when the model itself is unsure (low/medium),
    // which IS signal worth reading.
    const showConf = f.confidence && f.confidence !== 'high';
    // fix-confidence is no longer a header chip — it reads as a suffix on
    // the Solution prose ("Restore the user_id scoping. · fix confidence: high").
    // Inline keeps the visual weight off the section header and treats the
    // metric as commentary on the prose rather than a separate badge.
    const fixConfInline = fix && fix.confidence
      ? '<span class="fix-conf-inline" data-conf="'+escAttr(fix.confidence)+'">'+
          '<span class="fix-conf-inline__sep" aria-hidden="true">·</span>'+
          '<span class="fix-conf-inline__label">'+esc(tMsg('card.fixConfChipLabel'))+' '+esc(tMsg('card.confidenceLabel').toLowerCase())+':</span>'+
          ' <span class="fix-conf-inline__value">'+esc(fix.confidence)+'</span>'+
        '</span>'
      : '';
    const pathParts = splitPath(f.file);
    const lineSuffix = ':'+f.range.startLine+(f.range.endLine!==f.range.startLine?'-'+f.range.endLine:'');
    const pathHtml =
      '<span class="loc-path" role="button" tabindex="0" data-open="'+escAttr(f.id)+'" '+
        'aria-label="'+escAttr(tMsg('card.jumpTo', {loc: locLabel}))+'" '+
        'title="'+escAttr(locLabel)+'">'+
        (pathParts.dir ? '<span class="loc-path__dir">'+esc(pathParts.dir)+'</span>' : '')+
        '<span class="loc-path__file">'+esc(pathParts.file)+'</span>'+
        '<span class="loc-path__lines">'+esc(lineSuffix)+'</span>'+
      '</span>';

    // Body is a single column with a deliberate read order. Sections come in
    // two tiers:
    //   tier 1 (lead) — Problem, Solution. Bold uppercase + colored accent bar.
    //   tier 2 (sub)  — Reasoning, Open questions, Alternatives, Evidence,
    //                    Related files. Sentence-case, no bar, lighter weight.
    // This stops the body from reading as an index of equal-weight chapter
    // headings; the eye lands on Problem/Solution first, the rest reads as
    // commentary on those two.
    // Build the code-block head — language label + Copy button. The plain
    // copy text is stored in a sibling <template> the click handler reads on
    // demand, so the diff +/- prefixes never end up on the user's clipboard.
    function buildCodeHead(lang, copyText){
      const langChip = lang ? '<span class="code-block__lang">'+esc(lang)+'</span>' : '';
      if (!copyText) return '<div class="code-block__head">'+langChip+'</div>';
      const tplId = 'copy-'+Math.random().toString(36).slice(2,10);
      return '<div class="code-block__head">'+
          langChip +
          '<button type="button" class="code-block__copy" data-act="copy-code" data-tpl="'+escAttr(tplId)+'" '+
            'title="'+escAttr(tMsg('card.copyCode'))+'" aria-label="'+escAttr(tMsg('card.copyCode'))+'">'+
            '<svg viewBox="0 0 16 16" class="code-block__copy-icon code-block__copy-icon--idle" aria-hidden="true">'+
              '<path fill="currentColor" d="M5 2h7a1 1 0 0 1 1 1v9h-1V3H5V2zm-2 2h7a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm0 1v9h7V5H3z"/>'+
            '</svg>'+
            '<svg viewBox="0 0 16 16" class="code-block__copy-icon code-block__copy-icon--done" aria-hidden="true">'+
              '<path fill="currentColor" d="M13.5 4.5L6 12 2.5 8.5l1-1L6 10l6.5-6.5 1 1z"/>'+
            '</svg>'+
          '</button>'+
          '<template class="code-block__copy-src" data-tpl="'+escAttr(tplId)+'">'+esc(copyText)+'</template>'+
        '</div>';
    }

    const fixLang = fix && f.file ? langFromPath(f.file) : '';
    // The fix's resulting code comes from newString (current schema) and
    // falls back to legacy replacement so old history rows still render.
    const fixReplacement = fix ? (fix.newString || fix.replacement || '') : '';
    const fixBlock = (fix && fixReplacement)
      ? '<div class="code-block code-block--fix">'+
          buildCodeHead(fixLang, fixReplacement) +
          '<pre class="fix"><span class="code-line code-line--ctx" data-kind="ctx"><span class="code-line__text">'+esc(fixReplacement)+'</span></span></pre>'+
        '</div>'
      : '';

    // Evidence renders into ONE bordered block with all snippets stacked —
    // a diff is one unit. The per-line markup uses a real gutter column for
    // +/- so the user can copy the source without the diff prefixes coming
    // along for the ride. Multiple snippets get a .code-hunk-sep between
    // them (rendered as a faint rule) so multi-hunk diffs stay legible.
    const evidenceLang = f.file ? langFromPath(f.file) : '';
    const evidenceStart = f.range && typeof f.range.startLine === 'number' ? f.range.startLine : null;
    const evidenceJoined = (evidence && evidence.length)
      ? evidence
          .map(e => renderCodeLines(e, { startLine: evidenceStart, lineNumbers: true }))
          .join('<span class="code-hunk-sep" aria-hidden="true"></span>')
      : '';
    const evidencePlain = (evidence && evidence.length)
      ? evidence.map(e => extractPlainCode(e)).join('\\n\\n')
      : '';
    const evidenceBlock = (evidence && evidence.length)
      ? '<div class="code-block code-block--evidence">'+
          buildCodeHead(evidenceLang, evidencePlain) +
          '<pre class="evidence-pre">'+evidenceJoined+'</pre>'+
        '</div>'
      : '';

    const sections = [];
    sections.push(
      '<section class="fb-section fb-section--lead">'+
        '<h4 class="section-h section-h--lead">'+esc(tMsg('card.problem'))+'</h4>'+
        '<p>'+escMd(description)+'</p>'+
      '</section>'
    );
    if (reasoning){
      sections.push(
        '<section class="fb-section fb-section--sub">'+
          '<h4 class="section-h section-h--sub">'+esc(tMsg('card.reasoning'))+'</h4>'+
          '<p>'+escMd(reasoning)+'</p>'+
        '</section>'
      );
    }
    sections.push(
      '<section class="fb-section fb-section--lead">'+
        '<h4 class="section-h section-h--lead">'+esc(tMsg('card.solution'))+'</h4>'+
        (fix
          ? (fixDescription
              ? '<p>'+escMd(fixDescription)+fixConfInline+'</p>'
              : (fixConfInline ? '<p class="fix-conf-only">'+fixConfInline+'</p>' : ''))
            + fixBlock
          : '<p style="color:var(--fg-subtle)">'+esc(tMsg('card.noAutoFix'))+'</p>')+
      '</section>'
    );
    // Open questions: each question gets a left border + padding so it reads
    // as a distinct prompt the user might want to answer, not as a generic
    // bullet of more prose.
    if (questionsRaised && questionsRaised.length){
      sections.push(
        '<section class="fb-section fb-section--sub">'+
          '<h4 class="section-h section-h--sub">'+esc(tMsg('card.questions'))+'</h4>'+
          '<ul class="qa-list">'+questionsRaised.map(q=>
            '<li class="qa-list__item">'+
              '<span class="qa-list__mark" aria-hidden="true">?</span>'+
              '<span class="qa-list__text">'+escMd(q)+'</span>'+
            '</li>'
          ).join('')+'</ul>'+
        '</section>'
      );
    }
    if (alternativesConsidered && alternativesConsidered.length){
      sections.push(
        '<section class="fb-section fb-section--sub">'+
          '<details class="fb-collapse">'+
            '<summary class="fb-collapse__summary">'+
              '<span class="fb-collapse__chev" aria-hidden="true">›</span>'+
              '<span class="section-h section-h--sub section-h--inline">'+esc(tMsg('card.alternatives'))+'</span>'+
              '<span class="fb-collapse__count">'+alternativesConsidered.length+'</span>'+
            '</summary>'+
            '<ul class="alt-list fb-collapse__body">'+alternativesConsidered.map(a=>
              '<li class="alt-list__item">'+
                '<span class="alt-list__mark" aria-hidden="true">→</span>'+
                '<span class="alt-list__text">'+escMd(a)+'</span>'+
              '</li>'
            ).join('')+'</ul>'+
          '</details>'+
        '</section>'
      );
    }
    if (evidence && evidence.length){
      sections.push(
        '<section class="fb-section fb-section--sub">'+
          '<details class="fb-collapse">'+
            '<summary class="fb-collapse__summary">'+
              '<span class="fb-collapse__chev" aria-hidden="true">›</span>'+
              '<span class="section-h section-h--sub section-h--inline">'+esc(tMsg('card.evidence'))+'</span>'+
              '<span class="fb-collapse__count">'+evidence.length+'</span>'+
            '</summary>'+
            '<div class="fb-collapse__body">'+evidenceBlock+'</div>'+
          '</details>'+
        '</section>'
      );
    }
    if (f.relatedFiles && f.relatedFiles.length){
      sections.push(
        '<section class="fb-section fb-section--sub">'+
          '<h4 class="section-h section-h--sub">'+esc(tMsg('card.relatedFiles'))+'</h4>'+
          '<ul class="related-files">'+f.relatedFiles.map(a=>'<li><a href="#" class="related-file" data-open-path="'+escAttr(a)+'" title="'+escAttr(tMsg('card.openFileTitle', {file: a}))+'">'+esc(a)+'</a></li>').join('')+'</ul>'+
        '</section>'
      );
    }

    card.innerHTML =
      '<div class="finding-head" role="button" tabindex="0" data-toggle="'+escAttr(f.id)+'" aria-controls="body-'+escAttr(f.id)+'" aria-label="'+escAttr(sev+': '+title)+'">' +
        '<div class="finding-head__row finding-head__row--primary">' +
          '<svg class="chevron" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6 4l4 4-4 4z"/></svg>' +
          // Severity chip uses the outline variant — the card already carries
          // a colored left-stripe of the same severity. Two solid red blocks
          // (chip fill + stripe) was double-signalling; outline lets the chip
          // carry the LABEL while the stripe carries the COLOR.
          '<span class="sev sev--outline" data-sev="'+escAttr(sev)+'">'+esc(sev)+'</span>' +
          '<span class="title">'+esc(title)+'</span>' +
          relatedBadge +
          silencedBadge +
          decisionBadge +
          '<button class="lang-chip'+(isTranslating?' is-loading':'')+'" type="button" '+
            'data-act="translate" data-id="'+escAttr(f.id)+'" data-target="'+escAttr(otherLang)+'" '+
            'title="'+escAttr(tMsg('card.translateTo', {lang: otherLangFull}))+'" '+
            'aria-label="'+escAttr(tMsg('card.translateTo', {lang: otherLangFull}))+'">'+
            (isTranslating ? esc(tMsg('card.translating')) : esc(tMsg('lang.' + showingLang))) +
          '</button>' +
          // Copy-all button — surfaces a plain-text dump of the whole finding
          // for pasting into docs/tickets. Only shown when the card is
          // expanded (CSS-gated) so the collapsed strip stays uncluttered.
          '<button class="finding-copy" type="button" '+
            'data-act="copy-finding" data-id="'+escAttr(f.id)+'" '+
            'title="'+escAttr(tMsg('card.copyAll'))+'" aria-label="'+escAttr(tMsg('card.copyAll'))+'">'+
            '<svg viewBox="0 0 16 16" class="finding-copy__icon finding-copy__icon--idle" aria-hidden="true">'+
              '<path fill="currentColor" d="M5 2h7a1 1 0 0 1 1 1v9h-1V3H5V2zm-2 2h7a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm0 1v9h7V5H3z"/>'+
            '</svg>'+
            '<svg viewBox="0 0 16 16" class="finding-copy__icon finding-copy__icon--done" aria-hidden="true">'+
              '<path fill="currentColor" d="M13.5 4.5L6 12 2.5 8.5l1-1L6 10l6.5-6.5 1 1z"/>'+
            '</svg>'+
          '</button>' +
        '</div>' +
        // Meta strip — left cluster (category + optional confidence) joined by
        // dot separators; path floats to the right via margin-left:auto.
        // Building the left cluster separately means the dot separator only
        // sits BETWEEN visible left-side chips, never floating before the
        // right-aligned path (which would leave an orphan dot when confidence
        // is hidden).
        (function(){
          const left = [];
          left.push('<span class="cat">'+esc(f.category||'other')+'</span>');
          if (showConf){
            left.push('<span class="conf"><span class="conf__label">'+esc(tMsg('card.confidenceLabel'))+'</span> '+esc(f.confidence)+'</span>');
          }
          const sep = '<span class="meta-sep" aria-hidden="true"></span>';
          return '<div class="finding-head__row finding-head__row--meta">'+left.join(sep)+pathHtml+'</div>';
        })() +
      '</div>' +
      '<div class="finding-body" id="body-'+escAttr(f.id)+'">' +
        '<div class="fb-flow">' + sections.join('') + '</div>' +
        decisionDetailHtml +
        '<div class="actions">' +
          // Apply fix gets primary treatment when present — it's the most
          // action-oriented thing the user can do. The other buttons stay
          // ghost so the card's CTA is unambiguous.
          (fix ? '<button class="btn btn--primary btn--xs btn--apply" type="button" data-act="apply" data-id="'+escAttr(f.id)+'" title="'+escAttr(tMsg('card.applyFixTitle'))+'">'+esc(tMsg('card.applyFix'))+'</button>' : '') +
          '<button class="btn btn--ghost btn--xs" type="button" data-act="open" data-id="'+escAttr(f.id)+'">'+esc(tMsg('card.jumpToCode'))+'</button>' +
          '<button class="btn btn--ghost btn--xs" type="button" data-act="ask" data-id="'+escAttr(f.id)+'">'+esc(tMsg('card.askFollowUp'))+'</button>' +
          // Dismiss/Restore is destructive-adjacent — push right and add a
          // hairline separator so it reads as a distinct group from the
          // primary action cluster.
          '<span class="actions__spacer"></span>' +
          (f.severity === 'silenced'
            ? '<button class="btn btn--ghost btn--xs btn--quiet" type="button" data-act="restore" data-id="'+escAttr(f.id)+'" title="'+escAttr(tMsg('card.restoreTitle'))+'">'+
                '<span class="btn__icon" aria-hidden="true">↺</span> '+esc(tMsg('card.restore'))+
              '</button>'
            : '<button class="btn btn--ghost btn--xs btn--quiet" type="button" data-act="dismiss" data-id="'+escAttr(f.id)+'">'+
                '<span class="btn__icon" aria-hidden="true">×</span> '+esc(tMsg('card.dismiss'))+
              '</button>') +
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
