import type { Lang, MsgKey } from '../../i18n';

export type Tr = (key: MsgKey, params?: Record<string, string | number>) => string;
export type TrE = (key: MsgKey, params?: Record<string, string | number>) => string;

export function renderBody(lang: Lang, _tr: Tr, trE: TrE): string {
  return `
<body>
<div class="app">

  <header role="banner">
    <div class="brand" aria-label="${trE('panel.brand')}">
      <span class="brand-dot" aria-hidden="true"></span>
      <span>${trE('panel.brand')}</span>
    </div>
    <span id="branches" class="branches-pill" aria-live="polite"></span>
    <span id="verdict" class="verdict tip-host" data-v="idle" role="status" aria-live="polite" tabindex="0">
      <span id="verdict-label">${trE('panel.verdictIdle')}</span>
      <!--
        Header verdict sits at the very top of the viewport, so the tooltip
        MUST open downward — tip--above would clip outside the window and be
        invisible. Combined with tip--end so the popover aligns to the right
        edge of the badge (the badge is near the right side of the header,
        opening from the left edge could also clip the viewport).
      -->
      <span id="verdict-tip" class="tip tip--end" role="tooltip" hidden>
        <span class="tip__title" id="verdict-tip-title"></span>
        <span class="tip__hint" id="verdict-tip-hint"></span>
      </span>
    </span>
    <span class="spacer"></span>
    <div class="counters" role="group" aria-label="${trE('panel.findingsBySeverity')}" data-empty="1">
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
            <button class="btn btn--primary" type="button" id="btn-resume">${trE('panel.resume')}</button>
            <button class="btn btn--ghost" type="button" id="btn-discard-partial" title="${trE('panel.discardTitle')}">${trE('panel.discard')}</button>
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
            <button type="button" class="preset" data-preset="fast" aria-describedby="preset-tip-fast">
              <span class="preset__label">${trE('panel.presetFast')}</span>
              <span class="preset-tip" id="preset-tip-fast" role="tooltip">
                <span class="preset-tip__title">${trE('panel.presetFast')}</span>
                <span class="preset-tip__hint">${trE('panel.presetFastTitle')}</span>
                <span class="preset-tip__detail">${trE('panel.presetFastPasses')}</span>
              </span>
            </button>
            <button type="button" class="preset" data-preset="deep" aria-describedby="preset-tip-deep">
              <span class="preset__label">${trE('panel.presetDeep')}</span>
              <span class="preset-tip" id="preset-tip-deep" role="tooltip">
                <span class="preset-tip__title">${trE('panel.presetDeep')}</span>
                <span class="preset-tip__hint">${trE('panel.presetDeepTitle')}</span>
                <span class="preset-tip__detail">${trE('panel.presetDeepPasses')}</span>
              </span>
            </button>
            <button type="button" class="preset" data-preset="security" aria-describedby="preset-tip-security">
              <span class="preset__label">${trE('panel.presetSecurity')}</span>
              <span class="preset-tip" id="preset-tip-security" role="tooltip">
                <span class="preset-tip__title">${trE('panel.presetSecurity')}</span>
                <span class="preset-tip__hint">${trE('panel.presetSecurityTitle')}</span>
                <span class="preset-tip__detail">${trE('panel.presetSecurityPasses')}</span>
              </span>
            </button>
            <button type="button" class="preset" data-preset="performance" aria-describedby="preset-tip-performance">
              <span class="preset__label">${trE('panel.presetPerformance')}</span>
              <span class="preset-tip" id="preset-tip-performance" role="tooltip">
                <span class="preset-tip__title">${trE('panel.presetPerformance')}</span>
                <span class="preset-tip__hint">${trE('panel.presetPerformanceTitle')}</span>
                <span class="preset-tip__detail">${trE('panel.presetPerformancePasses')}</span>
              </span>
            </button>
            <button type="button" class="preset" data-preset="accessibility" aria-describedby="preset-tip-accessibility">
              <span class="preset__label">${trE('panel.presetAccessibility')}</span>
              <span class="preset-tip" id="preset-tip-accessibility" role="tooltip">
                <span class="preset-tip__title">${trE('panel.presetAccessibility')}</span>
                <span class="preset-tip__hint">${trE('panel.presetAccessibilityTitle')}</span>
                <span class="preset-tip__detail">${trE('panel.presetAccessibilityPasses')}</span>
              </span>
            </button>
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
            <div class="adv-opts" id="advanced-options" aria-label="${trE('adv.sectionAria')}"></div>
          </div>
        </section>

        <section class="section" aria-labelledby="activity-title">
          <h2 class="section-title" id="activity-title">${trE('panel.liveActivity')}</h2>
          <div class="timeline" id="timeline" aria-live="polite"></div>
        </section>

        <section class="section section--run" aria-labelledby="run-title">
          <div class="run-card" id="run-card" data-state="idle">
            <header class="run-card__head">
              <h2 class="run-card__title" id="run-title">${trE('panel.runSection')}</h2>
              <div class="run-card__chips" id="run-chips" aria-live="polite"></div>
            </header>
            <!-- Cost pill sits ABOVE the action button so the user sees the
                 estimated cost before deciding to press RUN. -->
            <button type="button" class="cost-pill" id="cost-pill" aria-haspopup="dialog" aria-label="${trE('cost.pillAria')}" hidden></button>
            <button class="btn btn--primary btn--lg run-card__btn" id="btn-start" type="button" aria-disabled="true" aria-label="${trE('panel.runSectionAria')}">
              <span aria-hidden="true" class="run-card__btn-icon">▶</span>
              <span class="run-card__btn-label">${trE('run.start')}</span>
            </button>
            <div class="run-card__msg" id="run-msg" role="status" aria-live="polite"></div>
            <!-- Log lives INSIDE the run card as a collapsed audit trail.
                 It's the lowest-attention surface in the panel (rarely opened,
                 high signal when it is), so embedding it here keeps it one
                 click away without consuming vertical space by default. -->
            <div class="run-card__log">
              <div class="log-header">
                <button type="button" class="log-toggle" id="btn-toggle-log" aria-expanded="false" aria-controls="log-pane" title="${trE('panel.logToggleHint')}">
                  <span class="log-toggle__chev" aria-hidden="true">▸</span>
                  <span class="log-toggle__label" id="log-title">${trE('panel.log')} <span class="log-count" id="log-count"></span></span>
                </button>
                <div class="log-header__actions" id="log-header-actions" hidden>
                  <button class="btn btn--ghost btn--xs" id="btn-copy-log" type="button" aria-label="${trE('panel.copyLogAria')}">${trE('panel.copy')}</button>
                  <button class="btn btn--ghost btn--xs" id="btn-clear-log" type="button" aria-label="${trE('panel.clearLogAria')}">${trE('panel.clear')}</button>
                </div>
              </div>
              <div class="log-pane" id="log-pane" hidden>
                <div class="live empty" id="live" role="log" aria-live="polite" aria-label="${trE('panel.reviewLog')}">${trE('panel.noActivity')}</div>
              </div>
            </div>
          </div>
        </section>

      </div>

    </aside>

    <div class="gutter" id="gutter" role="separator" aria-orientation="vertical" aria-label="${trE('panel.resize')}" tabindex="0" aria-valuemin="280" aria-valuemax="720" aria-valuenow="420"></div>

    <section class="right" aria-label="${trE('panel.reviewResults')}">
      <section id="summary" class="summary" hidden aria-labelledby="summary-title">
        <button type="button" class="summary__bar" id="summary-toggle" aria-expanded="true" aria-controls="summary-body">
          <span class="summary__chev" aria-hidden="true">▶</span>
          <span class="summary__verdict" id="summary-verdict-pill">
            <span class="summary__verdict-icon" aria-hidden="true"></span>
            <span class="summary__verdict-label" id="summary-verdict-label"></span>
          </span>
          <span class="summary__title" id="summary-title">${trE('panel.execSummary')}</span>
          <span class="summary__meta" id="summary-meta" aria-live="polite"></span>
          <span class="summary__sev-chips" id="summary-sev-chips" aria-label="${trE('panel.findingsBySeverity')}"></span>
        </button>
        <div class="summary__body" id="summary-body">
          <p class="summary__lead" id="exec-text"></p>
          <div class="summary__concerns" id="summary-concerns" hidden>
            <h3 class="summary__h3">${trE('panel.topConcerns')} <span class="summary__count" id="concerns-count"></span></h3>
            <ul id="concerns" class="summary__list summary__list--concerns"></ul>
          </div>
          <div class="summary__strengths" id="summary-strengths" hidden>
            <h3 class="summary__h3 summary__h3--muted">${trE('panel.strengths')} <span class="summary__count" id="strengths-count"></span></h3>
            <ul id="strengths" class="summary__list summary__list--strengths"></ul>
          </div>
        </div>
      </section>

      <div class="filters-wrap" id="filters-wrap">
        <div class="filters" role="group" aria-label="${trE('panel.filterBySeverity')}">
          <button class="filter" type="button" data-f="all" aria-pressed="true">${trE('panel.filterAll')} <span class="filter__count" data-count-for="all" hidden>0</span></button>
          <button class="filter filter--sev" type="button" data-f="critical" data-sev="critical" aria-pressed="false">${trE('panel.critical')} <span class="filter__count" data-count-for="critical" hidden>0</span></button>
          <button class="filter filter--sev" type="button" data-f="major" data-sev="major" aria-pressed="false">${trE('panel.major')} <span class="filter__count" data-count-for="major" hidden>0</span></button>
          <button class="filter filter--sev" type="button" data-f="minor" data-sev="minor" aria-pressed="false">${trE('panel.minor')} <span class="filter__count" data-count-for="minor" hidden>0</span></button>
          <button class="filter filter--sev" type="button" data-f="nit" data-sev="nit" aria-pressed="false">${trE('panel.nit')} <span class="filter__count" data-count-for="nit" hidden>0</span></button>
          <button class="filter filter--sev" type="button" data-f="praise" data-sev="praise" aria-pressed="false">${trE('panel.praise')} <span class="filter__count" data-count-for="praise" hidden>0</span></button>
          <button class="filter filter--silenced" type="button" data-f="silenced" aria-pressed="false" title="${trE('panel.silencedFilterTitle')}">${trE('panel.silenced')} <span class="filter__count" data-count-for="silenced" hidden>0</span></button>
          <button class="filter filter--revised" type="button" data-f="revised" aria-pressed="false" title="${trE('panel.revisedFilterTitle')}">${trE('panel.revised')} <span class="filter__count" id="filter-revised-count" data-count-for="revised" hidden>0</span></button>
        </div>
        <div class="filters-search">
          <label class="sr-only" for="search">${trE('panel.filterByText')}</label>
          <svg class="filters-search__icon" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M11.5 10.5h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 5L16.5 16l-5-5zm-6 0a5 5 0 1 1 5-5 5 5 0 0 1-5 5z"/></svg>
          <input class="search" id="search" type="search" placeholder="${trE('panel.findingsSearchPlaceholder')}" autocomplete="off" spellcheck="false" />
        </div>
        <div class="filters-cat" id="cat-filters" role="group" aria-label="${trE('panel.filterByCategory')}"></div>
      </div>

      <div id="changemap" class="changemap" hidden aria-label="${trE('changemap.title')}"></div>

      <div id="findings" class="findings" role="region" aria-label="${trE('panel.findingsRegion')}"></div>

      <!-- Right-pane state surface. Renderer fills it with one of:
             welcome panel (idle, no findings, no run)
             in-progress "discoveries" view (running, no findings yet)
             empty hint (filter mismatch / clean review)
           When findings exist, this element stays hidden and the cards own
           the surface. -->
      <div id="right-state" class="right-state" hidden></div>
    </section>
  </main>

</div>
`;
}
