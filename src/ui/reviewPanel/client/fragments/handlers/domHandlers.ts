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
    //
    // We DON'T use Element.scrollIntoView() because it walks up the ancestor
    // chain scrolling every scrollable parent — in the VS Code webview that
    // ends up scrolling the document body too and pushes the panel header
    // off-screen (the body's overflow:hidden doesn't fully prevent it in
    // every webview build). Manual scroll of the dedicated .right container
    // is precise and contained.
    const related = t.closest('[data-related]');
    if (related instanceof HTMLElement){
      ev.preventDefault();
      const targetId = related.dataset.related;
      const targetCard = document.querySelector('.finding[data-id="'+CSS.escape(targetId)+'"]');
      if (targetCard){
        targetCard.setAttribute('aria-expanded', 'true');
        const scroller = targetCard.closest('.right') || targetCard.parentElement;
        if (scroller && scroller instanceof HTMLElement){
          // Center the card within the scroll container without affecting
          // any outer scroll context (header, sidebar, etc.).
          const cardRect = targetCard.getBoundingClientRect();
          const scrollerRect = scroller.getBoundingClientRect();
          const cardCenterInScroller = (cardRect.top - scrollerRect.top) + scroller.scrollTop + cardRect.height / 2;
          const targetScrollTop = cardCenterInScroller - scroller.clientHeight / 2;
          scroller.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' });
        }
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
    // Related-file link inside a finding card — open by path (no finding id),
    // routed through a dedicated command so the host can resolve it against
    // the workspace root and open the file at line 1.
    const pathOpener = t.closest('[data-open-path]');
    if (pathOpener instanceof HTMLElement && pathOpener.dataset.openPath){
      ev.preventDefault();
      vscode.postMessage({type:'openPath', path: pathOpener.dataset.openPath});
      ev.stopPropagation();
      return;
    }
    // Copy-finding button on the card header — serializes the whole finding
    // (problem, reasoning, solution, questions, alternatives, evidence,
    // related files, critique decision) to plain text and writes it to the
    // clipboard. Handled before the data-act router below so the catch-all
    // doesn't route it as "open" and so the parent .finding-head toggle
    // doesn't collapse the card.
    const copyFindingBtn = t.closest('[data-act="copy-finding"]');
    if (copyFindingBtn instanceof HTMLButtonElement){
      ev.preventDefault();
      ev.stopPropagation();
      const id = copyFindingBtn.dataset.id;
      const f = state.findings.find(x => x && x.id === id);
      if (!f) return;
      const text = findingToPlainText(f);
      const finish = () => {
        copyFindingBtn.classList.add('is-done');
        copyFindingBtn.title = tMsg('card.copyAllDone');
        setTimeout(() => {
          copyFindingBtn.classList.remove('is-done');
          copyFindingBtn.title = tMsg('card.copyAll');
        }, 1400);
      };
      if (navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(text).then(finish, () => {
          vscode.postMessage({type:'clipboardFallback', text});
          finish();
        });
      } else {
        vscode.postMessage({type:'clipboardFallback', text});
        finish();
      }
      return;
    }
    // Copy-code button on .code-block — reads its sibling <template> (which
    // holds the diff-prefix-stripped plain text) and writes to clipboard.
    // Handled here, before the data-act router below, because the copy
    // button has no data-id (it isn't per-finding-scoped).
    const copyBtn = t.closest('[data-act="copy-code"]');
    if (copyBtn instanceof HTMLButtonElement){
      ev.preventDefault();
      ev.stopPropagation();
      const tplId = copyBtn.dataset.tpl;
      const head = copyBtn.parentElement;
      const tpl = head ? head.querySelector('template[data-tpl="'+tplId+'"]') : null;
      const text = tpl ? tpl.innerHTML : '';
      // <template> stores escaped HTML entities in innerHTML — decode them
      // by writing through a textarea so &amp; / &lt; round-trip correctly
      // back to & / < on paste.
      const ta = document.createElement('textarea');
      ta.innerHTML = text;
      const decoded = ta.value;
      const finish = () => {
        copyBtn.classList.add('is-done');
        copyBtn.title = tMsg('card.copyCodeDone');
        setTimeout(() => {
          copyBtn.classList.remove('is-done');
          copyBtn.title = tMsg('card.copyCode');
        }, 1400);
      };
      // Try the async clipboard API; fall back to a hidden textarea + execCommand
      // for older / restricted webviews where Permissions-Policy may block it.
      if (navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(decoded).then(finish, () => {
          vscode.postMessage({type:'clipboardFallback', text: decoded});
          finish();
        });
      } else {
        vscode.postMessage({type:'clipboardFallback', text: decoded});
        finish();
      }
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
      // Apply Fix has to work even when the review is still streaming and the
      // extension host's lastResult hasn't been written yet (or points at an
      // earlier review). Send the finding payload itself so the applier never
      // has to look it up by id. Strip internal-only fields the host doesn't
      // need; everything else (suggestedFix, range, file) travels through.
      if (type === 'applyFix'){
        const f = state.findings.find(x => x.id === actEl.dataset.id);
        if (f){
          const { _translating, displayLang, translations, ...payload } = f;
          vscode.postMessage({ type, finding: payload });
        } else {
          vscode.postMessage({ type, id: actEl.dataset.id });
        }
      } else {
        vscode.postMessage({ type, id: actEl.dataset.id });
      }
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
