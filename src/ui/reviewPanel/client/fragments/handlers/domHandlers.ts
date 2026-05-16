/**
 * Two global delegated listeners that route clicks and keyboard activation
 * to the right handler based on closest-ancestor matches. Used by:
 *   - finding cards (expand, jump-to-code, apply fix, ask follow-up, dismiss,
 *     restore, translate)
 *   - related-finding badges (scroll + flash)
 *   - severity filter chips
 *   - header EN/ES toggle
 *
 * We widen the target check to Element (not HTMLElement) so clicks inside
 * <svg> — like the chevron used to expand a finding — still hit the
 * .closest() lookups. SVGElement extends Element but not HTMLElement, which
 * would otherwise make the chevron uniquely unclickable.
 */
export const DOM_HANDLERS = `
  document.addEventListener('click', (ev)=>{
    const t = ev.target;
    if (!(t instanceof Element)) return;

    // Header EN/ES toggle — postMessage to host, which calls back via
    // panel.onLanguageChanged() with the new lang.
    const langBtn = t.closest('.lang-btn');
    if (langBtn instanceof HTMLElement && langBtn.dataset.lang){
      vscode.postMessage({type:'setLang', lang: langBtn.dataset.lang});
      ev.stopPropagation();
      return;
    }

    if (t instanceof HTMLElement && t.matches('.filter')){
      state.filter = t.dataset.f;
      $$('.filter').forEach(b => b.setAttribute('aria-pressed', b === t ? 'true' : 'false'));
      renderFindings();
      return;
    }
    // Related-finding badge: scroll the target card into view, expand it, and
    // flash a brief highlight so the user can see where they landed.
    const related = t.closest('[data-related]');
    if (related instanceof HTMLElement){
      ev.preventDefault();
      const targetId = related.dataset.related;
      const targetCard = document.querySelector('.finding[data-id="'+CSS.escape(targetId)+'"]');
      if (targetCard){
        targetCard.setAttribute('aria-expanded', 'true');
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetCard.classList.add('finding--flash');
        setTimeout(() => targetCard.classList.remove('finding--flash'), 1200);
      }
      ev.stopPropagation();
      return;
    }
    const opener = t.closest('[data-open]');
    if (opener instanceof HTMLElement){
      vscode.postMessage({type:'open', id: opener.dataset.open});
      ev.stopPropagation();
      return;
    }
    const actEl = t.closest('[data-act]');
    if (actEl instanceof HTMLElement && actEl.dataset.id){
      const act = actEl.dataset.act;
      if (act === 'translate'){
        // Per-row language chip — request a translation if not cached, else
        // flip displayLang immediately and re-render this card alone.
        const id = actEl.dataset.id;
        const target = actEl.dataset.target;
        const f = state.findings.find(x => x.id === id);
        if (!f) { ev.stopPropagation(); return; }
        if ((f.originalLang || 'en') === target || (f.translations && f.translations[target])){
          f.displayLang = target;
          rerenderFinding(id);
        } else {
          f._translating = true;
          rerenderFinding(id);
          vscode.postMessage({type:'translateFinding', id, lang: target});
        }
        ev.stopPropagation();
        return;
      }
      const type =
        act === 'apply' ? 'applyFix'
        : act === 'ask' ? 'askFollowUp'
        : act === 'dismiss' ? 'dismiss'
        : act === 'restore' ? 'restore'
        : 'open';
      vscode.postMessage({type, id: actEl.dataset.id});
      ev.stopPropagation();
      return;
    }
    const head = t.closest('.finding-head');
    if (head){
      const card = head.closest('.finding');
      const expanded = card && card.getAttribute('aria-expanded') === 'true';
      if (card) card.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    }
  });

  document.addEventListener('keydown', (ev)=>{
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    if (t.matches('[data-open]')){
      ev.preventDefault();
      vscode.postMessage({type:'open', id: t.dataset.open});
      return;
    }
    if (t.matches('.finding-head')){
      ev.preventDefault();
      const card = t.closest('.finding');
      const expanded = card.getAttribute('aria-expanded') === 'true';
      card.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    }
  });
`;
