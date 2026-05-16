/**
 * Per-category filter chips above the findings grid. Reads state.findings +
 * state.categoryFilters, mutates state.categoryFilters when chips are
 * clicked (handled in the delegated click handler, not here).
 *
 * Cleans up stale entries in state.categoryFilters that no longer have
 * findings backing them — keeps the filter sane after dismissals.
 */
export const CATEGORY_CHIPS = `
  function categoryCounts(){
    const counts = {};
    for (const f of state.findings){
      if (f.dismissed) continue;
      // Critique-dropped/merged findings are surfaced under the dedicated
      // "Revisados" filter chip, not in the category strip. Excluding them
      // here keeps the chip totals in sync with what's actually showing in
      // the grid for every filter except 'revised'.
      if (f.decision === 'drop' || f.decision === 'merge') continue;
      const c = f.category || 'other';
      counts[c] = (counts[c] || 0) + 1;
    }
    return counts;
  }
  function renderCategoryChips(){
    const root = $('#cat-filters');
    if (!root) return;
    const counts = categoryCounts();
    const total = Object.values(counts).reduce((a,b)=>a+b,0);
    const present = CATEGORY_DEFS.filter(c => counts[c]).sort((a,b) => counts[b] - counts[a]);
    if (total === 0){
      // No findings yet — keep the row visible but empty/quiet
      root.innerHTML = '';
      return;
    }
    const cleanedFilters = new Set(Array.from(state.categoryFilters).filter(c => counts[c]));
    if (cleanedFilters.size !== state.categoryFilters.size){
      state.categoryFilters = cleanedFilters;
    }
    const html = ['<span class="filter-cat-label">Category</span>'];
    html.push('<button class="cat-chip" type="button" data-cat-all="1" aria-pressed="'+(state.categoryFilters.size===0?'true':'false')+'" title="Show all categories">all <span class="count">'+total+'</span></button>');
    for (const c of present){
      const pressed = state.categoryFilters.has(c);
      html.push('<button class="cat-chip" type="button" data-cat="'+escAttr(c)+'" aria-pressed="'+(pressed?'true':'false')+'" title="Toggle '+escAttr(c)+'">'+esc(c)+' <span class="count">'+counts[c]+'</span></button>');
    }
    root.innerHTML = html.join('');
  }
`;
