import type { Lang, MsgKey } from '../../i18n';

export type Tr = (key: MsgKey, params?: Record<string, string | number>) => string;
export type TrE = (key: MsgKey, params?: Record<string, string | number>) => string;

export function renderBody(lang: Lang, tr: Tr, trE: TrE): string {
  return `
<body>
<div class="app">

  <header role="banner">
    <div class="brand" aria-label="${trE('panel.brand')}">
      <span class="brand-dot" aria-hidden="true"></span>
      <span>${trE('panel.brand')}</span>
    </div>
    <span id="branches" class="branches-pill" aria-live="polite"></span>
    <span id="verdict" class="verdict" data-v="idle" role="status" aria-live="polite">${trE('panel.verdictIdle')}</span>
    <span class="spacer"></span>
    <div class="counters" role="group" aria-label="${trE('panel.findingsBySeverity')}">
      <span class="counter" data-sev="critical" title="${trE('panel.criticalFindings')}"><span class="swatch" aria-hidden="true"></span><span class="sr-only">${trE('panel.critical')}:</span><b id="c-critical">0</b></span>
      <span class="counter" data-sev="major"    title="${trE('panel.majorFindings')}"   ><span class="swatch" aria-hidden="true"></span><span class="sr-only">${trE('panel.major')}:</span><b id="c-major">0</b></span>
      <span class="counter" data-sev="minor"    title="${trE('panel.minorFindings')}"   ><span class="swatch" aria-hidden="true"></span><span class="sr-only">${trE('panel.minor')}:</span><b id="c-minor">0</b></span>
      <span class="counter" data-sev="nit"      title="${trE('panel.nitFindings')}"     ><span class="swatch" aria-hidden="true"></span><span class="sr-only">${trE('panel.nit')}:</span><b id="c-nit">0</b></span>
      <span class="counter" data-sev="praise"   title="${trE('panel.praiseFindings')}"  ><span class="swatch" aria-hidden="true"></span><span class="sr-only">${trE('panel.praise')}:</span><b id="c-praise">0</b></span>
      <span class="counter" data-sev="silenced" title="${trE('panel.silencedFindings')}"><span class="swatch" aria-hidden="true"></span><span class="sr-only">${trE('panel.silenced')}:</span><b id="c-silenced">0</b></span>
    </div>
    <div class="toolbar">
      <div class="lang-toggle" role="group" aria-label="${trE('lang.toggleAria')}">
        <button class="lang-btn${lang === 'en' ? ' is-active' : ''}" type="button" data-lang="en" aria-pressed="${lang === 'en'}">${trE('lang.en')}</button>
        <button class="lang-btn${lang === 'es' ? ' is-active' : ''}" type="button" data-lang="es" aria-pressed="${lang === 'es'}">${trE('lang.es')}</button>
      </div>
      <button class="btn btn--ghost btn--xs" id="btn-export" type="button" aria-label="${trE('panel.exportAria')}">${trE('panel.export')}</button>
    </div>
  </header>

  <main id="main">
    <aside class="left" aria-label="${trE('panel.reviewControls')}">

      <button class="collapse-btn" id="btn-collapse" type="button" aria-label="${trE('panel.collapse')}" title="${trE('panel.collapseTitle')}">
        <span id="collapse-icon" aria-hidden="true">‹</span>
      </button>

      <div class="left-rail" id="left-rail" aria-hidden="true" aria-label="${trE('panel.collapsedSummary')}">
        <span class="rail-dot" id="rail-dot" data-state="idle" title="${trE('panel.statusTitle')}"></span>
        <div class="rail-vert" id="rail-branches" title=""></div>
        <div class="rail-vert" id="rail-pass" title="${trE('panel.currentPass')}"></div>
        <div class="rail-spinner" id="rail-spinner" aria-hidden="true"></div>
        <div class="rail-stats" id="rail-stats">
          <div class="rail-stat" data-sev="critical" title="${trE('panel.critical')}"><b id="rail-c-critical">0</b><span>crit</span></div>
          <div class="rail-stat" data-sev="major" title="${trE('panel.major')}"><b id="rail-c-major">0</b><span>maj</span></div>
          <div class="rail-stat" data-sev="minor" title="${trE('panel.minor')}"><b id="rail-c-minor">0</b><span>min</span></div>
          <div class="rail-stat" data-sev="nit" title="${trE('panel.nit')}"><b id="rail-c-nit">0</b><span>nit</span></div>
        </div>
      </div>

      <div class="left-full">

        <div class="resume-banner" id="resume-banner" role="alert">
          <span class="ico" aria-hidden="true">⏸</span>
          <div class="text">
            <h3 id="resume-banner-title">${trE('panel.pausedTitle')}</h3>
            <p id="resume-banner-detail"></p>
          </div>
          <div class="actions">
            <button class="primary" type="button" id="btn-resume">${trE('panel.resume')}</button>
            <button type="button" id="btn-discard-partial" title="${trE('panel.discardTitle')}">${trE('panel.discard')}</button>
          </div>
        </div>

        <section class="section" aria-labelledby="branch-picker-title">
          <h2 class="section-title" id="branch-picker-title">${trE('panel.branchPicker')}</h2>
          <div class="picker" role="group" aria-label="${trE('panel.chooseBaseHead')}">

            <div class="picker-row">
              <label class="sr-only" for="branch-filter">${trE('panel.filterBranches')}</label>
              <input
                class="search"
                id="branch-filter"
                type="search"
                placeholder="${trE('panel.branchFilterPlaceholder')}"
                autocomplete="off"
                spellcheck="false"
              />
              <button class="btn btn--ghost btn--xs" id="btn-fetch" type="button" title="${trE('panel.fetchTitle')}" aria-label="${trE('panel.fetchAria')}">
                <span aria-hidden="true">⟳</span> ${trE('panel.fetch')}
              </button>
            </div>

            <div class="picker-row">
              <label class="checkpill"><input type="checkbox" id="show-local" checked> ${trE('panel.local')}</label>
              <label class="checkpill"><input type="checkbox" id="show-remote" checked> ${trE('panel.remote')}</label>
              <span class="picker-meta" id="branches-meta" aria-live="polite"></span>
            </div>

            <div class="picker-cols">
              <div class="picker-col">
                <div class="picker-col-head"><span class="role">${trE('panel.base')}</span><span class="hint" id="base-current"></span></div>
                <div class="branch-list" id="base-list" role="listbox" aria-label="${trE('panel.baseAria')}" tabindex="0"></div>
              </div>
              <div class="picker-col">
                <div class="picker-col-head"><span class="role">${trE('panel.head')}</span><span class="hint" id="head-current"></span></div>
                <div class="branch-list" id="head-list" role="listbox" aria-label="${trE('panel.headAria')}" tabindex="0"></div>
              </div>
            </div>

            <div class="picker-actions">
              <span class="ab-pill" id="ab-pill" aria-live="polite"></span>
            </div>

            <div id="branch-error" class="notice notice--error" data-empty="1" role="alert"></div>
          </div>
        </section>

        <section class="section section--passes" aria-labelledby="passes-title">
          <div class="passes-head">
            <h2 class="section-title" id="passes-title">${trE('panel.analysisPasses')} <span class="passes-count" id="passes-count"></span></h2>
          </div>
          <div class="presets" id="presets" role="group" aria-label="${trE('panel.presetsLabel')}">
            <span class="presets__label">${trE('panel.presetsLabel')}</span>
            <button type="button" class="preset" data-preset="fast"     title="${trE('panel.presetFastTitle')}">${trE('panel.presetFast')}</button>
            <button type="button" class="preset" data-preset="deep"     title="${trE('panel.presetDeepTitle')}">${trE('panel.presetDeep')}</button>
            <button type="button" class="preset" data-preset="security" title="${trE('panel.presetSecurityTitle')}">${trE('panel.presetSecurity')}</button>
          </div>
          <div class="active-passes" id="active-passes" aria-live="polite" aria-label="${trE('panel.activePasses')}"></div>
          <div class="advanced-toggle">
            <button type="button" class="link advanced-toggle__btn" id="btn-toggle-advanced" aria-expanded="false" aria-controls="advanced-passes" title="${trE('panel.advancedHint')}">
              <span class="advanced-toggle__chev" aria-hidden="true">▸</span>
              <span class="advanced-toggle__label">${trE('panel.advanced')}</span>
            </button>
          </div>
          <div class="advanced-pane" id="advanced-passes" hidden>
            <div class="passes" id="passes" role="group" aria-label="${trE('panel.choosePasses')}"></div>
          </div>
        </section>

        <section class="section section--run" aria-labelledby="run-title">
          <div class="run-card" id="run-card" data-state="idle">
            <header class="run-card__head">
              <h2 class="run-card__title" id="run-title">${trE('panel.runSection')}</h2>
              <div class="run-card__chips" id="run-chips" aria-live="polite"></div>
            </header>
            <button class="btn btn--primary btn--lg run-card__btn" id="btn-start" type="button" aria-disabled="true" aria-label="${trE('panel.runSectionAria')}">
              <span aria-hidden="true" class="run-card__btn-icon">▶</span>
              <span class="run-card__btn-label">${trE('run.start')}</span>
            </button>
            <div class="run-card__msg" id="run-msg" role="status" aria-live="polite"></div>
            <!-- legacy id kept for renderPasses(); never visible in this card. -->
            <span id="passes-estimate" hidden></span>
          </div>
        </section>

        <section class="section" aria-labelledby="activity-title">
          <h2 class="section-title" id="activity-title">${trE('panel.liveActivity')}</h2>
          <div class="timeline" id="timeline" aria-live="polite"></div>
        </section>

        <section class="section" aria-labelledby="log-title">
          <div class="log-header">
            <h2 class="section-title" id="log-title">${trE('panel.log')} <span class="log-count" id="log-count"></span></h2>
            <button class="btn btn--ghost btn--xs" id="btn-copy-log" type="button" aria-label="${trE('panel.copyLogAria')}">${trE('panel.copy')}</button>
            <button class="btn btn--ghost btn--xs" id="btn-clear-log" type="button" aria-label="${trE('panel.clearLogAria')}">${trE('panel.clear')}</button>
          </div>
          <div class="live empty" id="live" role="log" aria-live="polite" aria-label="${trE('panel.reviewLog')}">${trE('panel.noActivity')}</div>
        </section>

      </div>

    </aside>

    <div class="gutter" id="gutter" role="separator" aria-orientation="vertical" aria-label="${trE('panel.resize')}" tabindex="0" aria-valuemin="280" aria-valuemax="720" aria-valuenow="420"></div>

    <section class="right" aria-label="${trE('panel.reviewResults')}">
      <div id="exec" class="exec" hidden>
        <h2>${trE('panel.execSummary')}</h2>
        <p id="exec-text"></p>
      </div>

      <div class="bullets" id="bullets" hidden>
        <div class="card"><h3>${trE('panel.topConcerns')}</h3><ul id="concerns"></ul></div>
        <div class="card"><h3>${trE('panel.strengths')}</h3><ul id="strengths"></ul></div>
      </div>

      <div class="filters-wrap">
        <div class="filters" role="group" aria-label="${trE('panel.filterBySeverity')}">
          <button class="filter" type="button" data-f="all" aria-pressed="true">${trE('panel.filterAll')}</button>
          <button class="filter" type="button" data-f="critical" aria-pressed="false">${trE('panel.critical')}</button>
          <button class="filter" type="button" data-f="major" aria-pressed="false">${trE('panel.major')}</button>
          <button class="filter" type="button" data-f="minor" aria-pressed="false">${trE('panel.minor')}</button>
          <button class="filter" type="button" data-f="nit" aria-pressed="false">${trE('panel.nit')}</button>
          <button class="filter" type="button" data-f="praise" aria-pressed="false">${trE('panel.praise')}</button>
          <button class="filter filter--silenced" type="button" data-f="silenced" aria-pressed="false" title="${trE('panel.silencedFilterTitle')}">${trE('panel.silenced')}</button>
          <label class="sr-only" for="search">${trE('panel.filterByText')}</label>
          <input class="search" id="search" type="search" placeholder="${trE('panel.findingsSearchPlaceholder')}" autocomplete="off" spellcheck="false" />
        </div>
        <div class="filters-cat" id="cat-filters" role="group" aria-label="${trE('panel.filterByCategory')}"></div>
      </div>

      <div id="changemap" class="changemap" hidden aria-label="${trE('changemap.title')}"></div>

      <div id="findings" class="findings" role="region" aria-label="${trE('panel.findingsRegion')}"></div>

      <div id="empty" class="empty-state">${tr('panel.emptyState')}</div>
    </section>
  </main>

</div>
`;
}
