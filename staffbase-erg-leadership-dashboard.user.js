// ==UserScript==
// @name         Staffbase Analytics — ERG Leadership (Cummins)
// @namespace    https://cumminsergdm.staffbase.rocks/
// @version      1.0.8
// @description  Adds an ERG Leadership Analytics tab to Staffbase Studio for Cummins Black Network leadership tracking
// @author       Faraz Hussein · Staffbase SE Solutions
// @match        https://cumminsergdm.staffbase.rocks/studio/analytics*
// @match        https://cumminsergdm.staffbase.rocks/studio/analytics/
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  /* ══════════════════════════════════════════════════
     DATA  (reference date: May 4, 2026)
  ══════════════════════════════════════════════════ */

  const TODAY = new Date('2026-05-04');

  function monthsAgo(dateStr) {
    const d = new Date(dateStr);
    return Math.round((TODAY - d) / (1000 * 60 * 60 * 24 * 30.44));
  }
  function daysAgo(dateStr) {
    return Math.round((TODAY - new Date(dateStr)) / (1000 * 60 * 60 * 24));
  }

  const LEADERS = [
    { id:'l1',  name:'Marcus Johnson',   role:'National Chair',       chapter:'Cummins Black Network',       startDate:'2024-05-01', active:true,  lastActivity:'2026-05-02' },
    { id:'l2',  name:'Alicia Thompson',  role:'Co-Chair',             chapter:'Cummins Black Network',       startDate:'2024-11-01', active:true,  lastActivity:'2026-05-01' },
    { id:'l3',  name:'Devon Williams',   role:'Chapter Lead',         chapter:'Indiana CBN ERG',             startDate:'2023-10-01', active:true,  lastActivity:'2026-04-30' },
    { id:'l4',  name:'Keisha Brown',     role:'Chapter Lead',         chapter:'Charleston CBN ERG',          startDate:'2025-05-01', active:true,  lastActivity:'2026-04-28' },
    { id:'l5',  name:'Robert Davis',     role:'Chapter Lead',         chapter:'Dallas CBN ERG',              startDate:'2025-09-01', active:true,  lastActivity:'2026-04-25' },
    { id:'l6',  name:'Tanya Moore',      role:'Communications Lead',  chapter:'Cummins Black Network',       startDate:'2025-03-01', active:true,  lastActivity:'2026-05-03' },
    { id:'l7',  name:'James Carter',     role:'Chapter Lead',         chapter:'Indiana - Indianapolis',      startDate:'2025-11-01', active:true,  lastActivity:'2026-04-29' },
    { id:'l8',  name:'Lauren Hill',      role:'Chapter Lead',         chapter:'Indiana - Columbus',          startDate:'2024-07-01', active:true,  lastActivity:'2026-04-22' },
    { id:'l9',  name:'Michael Torres',   role:'Chapter Lead',         chapter:'Indiana - Elkhart',           startDate:'2024-12-01', active:false, lastActivity:'2026-02-14' },
    { id:'l10', name:'Sandra Lewis',     role:'Chapter Lead',         chapter:'Indiana - Seymour',           startDate:'2025-02-01', active:true,  lastActivity:'2026-05-01' },
    { id:'l11', name:'David Park',       role:'Membership Lead',      chapter:'Cummins Black Network',       startDate:'2024-09-01', active:true,  lastActivity:'2026-04-27' },
    { id:'l12', name:'Jasmine White',    role:'Events Lead',          chapter:'Charleston CBN ERG',          startDate:'2025-01-01', active:true,  lastActivity:'2026-04-30' },
  ];

  const CHAPTERS = [
    { id:'cbn',        name:'Cummins Black Network',       rosterUpdated:'2026-04-20', hasLead:true,  hasCoLead:true  },
    { id:'indiana',    name:'Indiana CBN ERG',             rosterUpdated:'2026-04-05', hasLead:true,  hasCoLead:false },
    { id:'charleston', name:'Charleston CBN ERG',          rosterUpdated:'2026-04-14', hasLead:true,  hasCoLead:true  },
    { id:'dallas',     name:'Dallas CBN ERG',              rosterUpdated:'2025-12-01', hasLead:true,  hasCoLead:false },
    { id:'leaders',    name:'CBN Leaders Group',           rosterUpdated:'2025-11-15', hasLead:false, hasCoLead:false },
  ];

  // Leadership changes by month (May 2025 → May 2026)
  const TRANSITION_MONTHS = ['May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr'];
  const TRANSITION_DATA   = [1, 0, 2, 1, 1, 0, 2, 1, 0, 1, 0, 0];

  const RECENT_TRANSITIONS = [
    { date:'2026-02-10', chapter:'Indiana CBN ERG',      role:'Chapter Lead',  from:'Omar Reed',       to:'Devon Williams',  type:'Replacement' },
    { date:'2025-11-15', chapter:'Indiana - Indianapolis',role:'Chapter Lead', from:'Grace Kim',       to:'James Carter',    type:'Replacement' },
    { date:'2025-09-03', chapter:'Dallas CBN ERG',        role:'Chapter Lead', from:'Tyler Brooks',    to:'Robert Davis',    type:'New Assignment' },
    { date:'2025-08-20', chapter:'Indiana CBN ERG',       role:'Chapter Lead', from:'Devon Williams',  to:'Omar Reed',       type:'Temporary' },
    { date:'2025-07-11', chapter:'Indiana - Columbus',    role:'Chapter Lead', from:'Patricia Lane',   to:'Lauren Hill',     type:'Rotation' },
    { date:'2025-07-02', chapter:'Cummins Black Network', role:'Co-Chair',     from:'Wesley Grant',    to:'Alicia Thompson', type:'Election' },
  ];

  const ROLES = ['All Roles', 'National Chair', 'Co-Chair', 'Chapter Lead', 'Communications Lead', 'Membership Lead', 'Events Lead'];

  /* ══════════════════════════════════════════════════
     STATE
  ══════════════════════════════════════════════════ */

  const state = {
    activeView:       'overview',
    selectedChapter:  'all',
    selectedRole:     'all',
    dateRange:        { label: '365 days', start: '05/04/2025', end: '05/04/2026' },
    charts:           {},
    sortCol:          'tenure',
    sortAsc:          false,
  };

  /* ══════════════════════════════════════════════════
     CSS  (prefix: slr-)
  ══════════════════════════════════════════════════ */

  const CSS = `
    #sb-erg-nav {
      cursor: pointer; padding: 8px 16px; font-size: 14px; color: #374151;
      display: block; border-radius: 6px; transition: background 0.15s;
      text-decoration: none; margin: 2px 0;
    }
    #sb-erg-nav:hover { background: #f3f4f6; }
    #sb-erg-nav.active { background: #e8f4fd; color: #00598a; font-weight: 600; }

    #sb-erg-dash {
      min-width: 0;
      padding: 20px 24px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #111827; box-sizing: border-box;
    }
    #sb-erg-dash *, #sb-erg-dash *::before, #sb-erg-dash *::after { box-sizing: border-box; }
    #sb-erg-dash canvas { display: block; max-width: 100%; }

    .slr-title { font-size: 22px; font-weight: 700; margin: 0 0 3px; }
    .slr-subtitle { font-size: 12px; color: #6b7280; margin: 0 0 16px; }

    /* Filter bar */
    .slr-fbar { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
    .slr-fbtn {
      display: flex; align-items: center; gap: 6px; padding: 7px 13px;
      border: 1px solid #d1d5db; border-radius: 8px; background: #fff;
      font-size: 13px; font-weight: 500; cursor: pointer; color: #374151;
      transition: border-color 0.15s; white-space: nowrap; position: relative;
    }
    .slr-fbtn:hover { border-color: #9ca3af; }
    .slr-fbtn.active { border-color: #008dd9; background: #e8f4fd; color: #00598a; }
    .slr-export { margin-left:auto; display:flex; align-items:center; gap:6px; color:#2563eb; font-size:13px; font-weight:500; cursor:pointer; background:none; border:none; }
    .slr-export:hover { text-decoration: underline; }

    /* KPI cards */
    .slr-kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(155px, 1fr)); gap: 12px; margin-bottom: 18px; }
    .slr-kpi { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:16px 18px; }
    .slr-kpi label { font-size:12px; color:#6b7280; font-weight:500; display:block; margin-bottom:7px; }
    .slr-kpi-val { font-size:24px; font-weight:700; color:#111827; }
    .slr-kpi-sub { font-size:12px; color:#6b7280; margin-top:4px; }
    .slr-pill {
      display:inline-flex; align-items:center; gap:3px; font-size:11px; font-weight:600;
      padding:2px 7px; border-radius:999px; margin-left:7px; vertical-align:middle;
    }
    .slr-up   { background:#dcfce7; color:#166534; }
    .slr-down { background:#fef3c7; color:#92400e; }
    .slr-warn { background:#fee2e2; color:#991b1b; }

    /* Layout rows */
    .slr-row   { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:14px; align-items:start; }
    .slr-row-2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:14px; align-items:start; }
    @media(max-width:900px){ .slr-row, .slr-row-2 { grid-template-columns:1fr; } }

    /* Card */
    .slr-card { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:16px 18px; min-width:0; overflow:hidden; }
    .slr-card-title { font-size:14px; font-weight:600; margin:0 0 14px; color:#111827; }
    .slr-card-sub { font-size:12px; color:#6b7280; font-weight:400; margin-left:6px; }

    /* Freshness scorecard */
    .slr-fresh-grid { display:flex; flex-direction:column; gap:8px; }
    .slr-fresh-row {
      display:flex; align-items:center; justify-content:space-between; gap:8px;
      padding:9px 11px; border-radius:10px; border:1px solid #e5e7eb;
    }
    .slr-fresh-row > div { min-width:0; flex:1; }
    .slr-fresh-name { font-size:13px; font-weight:500; color:#111827; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .slr-fresh-date { font-size:11px; color:#9ca3af; margin-top:2px; }
    .slr-fresh-status {
      font-size:11px; font-weight:700; padding:3px 10px;
      border-radius:999px; white-space:nowrap;
    }
    .slr-status-current { background:#dcfce7; color:#166534; }
    .slr-status-stale   { background:#fef3c7; color:#92400e; }
    .slr-status-missing { background:#fee2e2; color:#991b1b; }

    /* Transition table */
    .slr-tbl-wrap { overflow-x:auto; margin-top:4px; }
    .slr-tbl { width:100%; border-collapse:collapse; font-size:13px; }
    .slr-tbl th {
      text-align:left; padding:9px 11px; font-size:11px; font-weight:600;
      color:#6b7280; border-bottom:1px solid #e5e7eb; white-space:nowrap;
      cursor:pointer; user-select:none;
    }
    .slr-tbl th:hover { color:#374151; }
    .slr-tbl th.sort-asc::after  { content:' ↑'; }
    .slr-tbl th.sort-desc::after { content:' ↓'; }
    .slr-tbl td { padding:11px; border-bottom:1px solid #f3f4f6; color:#374151; }
    .slr-tbl tr:last-child td { border-bottom:none; }
    .slr-tbl tr:hover td { background:#f9fafb; }
    .slr-leader-name { font-weight:500; color:#111827; }
    .slr-chapter     { font-size:12px; color:#6b7280; }

    /* Active/inactive pill */
    .slr-active-pill   { display:inline-block; width:8px; height:8px; border-radius:50%; background:#22c55e; margin-right:5px; }
    .slr-inactive-pill { display:inline-block; width:8px; height:8px; border-radius:50%; background:#d1d5db; margin-right:5px; }

    /* Transition arrow */
    .slr-arrow { color:#9ca3af; font-size:13px; padding:0 4px; }
    .slr-trans-new  { color:#166534; font-weight:600; }
    .slr-trans-type { font-size:11px; padding:2px 7px; border-radius:4px; font-weight:600; }
    .slr-type-replace { background:#eff6ff; color:#1d4ed8; }
    .slr-type-new     { background:#f0fdf4; color:#166534; }
    .slr-type-temp    { background:#fef3c7; color:#92400e; }
    .slr-type-rot     { background:#f5f3ff; color:#7c3aed; }
    .slr-type-elec    { background:#fdf4ff; color:#9333ea; }

    /* Legend */
    .slr-legend { display:flex; gap:14px; margin-top:10px; flex-wrap:wrap; }
    .slr-leg-item { display:flex; align-items:center; gap:5px; font-size:12px; color:#6b7280; }

    /* Section separator */
    .slr-section-label {
      font-size:11px; font-weight:700; letter-spacing:0.07em; text-transform:uppercase;
      color:#9ca3af; margin: 4px 0 12px; padding-top:4px;
      border-top:1px solid #f3f4f6;
    }

    /* Search */
    .slr-search { padding:6px 11px; border:1px solid #e5e7eb; border-radius:8px; font-size:13px; outline:none; }
    .slr-search:focus { border-color:#008dd9; }

    /* Dropdown */
    .slr-drop {
      position:absolute; top:calc(100% + 6px); left:0; z-index:9998;
      background:#fff; border:1px solid #d1d5db; border-radius:10px;
      box-shadow:0 8px 24px rgba(0,0,0,0.10); min-width:220px; padding:7px;
    }
    .slr-drop-item { display:flex; align-items:center; gap:9px; padding:8px 10px; font-size:13px; color:#374151; cursor:pointer; border-radius:6px; }
    .slr-drop-item:hover { background:#f3f4f6; }
    .slr-drop-item.sel { color:#00598a; font-weight:600; background:#e8f4fd; }

    /* Tenure bar */
    .slr-bars { display:flex; flex-direction:column; gap:9px; }
    .slr-bar-row { display:flex; align-items:center; gap:10px; }
    .slr-bar-name { font-size:12px; color:#374151; min-width:130px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .slr-bar-track { flex:1; height:10px; border-radius:999px; background:#eaf0f6; overflow:hidden; }
    .slr-bar-fill { height:100%; border-radius:999px; transition:width 0.35s ease; }
    .slr-bar-val { font-size:12px; color:#6b7280; width:40px; text-align:right; white-space:nowrap; }
  `;

  /* ══════════════════════════════════════════════════
     BOOTSTRAP
  ══════════════════════════════════════════════════ */

  function injectStyles() {
    if (document.getElementById('slr-styles')) return;
    const s = document.createElement('style');
    s.id = 'slr-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function loadChartJS(cb) {
    if (window.Chart) { cb(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    s.onload = cb;
    document.head.appendChild(s);
  }

  function suppressNativeHighlight() {
    document.getElementById('sb-anl-nav-suppress')?.remove();
    const path = window.location.pathname;
    const s = document.createElement('style');
    s.id = 'sb-anl-nav-suppress';
    s.textContent = `
      a[aria-current="page"]:not(#sb-comm-nav):not(#sb-erg-nav),
      a[href="${path}"]:not(#sb-comm-nav):not(#sb-erg-nav) {
        background: transparent !important;
        color: #374151 !important;
      }`;
    document.head.appendChild(s);
  }

  function restoreNativeHighlight() {
    document.getElementById('sb-anl-nav-suppress')?.remove();
  }

  /* ══════════════════════════════════════════════════
     NAV INJECTION — href-based; works regardless of page state
     Prefer Communities tab (other script) as insertion anchor
  ══════════════════════════════════════════════════ */

  const ANALYTICS_HREFS = [
    '/studio/analytics/custom',
    '/studio/analytics/search',
    '/studio/analytics/campaigns',
    '/studio/analytics/hashtags',
    '/studio/analytics/users',
    '/studio/analytics/email',
    '/studio/analytics/content',
    '/studio/analytics/pages',
    '/studio/analytics/news',
  ];

  function findLastAnalyticsLink() {
    const comm = document.getElementById('sb-comm-nav');
    if (comm) return comm;
    for (const href of ANALYTICS_HREFS) {
      const el = document.querySelector(`a[href="${href}"], a[href*="${href}"]`);
      if (el) return el;
    }
    return null;
  }

  function injectNav() {
    if (document.getElementById('sb-erg-nav')) return true;
    const ref = findLastAnalyticsLink();
    if (!ref) return false;

    const nav = document.createElement('a');
    nav.id   = 'sb-erg-nav';
    nav.href = '#';
    nav.textContent = 'ERG Leadership';
    nav.addEventListener('click', e => { e.preventDefault(); mountDashboard(); });

    const cs = window.getComputedStyle(ref);
    ['display','padding','margin','fontSize','fontFamily','lineHeight',
     'borderRadius','fontWeight','letterSpacing'].forEach(p => { nav.style[p] = cs[p]; });
    nav.style.color          = '#374151';
    nav.style.textDecoration = 'none';
    nav.style.cursor         = 'pointer';

    const insertAfter = ref.closest('li') || ref;
    insertAfter.parentNode.insertBefore(nav, insertAfter.nextSibling || null);
    return true;
  }

  /* ══════════════════════════════════════════════════
     MOUNT / UNMOUNT — fixed overlay; never touches Staffbase's DOM
  ══════════════════════════════════════════════════ */

  function measureStaffbaseLayout() {
    let topH = 60, leftW = 220;
    const topSels  = ['header','[class*="TopBar"]','[class*="topbar"]','[class*="AppBar"]','[class*="Navbar"]'];
    const sideSels = ['nav','aside','[class*="Sidebar"]','[class*="sidebar"]','[class*="Navigation"]'];
    for (const s of topSels)  { const el = document.querySelector(s); if (el) { const r = el.getBoundingClientRect(); if (r.height > 20 && r.height < 120) { topH = Math.round(r.bottom); break; } } }
    for (const s of sideSels) { const el = document.querySelector(s); if (el) { const r = el.getBoundingClientRect(); if (r.width  > 80 && r.width  < 400) { leftW = Math.round(r.right);  break; } } }
    return { topH, leftW };
  }

  function mountDashboard() {
    document.getElementById('sb-erg-nav')?.classList.add('active');
    document.getElementById('sb-comm-nav')?.classList.remove('active');
    suppressNativeHighlight();
    const commDash = document.getElementById('sb-comm-dash');
    if (commDash) commDash.style.display = 'none';

    const existing = document.getElementById('sb-erg-dash');
    if (existing) { existing.style.display = 'block'; loadChartJS(() => renderOverview(existing)); return; }

    const { topH, leftW } = measureStaffbaseLayout();
    const overlay = document.createElement('div');
    overlay.id = 'sb-erg-dash';
    overlay.style.cssText = `
      position:fixed!important; top:${topH}px!important; left:${leftW}px!important;
      right:0!important; bottom:0!important; z-index:500!important;
      background:#f0f4f8!important; overflow-y:auto!important; overflow-x:hidden!important;
    `;
    document.body.appendChild(overlay);
    loadChartJS(() => renderOverview(overlay));
  }

  function unmountDashboard() {
    document.getElementById('sb-erg-nav')?.classList.remove('active');
    restoreNativeHighlight();
    const overlay = document.getElementById('sb-erg-dash');
    if (overlay) overlay.style.display = 'none';
    Object.values(state.charts).forEach(c => { try { c.destroy(); } catch(e){} });
    state.charts = {};
  }

  /* ══════════════════════════════════════════════════
     COMPUTED HELPERS
  ══════════════════════════════════════════════════ */

  function filteredLeaders() {
    return LEADERS.filter(l => {
      if (state.selectedChapter !== 'all' && l.chapter !== state.selectedChapter) return false;
      if (state.selectedRole    !== 'all' && l.role    !== state.selectedRole)    return false;
      return true;
    });
  }

  function avgTenure(leaders) {
    if (!leaders.length) return 0;
    return (leaders.reduce((s, l) => s + monthsAgo(l.startDate), 0) / leaders.length).toFixed(1);
  }

  function transitionsIn90d() {
    const cutoff = new Date(TODAY); cutoff.setDate(cutoff.getDate() - 90);
    return RECENT_TRANSITIONS.filter(t => new Date(t.date) >= cutoff).length;
  }

  function staleChapters() {
    return CHAPTERS.filter(c => {
      const days = daysAgo(c.rosterUpdated);
      return days > 90 || !c.hasLead;
    }).length;
  }

  function rosterStatus(chapter) {
    const days = daysAgo(chapter.rosterUpdated);
    if (!chapter.hasLead) return { label:'Missing Lead', cls:'slr-status-missing' };
    if (days > 90)        return { label:`Stale · ${days}d`,  cls:'slr-status-stale'   };
    return                       { label:`Current · ${days}d`, cls:'slr-status-current' };
  }

  function transTypeCls(type) {
    return { 'Replacement':'slr-type-replace','New Assignment':'slr-type-new','Temporary':'slr-type-temp','Rotation':'slr-type-rot','Election':'slr-type-elec' }[type] || '';
  }

  /* ══════════════════════════════════════════════════
     RENDER — OVERVIEW
  ══════════════════════════════════════════════════ */

  function renderOverview(container) {
    const leaders = filteredLeaders();
    const active  = leaders.filter(l => l.active).length;
    const avg     = avgTenure(leaders);
    const trans90 = transitionsIn90d();
    const stale   = staleChapters();

    container.innerHTML = `
      <h1 class="slr-title">ERG Leadership Analytics</h1>
      <p class="slr-subtitle">Cummins Black Network · Tenure tracking, roster freshness, and leadership transitions</p>

      ${filterBar()}

      <div class="slr-kpis">
        ${kpi('Active Leaders',      `${active}/${leaders.length}`, `${Math.round(active/leaders.length*100)}% active`,                    active < leaders.length ? 'warn' : 'up')}
        ${kpi('Avg. Tenure',         `${avg} mo`,                   'across all roles',                                                     'up')}
        ${kpi('Role Changes (90d)',  trans90,                       'leadership transitions',                                               trans90 > 3 ? 'warn' : 'up')}
        ${kpi('Stale Rosters',       stale,                         `${stale} chapter${stale!==1?'s':''} need attention`,                   stale > 0 ? 'warn' : 'up')}
      </div>

      <p class="slr-section-label">Leader Tenure &amp; Roster Health</p>

      <div class="slr-row">
        <div class="slr-card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
            <h3 class="slr-card-title" style="margin:0;">Tenure by Leader <span class="slr-card-sub">months in current role</span></h3>
          </div>
          <div style="position:relative;width:100%;height:300px;">
            <canvas id="slr-tenure-chart"></canvas>
          </div>
        </div>
        <div class="slr-card">
          <h3 class="slr-card-title">Roster Freshness <span class="slr-card-sub">by chapter</span></h3>
          <div class="slr-fresh-grid">
            ${CHAPTERS.map(c => {
              const st = rosterStatus(c);
              return `<div class="slr-fresh-row">
                <div>
                  <div class="slr-fresh-name">${c.name}</div>
                  <div class="slr-fresh-date">Updated ${new Date(c.rosterUpdated).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</div>
                </div>
                <span class="slr-fresh-status ${st.cls}">${st.label}</span>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>

      <p class="slr-section-label">Transitions &amp; Activity</p>

      <div class="slr-row">
        <div class="slr-card">
          <h3 class="slr-card-title">Leadership Transitions Over Time <span class="slr-card-sub">last 12 months</span></h3>
          <div style="position:relative;width:100%;height:200px;">
            <canvas id="slr-trans-chart"></canvas>
          </div>
          <div class="slr-legend" style="margin-top:10px;">
            <div class="slr-leg-item"><span style="display:inline-block;width:12px;height:3px;background:#008dd9;border-radius:2px;"></span>Role Changes</div>
          </div>
        </div>
        <div class="slr-card">
          <h3 class="slr-card-title">Leader Activity by Chapter <span class="slr-card-sub">active in last 30d</span></h3>
          <div style="position:relative;width:100%;height:200px;">
            <canvas id="slr-activity-chart"></canvas>
          </div>
        </div>
      </div>

      <p class="slr-section-label">Recent Leadership Transitions</p>

      <div class="slr-card" style="margin-bottom:14px;">
        <h3 class="slr-card-title">Transition Log</h3>
        <div class="slr-tbl-wrap">
          <table class="slr-tbl">
            <thead><tr>
              <th>Date</th><th>Chapter</th><th>Role</th>
              <th>Outgoing</th><th></th><th>Incoming</th><th>Type</th>
            </tr></thead>
            <tbody>
              ${RECENT_TRANSITIONS.map(t => `<tr>
                <td>${new Date(t.date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</td>
                <td class="slr-chapter">${t.chapter}</td>
                <td>${t.role}</td>
                <td style="color:#6b7280;">${t.from}</td>
                <td class="slr-arrow">→</td>
                <td class="slr-trans-new">${t.to}</td>
                <td><span class="slr-trans-type ${transTypeCls(t.type)}">${t.type}</span></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <p class="slr-section-label">Full Leadership Roster</p>

      <div class="slr-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <h3 class="slr-card-title" style="margin:0;">All Leaders</h3>
          <input class="slr-search" id="slr-roster-search" placeholder="🔍 Search..." style="width:200px;" />
        </div>
        <div class="slr-tbl-wrap">
          <table class="slr-tbl" id="slr-roster-tbl">
            <thead><tr>
              <th data-sort="name">Leader</th>
              <th data-sort="chapter">Chapter</th>
              <th data-sort="role">Role</th>
              <th data-sort="startDate">Start Date</th>
              <th data-sort="tenure" class="sort-desc">Tenure</th>
              <th data-sort="active">Status</th>
              <th data-sort="lastActivity">Last Active</th>
            </tr></thead>
            <tbody id="slr-roster-body">
              ${rosterRows(leaders)}
            </tbody>
          </table>
        </div>
      </div>
    `;

    bindEvents(container);
    loadChartJS(() => requestAnimationFrame(() => {
      drawTenureChart(container, leaders);
      drawTransChart(container);
      drawActivityChart(container);
    }));
  }

  /* ══════════════════════════════════════════════════
     HTML HELPERS
  ══════════════════════════════════════════════════ */

  function kpi(label, value, sub, dir) {
    const cls = dir === 'warn' ? 'slr-warn' : dir === 'up' ? 'slr-up' : 'slr-down';
    const icon = dir === 'warn' ? '⚠' : dir === 'up' ? '↑' : '↘';
    return `<div class="slr-kpi">
      <label>${label}</label>
      <div class="slr-kpi-val">${value} <span class="slr-pill ${cls}">${icon}</span></div>
      <div class="slr-kpi-sub">${sub}</div>
    </div>`;
  }

  function filterBar() {
    const chLabel   = state.selectedChapter === 'all' ? 'Chapter' : state.selectedChapter.split(' CBN')[0].split(' - ')[0];
    const roleLabel = state.selectedRole    === 'all' ? 'Role'    : state.selectedRole;
    return `<div class="slr-fbar">
      <button class="slr-fbtn" id="slr-date-btn">📅 ${state.dateRange.label}: ${state.dateRange.start} – ${state.dateRange.end} ∨</button>
      <div style="position:relative;">
        <button class="slr-fbtn${state.selectedChapter!=='all'?' active':''}" id="slr-chapter-btn">${chLabel} ∨</button>
      </div>
      <div style="position:relative;">
        <button class="slr-fbtn${state.selectedRole!=='all'?' active':''}" id="slr-role-btn">${roleLabel} ∨</button>
      </div>
      <button class="slr-export">↓ Export CSV</button>
    </div>`;
  }

  function rosterRows(leaders) {
    return [...leaders]
      .sort((a, b) => {
        const aVal = state.sortCol === 'tenure'  ? monthsAgo(a.startDate)
                   : state.sortCol === 'active'  ? (a.active ? 1 : 0)
                   : state.sortCol === 'lastActivity' ? daysAgo(a.lastActivity)
                   : (a[state.sortCol] || '');
        const bVal = state.sortCol === 'tenure'  ? monthsAgo(b.startDate)
                   : state.sortCol === 'active'  ? (b.active ? 1 : 0)
                   : state.sortCol === 'lastActivity' ? daysAgo(b.lastActivity)
                   : (b[state.sortCol] || '');
        return state.sortAsc ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
      })
      .map(l => {
        const ten   = monthsAgo(l.startDate);
        const tenLabel = ten >= 12 ? `${(ten/12).toFixed(1)} yr` : `${ten} mo`;
        const tenColor = ten >= 24 ? '#002235' : ten >= 12 ? '#00598a' : '#9ca3af';
        const lastAct  = daysAgo(l.lastActivity);
        const lastLabel = lastAct === 0 ? 'Today' : lastAct === 1 ? 'Yesterday' : `${lastAct}d ago`;
        return `<tr data-leader="${l.name.toLowerCase()} ${l.chapter.toLowerCase()} ${l.role.toLowerCase()}">
          <td><div class="slr-leader-name">${l.name}</div></td>
          <td class="slr-chapter">${l.chapter}</td>
          <td>${l.role}</td>
          <td>${new Date(l.startDate).toLocaleDateString('en-US',{month:'short',year:'numeric'})}</td>
          <td style="font-weight:600;color:${tenColor};">${tenLabel}</td>
          <td>
            <span class="${l.active ? 'slr-active-pill' : 'slr-inactive-pill'}"></span>
            ${l.active ? 'Active' : '<span style="color:#9ca3af;">Inactive</span>'}
          </td>
          <td style="color:${lastAct > 30 ? '#dc2626' : '#374151'};">${lastLabel}</td>
        </tr>`;
      }).join('');
  }

  /* ══════════════════════════════════════════════════
     CHARTS
  ══════════════════════════════════════════════════ */

  function drawTenureChart(container, leaders) {
    const canvas = container.querySelector('#slr-tenure-chart');
    if (!canvas || !window.Chart) return;
    if (state.charts.tenure) state.charts.tenure.destroy();

    const sorted = [...leaders].sort((a,b) => monthsAgo(b.startDate) - monthsAgo(a.startDate));
    const labels = sorted.map(l => l.name.split(' ')[0] + ' ' + l.name.split(' ')[1]?.[0] + '.');
    const data   = sorted.map(l => monthsAgo(l.startDate));
    const colors = data.map(v => v >= 24 ? '#002235' : v >= 12 ? '#00598a' : '#008dd9');

    state.charts.tenure = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{ data, backgroundColor: colors, borderRadius: 6, borderSkipped: false }]
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1,
            titleColor: '#111827', bodyColor: '#374151', padding: 10,
            callbacks: {
              label: item => ` ${item.raw} months in role`,
              afterLabel: item => {
                const l = sorted[item.dataIndex];
                return ` ${l.role} · ${l.chapter}`;
              }
            }
          }
        },
        scales: {
          x: { grid: { color: '#eaf0f6' }, ticks: { font:{size:11}, color:'#6b7280' }, title:{ display:true, text:'Months in current role', font:{size:11}, color:'#6b7280' } },
          y: { grid: { display: false }, ticks: { font:{size:11}, color:'#374151' } }
        }
      }
    });
  }

  function drawTransChart(container) {
    const canvas = container.querySelector('#slr-trans-chart');
    if (!canvas || !window.Chart) return;
    if (state.charts.trans) state.charts.trans.destroy();

    state.charts.trans = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: TRANSITION_MONTHS,
        datasets: [{
          data: TRANSITION_DATA,
          backgroundColor: TRANSITION_DATA.map(v => v > 1 ? '#00598a' : '#008dd9'),
          borderRadius: 5, borderSkipped: false
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1,
            titleColor: '#111827', bodyColor: '#374151', padding: 10,
            callbacks: { label: item => ` ${item.raw} leadership change${item.raw!==1?'s':''}` }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font:{size:11}, color:'#6b7280' } },
          y: { grid: { color: '#eaf0f6' }, ticks: { font:{size:11}, color:'#6b7280', stepSize:1 }, beginAtZero: true }
        }
      }
    });
  }

  function drawActivityChart(container) {
    const canvas = container.querySelector('#slr-activity-chart');
    if (!canvas || !window.Chart) return;
    if (state.charts.activity) state.charts.activity.destroy();

    const chapterNames = [...new Set(LEADERS.map(l => l.chapter))].slice(0, 6);
    const activeRate   = chapterNames.map(ch => {
      const ch_leaders = LEADERS.filter(l => l.chapter === ch);
      const active_cnt = ch_leaders.filter(l => l.active).length;
      return ch_leaders.length ? Math.round(active_cnt / ch_leaders.length * 100) : 0;
    });
    const shortNames = chapterNames.map(n => n.replace('Cummins Black Network','CBN').replace(' CBN ERG','').replace('Indiana - ',''));

    state.charts.activity = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: shortNames,
        datasets: [{
          data: activeRate,
          backgroundColor: activeRate.map(v => v === 100 ? '#008dd9' : v >= 75 ? '#00a4fd' : '#00598a'),
          borderRadius: 6, borderSkipped: false
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1,
            titleColor: '#111827', bodyColor: '#374151', padding: 10,
            callbacks: { label: item => ` ${item.raw}% of leaders active (last 30d)` }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font:{size:10}, color:'#6b7280' } },
          y: { grid: { color: '#eaf0f6' }, ticks: { font:{size:11}, color:'#6b7280', callback: v => v+'%' }, max: 100, beginAtZero: true }
        }
      }
    });
  }

  /* ══════════════════════════════════════════════════
     EVENT BINDING
  ══════════════════════════════════════════════════ */

  function bindEvents(container) {
    // Date btn (decorative for now)
    container.querySelector('#slr-date-btn')?.addEventListener('click', e => e.stopPropagation());

    // Chapter filter
    container.querySelector('#slr-chapter-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      toggleDrop('slr-chapter-drop', e.currentTarget, [
        { label:'All Chapters', val:'all' },
        ...CHAPTERS.map(c => ({ label:c.name, val:c.name }))
      ], val => {
        state.selectedChapter = val;
        renderOverview(container);
      });
    });

    // Role filter
    container.querySelector('#slr-role-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      toggleDrop('slr-role-drop', e.currentTarget, ROLES.map((r,i) => ({ label:r, val:i===0?'all':r })), val => {
        state.selectedRole = val;
        renderOverview(container);
      });
    });

    // Roster sort
    container.querySelectorAll('#slr-roster-tbl th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        if (state.sortCol === th.dataset.sort) state.sortAsc = !state.sortAsc;
        else { state.sortCol = th.dataset.sort; state.sortAsc = false; }
        container.querySelectorAll('#slr-roster-tbl th').forEach(t => t.classList.remove('sort-asc','sort-desc'));
        th.classList.add(state.sortAsc ? 'sort-asc' : 'sort-desc');
        container.querySelector('#slr-roster-body').innerHTML = rosterRows(filteredLeaders());
      });
    });

    // Roster search
    container.querySelector('#slr-roster-search')?.addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      container.querySelectorAll('#slr-roster-body tr').forEach(row => {
        row.style.display = (row.dataset.leader || '').includes(q) ? '' : 'none';
      });
    });

    document.addEventListener('click', closeAllDrops);
  }

  /* ══════════════════════════════════════════════════
     DROPDOWN HELPER
  ══════════════════════════════════════════════════ */

  function toggleDrop(id, anchor, items, onSelect) {
    closeAllDrops();
    if (document.getElementById(id)) { document.getElementById(id).remove(); return; }

    const drop = document.createElement('div');
    drop.id = id;
    drop.className = 'slr-drop';
    drop.innerHTML = items.map(item => `
      <div class="slr-drop-item${item.val === (id.includes('chapter') ? state.selectedChapter : state.selectedRole) ? ' sel' : ''}" data-val="${item.val}">
        ${item.label}
      </div>`).join('');

    anchor.parentElement.appendChild(drop);
    drop.querySelectorAll('.slr-drop-item').forEach(el => {
      el.addEventListener('click', e => { drop.remove(); onSelect(el.dataset.val); e.stopPropagation(); });
    });
    drop.addEventListener('click', e => e.stopPropagation());
  }

  function closeAllDrops() {
    ['slr-chapter-drop','slr-role-drop'].forEach(id => document.getElementById(id)?.remove());
  }

  /* ══════════════════════════════════════════════════
     INIT + SPA WATCHER
  ══════════════════════════════════════════════════ */

  function init() {
    injectStyles();

    if (injectNav()) return;

    const observer = new MutationObserver(() => {
      if (injectNav()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    let tries = 0;
    const poll = setInterval(() => {
      if (injectNav() || ++tries > 50) { clearInterval(poll); observer.disconnect(); }
    }, 400);
  }

  const _push = history.pushState.bind(history);
  history.pushState = function (...args) {
    document.getElementById('sb-erg-nav')?.remove();
    restoreNativeHighlight();
    if (document.getElementById('sb-erg-dash')) unmountDashboard();
    _push(...args);
    setTimeout(init, 700);
  };
  window.addEventListener('popstate', () => {
    document.getElementById('sb-erg-nav')?.remove();
    restoreNativeHighlight();
    if (document.getElementById('sb-erg-dash')) unmountDashboard();
    setTimeout(init, 700);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
