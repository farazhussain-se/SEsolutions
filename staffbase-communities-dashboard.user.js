// ==UserScript==
// @name         Staffbase Analytics — Communities (Cummins ERG)
// @namespace    https://cumminsergdm.staffbase.rocks/
// @version      1.0.7
// @description  Adds a fully interactive Communities analytics tab to Staffbase Studio for Cummins Employee Resource Groups
// @author       Faraz Hussein · Staffbase SE Solutions
// @match        https://cumminsergdm.staffbase.rocks/studio/analytics*
// @match        https://cumminsergdm.staffbase.rocks/studio/analytics/
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  /* ══════════════════════════════════════════════════
     DATA
  ══════════════════════════════════════════════════ */

  const COMMUNITIES = [
    { id: 'cbn',        name: 'Cummins Black Network',                 type: 'Open',        members: 6, space: 'Employee Resources' },
    { id: 'charleston', name: 'Charleston Cummins Black Network ERG',  type: 'Conditional', members: 4, space: 'Employee Resources' },
    { id: 'leaders',    name: 'Cummins Black Network Leaders',         type: 'Manual',      members: 3, space: 'Employee Resources' },
    { id: 'dallas',     name: 'Dallas Cummins Black Network ERG',      type: 'Conditional', members: 5, space: 'Employee Resources' },
    { id: 'indiana',    name: 'Indiana Cummins Black Network ERG',     type: 'Conditional', members: 7, space: 'Employee Resources' },
  ];

  const USER_GROUPS = ['All Employees', 'Indiana', 'Texas', 'South Carolina', 'Engineering Team', 'Leadership'];

  const DATE_LABELS = ['Apr 28', 'Apr 29', 'Apr 30', 'May 1', 'May 2', 'May 3', 'May 4'];

  const ACTIVITY_DATA = {
    posts:     [120, 145, 189, 210, 178, 156, 143],
    views:     [480, 520, 680, 750, 620, 590, 540],
    reactions: [89,  102, 156, 180, 134, 122, 115],
    comments:  [45,   67,  89,  95,  78,  72,  69],
  };

  const COMMUNITY_STATS = {
    cbn:        { views: 780, posts: 320, reactions: 245, comments: 189, members: 6, activeMembers: 5 },
    charleston: { views: 450, posts: 210, reactions: 178, comments: 134, members: 4, activeMembers: 3 },
    leaders:    { views: 234, posts: 189, reactions: 145, comments:  89, members: 3, activeMembers: 3 },
    dallas:     { views: 123, posts:  89, reactions:  67, comments:  56, members: 5, activeMembers: 2 },
    indiana:    { views:  70, posts:  65, reactions:  45, comments:  34, members: 7, activeMembers: 4 },
  };

  const SAMPLE_POSTS = [
    { title: 'Celebrating Black History Month — Leadership Spotlight',  views: 312, likes: 89, comments: 34 },
    { title: 'Mentorship Program Sign-Ups Now Open',                    views: 278, likes: 67, comments: 28 },
    { title: 'CBN Chapter Meet & Greet Recap — Charleston',             views: 234, likes: 56, comments: 19 },
    { title: 'Allyship Workshop: Key Takeaways and Next Steps',         views: 198, likes: 45, comments: 15 },
    { title: 'Indiana Chapter Community Garden Initiative Spotlight',   views: 167, likes: 38, comments: 12 },
  ];

  const BAR_COLORS = { posts: '#3b82f6', views: '#06b6d4', reactions: '#a855f7', comments: '#22c55e' };

  /* ══════════════════════════════════════════════════
     STATE
  ══════════════════════════════════════════════════ */

  const state = {
    activeCommunity:    null,
    selectedCommunities:[],
    selectedUserGroup:  'all',
    dateRange:          { label: '30 days', start: '04/04/2026', end: '05/04/2026' },
    chartInstances:     {},
  };

  /* ══════════════════════════════════════════════════
     CSS
  ══════════════════════════════════════════════════ */

  const CSS = `
    #sb-comm-nav {
      cursor: pointer; padding: 8px 16px; font-size: 14px;
      color: #374151; display: block; border-radius: 6px;
      transition: background 0.15s; text-decoration: none;
      margin: 2px 0;
    }
    #sb-comm-nav:hover { background: #f3f4f6; }
    #sb-comm-nav.active { background: #e8f0fe; color: #1a56db; font-weight: 600; }

    #sb-comm-dash {
      min-width: 0;
      padding: 24px 32px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #111827; box-sizing: border-box;
    }
    #sb-comm-dash *, #sb-comm-dash *::before, #sb-comm-dash *::after { box-sizing: border-box; }

    .sbc-title { font-size: 26px; font-weight: 700; margin: 0 0 20px; }

    /* Filter bar */
    .sbc-fbar { display: flex; align-items: center; gap: 10px; margin-bottom: 22px; flex-wrap: wrap; }
    .sbc-fbtn {
      display: flex; align-items: center; gap: 6px; padding: 7px 13px;
      border: 1px solid #d1d5db; border-radius: 8px; background: #fff;
      font-size: 13px; font-weight: 500; cursor: pointer; color: #374151;
      transition: border-color 0.15s; white-space: nowrap; position: relative;
    }
    .sbc-fbtn:hover { border-color: #9ca3af; }
    .sbc-fbtn.active { border-color: #2563eb; background: #eff6ff; color: #1d4ed8; }
    .sbc-clearall {
      color: #2563eb; font-size: 13px; font-weight: 500; cursor: pointer;
      background: none; border: none; display: flex; align-items: center; gap: 4px;
    }
    .sbc-clearall:hover { text-decoration: underline; }
    .sbc-export {
      margin-left: auto; display: flex; align-items: center; gap: 6px;
      color: #2563eb; font-size: 13px; font-weight: 500; cursor: pointer;
      background: none; border: none;
    }
    .sbc-export:hover { text-decoration: underline; }

    /* Stat cards */
    .sbc-stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; margin-bottom: 20px; }
    .sbc-stat {
      background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px 18px;
    }
    .sbc-stat label { font-size: 12px; color: #6b7280; font-weight: 500; display: block; margin-bottom: 7px; }
    .sbc-stat-val { font-size: 24px; font-weight: 700; color: #111827; }
    .sbc-badge {
      display: inline-flex; align-items: center; gap: 3px; font-size: 11px; font-weight: 600;
      padding: 2px 7px; border-radius: 999px; margin-left: 7px; vertical-align: middle;
    }
    .sbc-up   { background: #dcfce7; color: #166534; }
    .sbc-down { background: #fef3c7; color: #92400e; }

    /* Two-col row */
    .sbc-row { display: grid; grid-template-columns: 1.85fr 1fr; gap: 14px; margin-bottom: 14px; }
    @media(max-width:900px){ .sbc-row { grid-template-columns: 1fr; } }
    .sbc-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
    @media(max-width:800px){ .sbc-row-2 { grid-template-columns: 1fr; } }

    /* Card */
    .sbc-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px 20px; }
    .sbc-card-title { font-size: 14px; font-weight: 600; margin: 0 0 14px; color: #111827; }

    /* Tabs */
    .sbc-tabs { display: flex; border-bottom: 1px solid #e5e7eb; margin-bottom: 14px; }
    .sbc-tab {
      padding: 6px 13px; font-size: 13px; font-weight: 500; color: #6b7280;
      cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: color 0.15s;
    }
    .sbc-tab:hover { color: #374151; }
    .sbc-tab.active { color: #111827; font-weight: 600; border-bottom-color: #111827; }

    /* Bar list */
    .sbc-bars { display: flex; flex-direction: column; gap: 11px; }
    .sbc-bar-row { display: flex; flex-direction: column; gap: 4px; }
    .sbc-bar-lrow { display: flex; justify-content: space-between; font-size: 13px; color: #374151; }
    .sbc-bar-track { height: 8px; border-radius: 999px; background: #f3f4f6; overflow: hidden; }
    .sbc-bar-fill { height: 100%; border-radius: 999px; transition: width 0.35s ease; }

    /* Table */
    .sbc-tbl-wrap { overflow-x: auto; margin-top: 12px; }
    .sbc-tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
    .sbc-tbl th {
      text-align: left; padding: 9px 11px; font-size: 11px; font-weight: 600;
      color: #6b7280; border-bottom: 1px solid #e5e7eb; white-space: nowrap;
    }
    .sbc-tbl td { padding: 11px; border-bottom: 1px solid #f3f4f6; color: #374151; }
    .sbc-tbl tr:last-child td { border-bottom: none; }
    .sbc-tbl tr:hover td { background: #f9fafb; }
    .sbc-clink { font-weight: 500; color: #111827; cursor: pointer; }
    .sbc-clink:hover { color: #2563eb; text-decoration: underline; }
    .sbc-csub { font-size: 11px; color: #9ca3af; }

    /* Calendar */
    .sbc-cal-wrap { position: relative; }
    .sbc-cal-drop {
      position: absolute; top: calc(100% + 8px); left: 0; z-index: 9999;
      background: #fff; border: 1px solid #d1d5db; border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.13); display: flex; overflow: hidden; width: 590px;
    }
    .sbc-presets { width: 130px; border-right: 1px solid #e5e7eb; padding: 10px 0; flex-shrink: 0; }
    .sbc-preset {
      display: block; padding: 9px 16px; font-size: 13px; color: #374151;
      cursor: pointer; transition: background 0.1s;
    }
    .sbc-preset:hover { background: #f3f4f6; }
    .sbc-preset.active { background: #eff6ff; color: #1d4ed8; font-weight: 600; }
    .sbc-cal-body { flex: 1; padding: 16px; }
    .sbc-date-inputs { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
    .sbc-date-lbl { font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
    .sbc-date-box {
      display: flex; align-items: center; gap: 7px; border: 1px solid #d1d5db;
      border-radius: 8px; padding: 7px 10px; font-size: 13px; color: #374151;
    }
    .sbc-cal-months { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .sbc-month-hdr { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 13px; font-weight: 600; }
    .sbc-month-nav { cursor: pointer; color: #6b7280; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; border-radius: 4px; font-size: 14px; }
    .sbc-month-nav:hover { background: #f3f4f6; color: #111827; }
    .sbc-cal-grid { display: grid; grid-template-columns: repeat(7,1fr); gap: 2px; text-align: center; }
    .sbc-cal-dow { font-size: 10px; color: #9ca3af; font-weight: 500; padding: 2px 0; }
    .sbc-cal-day { font-size: 12px; padding: 5px 2px; border-radius: 50%; cursor: pointer; color: #374151; }
    .sbc-cal-day:hover { background: #f3f4f6; }
    .sbc-cal-day.sel { background: #2563eb; color: #fff; font-weight: 600; }
    .sbc-cal-day.rng { background: #dbeafe; color: #1e40af; }
    .sbc-cal-day.empty { visibility: hidden; pointer-events: none; }
    .sbc-cal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb; }
    .sbc-cal-clear { color: #374151; font-size: 13px; background: none; border: none; cursor: pointer; font-weight: 500; }
    .sbc-cal-apply { padding: 7px 16px; background: #2563eb; color: #fff; font-size: 13px; font-weight: 600; border: none; border-radius: 8px; cursor: pointer; }
    .sbc-cal-apply:hover { background: #1d4ed8; }

    /* Dropdown */
    .sbc-drop {
      position: absolute; top: calc(100% + 6px); left: 0; z-index: 9998;
      background: #fff; border: 1px solid #d1d5db; border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.10); min-width: 240px; padding: 7px;
    }
    .sbc-drop-item { display: flex; align-items: center; gap: 9px; padding: 8px 10px; font-size: 13px; color: #374151; cursor: pointer; border-radius: 6px; }
    .sbc-drop-item:hover { background: #f3f4f6; }
    .sbc-drop-item input[type=checkbox] { accent-color: #2563eb; }

    /* Detail view */
    .sbc-back { display: inline-flex; align-items: center; gap: 6px; color: #6b7280; font-size: 14px; cursor: pointer; margin-bottom: 14px; }
    .sbc-back:hover { color: #374151; }
    .sbc-detail-hdr { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 18px; }
    .sbc-detail-title { font-size: 20px; font-weight: 700; margin: 0 0 6px; }
    .sbc-open-link { font-size: 13px; color: #2563eb; cursor: pointer; display: flex; align-items: center; gap: 4px; text-decoration: none; }
    .sbc-open-link:hover { text-decoration: underline; }

    /* Post tables */
    .sbc-ptbl { width: 100%; border-collapse: collapse; }
    .sbc-ptbl th { font-size: 11px; color: #9ca3af; font-weight: 600; padding: 0 0 8px; text-align: left; }
    .sbc-ptbl td { padding: 9px 0; border-bottom: 1px solid #f3f4f6; font-size: 13px; color: #374151; }
    .sbc-ptbl tr:last-child td { border-bottom: none; }
    .sbc-ptbl td:last-child { text-align: right; }
    .sbc-pname { font-weight: 500; color: #111827; max-width: 200px; font-size: 12px; }
    .sbc-arrow { color: #2563eb; cursor: pointer; font-size: 15px; }
    .sbc-arrow:hover { color: #1d4ed8; }

    /* Type badges */
    .sbc-badge-type { display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; border: 1px solid; }
    .sbc-open-t  { color: #166534; border-color: #166534; background: #f0fdf4; }
    .sbc-cond-t  { color: #7c3aed; border-color: #7c3aed; background: #f5f3ff; }
    .sbc-man-t   { color: #d97706; border-color: #d97706; background: #fffbeb; }

    /* Search */
    .sbc-search { padding: 6px 11px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 13px; outline: none; width: 180px; }
    .sbc-search:focus { border-color: #2563eb; }

    /* Legend toggle */
    .sbc-legend { display: flex; gap: 14px; margin-top: 10px; flex-wrap: wrap; }
    .sbc-leg-item { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #6b7280; }
    .sbc-leg-item input { accent-color: currentColor; width: 13px; height: 13px; }
  `;

  /* ══════════════════════════════════════════════════
     BOOTSTRAP
  ══════════════════════════════════════════════════ */

  function injectStyles() {
    if (document.getElementById('sbc-styles')) return;
    const s = document.createElement('style');
    s.id = 'sbc-styles';
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

  // Neutralise the native Staffbase sidebar active highlight while our overlay is shown
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
  ══════════════════════════════════════════════════ */

  // Analytics sub-page hrefs Staffbase always renders
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
    for (const href of ANALYTICS_HREFS) {
      const el = document.querySelector(`a[href="${href}"], a[href*="${href}"]`);
      if (el) return el;
    }
    return null;
  }

  function injectNav() {
    if (document.getElementById('sb-comm-nav')) return true;
    const ref = findLastAnalyticsLink();
    if (!ref) return false;

    const nav = document.createElement('a');
    nav.id   = 'sb-comm-nav';
    nav.href = '#';
    nav.textContent = 'Communities';
    nav.addEventListener('click', e => { e.preventDefault(); mountDashboard(); });

    // Clone the reference link's computed styles so it blends in
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
    // Measure actual top-bar bottom and sidebar right edge
    let topH = 60, leftW = 220;
    const topSels  = ['header','[class*="TopBar"]','[class*="topbar"]','[class*="AppBar"]','[class*="Navbar"]'];
    const sideSels = ['nav','aside','[class*="Sidebar"]','[class*="sidebar"]','[class*="Navigation"]'];
    for (const s of topSels)  { const el = document.querySelector(s); if (el) { const r = el.getBoundingClientRect(); if (r.height > 20 && r.height < 120) { topH = Math.round(r.bottom); break; } } }
    for (const s of sideSels) { const el = document.querySelector(s); if (el) { const r = el.getBoundingClientRect(); if (r.width  > 80 && r.width  < 400) { leftW = Math.round(r.right);  break; } } }
    return { topH, leftW };
  }

  function mountDashboard() {
    document.getElementById('sb-comm-nav')?.classList.add('active');
    suppressNativeHighlight();

    // Reuse existing overlay
    const existing = document.getElementById('sb-comm-dash');
    if (existing) { existing.style.display = 'block'; loadChartJS(() => renderOverview(existing)); return; }

    const { topH, leftW } = measureStaffbaseLayout();
    const overlay = document.createElement('div');
    overlay.id = 'sb-comm-dash';
    overlay.style.cssText = `
      position:fixed!important; top:${topH}px!important; left:${leftW}px!important;
      right:0!important; bottom:0!important; z-index:500!important;
      background:#f3f4f6!important; overflow-y:auto!important; overflow-x:hidden!important;
    `;
    document.body.appendChild(overlay);
    loadChartJS(() => renderOverview(overlay));
  }

  function unmountDashboard() {
    document.getElementById('sb-comm-nav')?.classList.remove('active');
    restoreNativeHighlight();
    const overlay = document.getElementById('sb-comm-dash');
    if (overlay) overlay.style.display = 'none';
  }

  /* ══════════════════════════════════════════════════
     OVERVIEW
  ══════════════════════════════════════════════════ */

  function renderOverview(container) {
    state.activeCommunity = null;

    // Filtered communities
    const comms = state.selectedCommunities.length
      ? COMMUNITIES.filter(c => state.selectedCommunities.includes(c.id))
      : COMMUNITIES;

    container.innerHTML = `
      <h1 class="sbc-title">Communities</h1>

      ${filterBar()}

      <div class="sbc-stats">
        ${stat('Total Views',    '1,657', 'up',   '+12%')}
        ${stat('Total Members',  '950',   'up',   '+23%')}
        ${stat('Active Members', '352',   'down', '-12%')}
        ${stat('Total Posts',    '873',   'up',   '+10%')}
      </div>

      <div class="sbc-row">
        <div class="sbc-card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
            <h3 class="sbc-card-title" style="margin:0">Total Activity Over Time</h3>
          </div>
          <div style="position:relative;height:200px;">
            <canvas id="sbc-activity-chart"></canvas>
          </div>
          <div class="sbc-legend" id="sbc-legend">
            ${leg('Posts','#3b82f6','posts')}
            ${leg('Views','#06b6d4','views')}
            ${leg('Reactions','#a855f7','reactions')}
            ${leg('Comments','#22c55e','comments')}
          </div>
        </div>

        <div class="sbc-card" id="sbc-engage-card">
          <h3 class="sbc-card-title">Community Engagement</h3>
          <div class="sbc-tabs" id="sbc-engage-tabs">
            ${['Posts','Views','Reactions','Comments'].map((t,i)=>
              `<div class="sbc-tab${i===0?' active':''}" data-tab="${t.toLowerCase()}">${t}</div>`).join('')}
          </div>
          <div class="sbc-bars" id="sbc-engage-bars"></div>
        </div>
      </div>

      <div class="sbc-row">
        <div class="sbc-card">
          <h3 class="sbc-card-title">Engagement by User Group</h3>
          <div class="sbc-bars" id="sbc-ug-bars"></div>
        </div>
        <div class="sbc-card">
          <h3 class="sbc-card-title">Engagement by Post</h3>
          <div class="sbc-tabs" id="sbc-post-tabs">
            ${['Views','Reactions','Comments'].map((t,i)=>
              `<div class="sbc-tab${i===0?' active':''}" data-tab="${t.toLowerCase()}">${t}</div>`).join('')}
          </div>
          <div class="sbc-bars" id="sbc-post-bars"></div>
        </div>
      </div>

      <div class="sbc-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <h3 class="sbc-card-title" style="margin:0;">Communities</h3>
          <input class="sbc-search" id="sbc-tbl-search" placeholder="🔍 Search..." />
        </div>
        <div class="sbc-tbl-wrap">
          <table class="sbc-tbl">
            <thead><tr>
              <th>Community ↓</th><th>Views</th><th>Members</th>
              <th>Active Members</th><th>Posts</th>
              <th>Post Reactions</th><th>Comment Reactions</th><th>Comments</th>
            </tr></thead>
            <tbody id="sbc-tbl-body">
              ${comms.map(c => {
                const s = COMMUNITY_STATS[c.id];
                return `<tr>
                  <td>
                    <div class="sbc-clink" data-id="${c.id}">${c.name}</div>
                    <div class="sbc-csub">${c.space}</div>
                  </td>
                  <td>${s.views.toLocaleString()}</td>
                  <td>${c.members}</td>
                  <td>${s.activeMembers}</td>
                  <td>${s.posts}</td>
                  <td>${(s.reactions/s.posts).toFixed(1)}</td>
                  <td>${(s.comments/s.posts).toFixed(1)}</td>
                  <td>${s.comments}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    bindOverviewEvents(container);
    drawEngageBars(container, 'posts');
    drawUGBars(container);
    drawPostBars(container, 'views');
    requestAnimationFrame(() => drawActivityChart(container));
  }

  /* ══════════════════════════════════════════════════
     HTML HELPERS
  ══════════════════════════════════════════════════ */

  function stat(label, value, dir, change) {
    return `<div class="sbc-stat">
      <label>${label}</label>
      <div class="sbc-stat-val">${value}
        <span class="sbc-badge sbc-${dir}">${dir==='up'?'↑':'↘'} ${change}</span>
      </div>
    </div>`;
  }

  function leg(label, color, key) {
    return `<div class="sbc-leg-item" style="color:${color};">
      <input type="checkbox" checked data-series="${key}" class="sbc-series-toggle" style="accent-color:${color};">
      <span style="color:#6b7280;">${label}</span>
    </div>`;
  }

  function filterBar() {
    const commCount = state.selectedCommunities.length;
    const ugLabel   = state.selectedUserGroup === 'all' ? 'User Group' : state.selectedUserGroup;
    const hasFilter = commCount > 0 || state.selectedUserGroup !== 'all';
    const dateLabel = `${state.dateRange.label}: ${state.dateRange.start} – ${state.dateRange.end}`;

    return `<div class="sbc-fbar">
      <div class="sbc-cal-wrap">
        <button class="sbc-fbtn" id="sbc-date-btn">
          📅 ${dateLabel} ∨
        </button>
      </div>
      <div style="position:relative;">
        <button class="sbc-fbtn${commCount?' active':''}" id="sbc-comm-filter-btn">
          Community${commCount?` <span style="background:#2563eb;color:#fff;border-radius:999px;padding:1px 6px;font-size:10px;">${commCount}</span>`:''} ∨
        </button>
      </div>
      <div style="position:relative;">
        <button class="sbc-fbtn${ugLabel!=='User Group'?' active':''}" id="sbc-ug-filter-btn">
          ${ugLabel} ∨
        </button>
      </div>
      <button class="sbc-fbtn" id="sbc-platform-btn">Platform ∨</button>
      ${hasFilter?`<button class="sbc-clearall" id="sbc-clear-all">↺ Clear all filters</button>`:''}
      <button class="sbc-export">
        ↓ CSV Export
      </button>
    </div>`;
  }

  /* ══════════════════════════════════════════════════
     CHARTS
  ══════════════════════════════════════════════════ */

  function drawActivityChart(container) {
    const canvas = container.querySelector('#sbc-activity-chart');
    if (!canvas || !window.Chart) return;
    if (state.chartInstances.activity) { state.chartInstances.activity.destroy(); }

    state.chartInstances.activity = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: DATE_LABELS,
        datasets: [
          { label:'Posts',     data: ACTIVITY_DATA.posts,     borderColor:'#3b82f6', backgroundColor:'rgba(59,130,246,0.07)',  tension:0.4, borderWidth:2, pointRadius:4, pointHoverRadius:6 },
          { label:'Views',     data: ACTIVITY_DATA.views,     borderColor:'#06b6d4', backgroundColor:'rgba(6,182,212,0.07)',   tension:0.4, borderWidth:2, pointRadius:4, pointHoverRadius:6 },
          { label:'Reactions', data: ACTIVITY_DATA.reactions, borderColor:'#a855f7', backgroundColor:'rgba(168,85,247,0.07)',  tension:0.4, borderWidth:2, pointRadius:4, pointHoverRadius:6 },
          { label:'Comments',  data: ACTIVITY_DATA.comments,  borderColor:'#22c55e', backgroundColor:'rgba(34,197,94,0.07)',   tension:0.4, borderWidth:2, pointRadius:4, pointHoverRadius:6 },
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        interaction: { mode:'index', intersect:false },
        plugins: {
          legend: { display:false },
          tooltip: {
            backgroundColor:'#fff', borderColor:'#e5e7eb', borderWidth:1,
            titleColor:'#111827', bodyColor:'#374151', padding:12,
            callbacks: {
              title: items => items[0].label,
              label: item  => ` ${item.dataset.label}: ${item.raw.toLocaleString()}`
            }
          }
        },
        scales: {
          x: { grid:{ display:false }, ticks:{ font:{size:11}, color:'#9ca3af' } },
          y: { grid:{ color:'#f3f4f6' }, ticks:{ font:{size:11}, color:'#9ca3af' }, beginAtZero:true }
        }
      }
    });
  }

  function drawEngageBars(container, tab) {
    const wrap = container.querySelector('#sbc-engage-bars');
    if (!wrap) return;
    const color = BAR_COLORS[tab] || '#3b82f6';
    const comms = state.selectedCommunities.length
      ? COMMUNITIES.filter(c => state.selectedCommunities.includes(c.id))
      : COMMUNITIES;
    const max = Math.max(...comms.map(c => COMMUNITY_STATS[c.id][tab] || 0));
    wrap.innerHTML = comms.map(c => {
      const val = COMMUNITY_STATS[c.id][tab] || 0;
      const pct = max > 0 ? (val/max*100).toFixed(1) : 0;
      const short = c.name.replace(' ERG','');
      return `<div class="sbc-bar-row">
        <div class="sbc-bar-lrow"><span>${short}</span><span>${val.toLocaleString()}</span></div>
        <div class="sbc-bar-track"><div class="sbc-bar-fill" style="width:${pct}%;background:${color};"></div></div>
      </div>`;
    }).join('');
  }

  function drawUGBars(container) {
    const wrap = container.querySelector('#sbc-ug-bars');
    if (!wrap) return;
    const data = [
      { label:'Indiana',        val:1480 },
      { label:'Texas',          val:1283 },
      { label:'South Carolina', val:1100 },
      { label:'Engineering',    val:568  },
      { label:'Leadership',     val:568  },
    ];
    const max = Math.max(...data.map(d => d.val));
    wrap.innerHTML = data.map(d => `<div class="sbc-bar-row">
      <div class="sbc-bar-lrow"><span>${d.label}</span><span>${d.val.toLocaleString()}</span></div>
      <div class="sbc-bar-track"><div class="sbc-bar-fill" style="width:${(d.val/max*100).toFixed(1)}%;background:#3b82f6;"></div></div>
    </div>`).join('');
  }

  function drawPostBars(container, tab) {
    const wrap = container.querySelector('#sbc-post-bars');
    if (!wrap) return;
    const color = BAR_COLORS[tab] || '#06b6d4';
    const key   = tab === 'views' ? 'views' : tab === 'reactions' ? 'likes' : 'comments';
    const max   = Math.max(...SAMPLE_POSTS.map(p => p[key]||0));
    wrap.innerHTML = SAMPLE_POSTS.map(p => {
      const val   = p[key]||0;
      const short = p.title.length > 28 ? p.title.slice(0,28)+'…' : p.title;
      return `<div class="sbc-bar-row">
        <div class="sbc-bar-lrow"><span title="${p.title}">${short}</span><span>${val}</span></div>
        <div class="sbc-bar-track"><div class="sbc-bar-fill" style="width:${(val/max*100).toFixed(1)}%;background:${color};"></div></div>
      </div>`;
    }).join('');
  }

  /* ══════════════════════════════════════════════════
     EVENT BINDING — OVERVIEW
  ══════════════════════════════════════════════════ */

  function bindOverviewEvents(container) {
    // Engagement tabs
    container.querySelectorAll('#sbc-engage-tabs .sbc-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        container.querySelectorAll('#sbc-engage-tabs .sbc-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        drawEngageBars(container, tab.dataset.tab);
      });
    });

    // Post bars tabs
    container.querySelectorAll('#sbc-post-tabs .sbc-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        container.querySelectorAll('#sbc-post-tabs .sbc-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        drawPostBars(container, tab.dataset.tab);
      });
    });

    // Chart series toggles
    container.querySelectorAll('.sbc-series-toggle').forEach(cb => {
      cb.addEventListener('change', () => {
        const chart = state.chartInstances.activity;
        if (!chart) return;
        const idx = ['posts','views','reactions','comments'].indexOf(cb.dataset.series);
        if (idx >= 0) { chart.data.datasets[idx].hidden = !cb.checked; chart.update(); }
      });
    });

    // Community row drill-down
    container.querySelectorAll('.sbc-clink[data-id]').forEach(el => {
      el.addEventListener('click', () => {
        const comm = COMMUNITIES.find(c => c.id === el.dataset.id);
        if (comm) showDetail(comm);
      });
    });

    // Date button
    container.querySelector('#sbc-date-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      toggleCal(e.currentTarget);
    });

    // Community filter
    container.querySelector('#sbc-comm-filter-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      toggleCommDrop(e.currentTarget);
    });

    // User group filter
    container.querySelector('#sbc-ug-filter-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      toggleUGDrop(e.currentTarget);
    });

    // Clear all filters
    container.querySelector('#sbc-clear-all')?.addEventListener('click', () => {
      state.selectedCommunities = [];
      state.selectedUserGroup   = 'all';
      renderOverview(container);
    });

    // Table search
    container.querySelector('#sbc-tbl-search')?.addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      container.querySelectorAll('#sbc-tbl-body tr').forEach(row => {
        const name = row.querySelector('.sbc-clink')?.textContent.toLowerCase() || '';
        row.style.display = name.includes(q) ? '' : 'none';
      });
    });

    document.addEventListener('click', closeAllDrops);
  }

  /* ══════════════════════════════════════════════════
     CALENDAR
  ══════════════════════════════════════════════════ */

  function toggleCal(anchor) {
    closeAllDrops();
    const existing = document.getElementById('sbc-cal-drop');
    if (existing) { existing.remove(); return; }

    const drop = document.createElement('div');
    drop.id = 'sbc-cal-drop';
    drop.className = 'sbc-cal-drop';
    drop.innerHTML = buildCalHTML();
    anchor.parentElement.appendChild(drop);
    bindCalEvents(drop);
    drop.addEventListener('click', e => e.stopPropagation());
  }

  function buildCalHTML() {
    const presets = ['Today','Yesterday','7 days','30 days','365 days','This Week','This Month','This Year'];
    return `
      <div class="sbc-presets">
        ${presets.map(p=>`<div class="sbc-preset${p==='30 days'?' active':''}" data-preset="${p}">${p}</div>`).join('')}
      </div>
      <div class="sbc-cal-body">
        <div class="sbc-date-inputs">
          <div>
            <div class="sbc-date-lbl">Start Date (Required)</div>
            <div class="sbc-date-box">📅 04/04/2026 <span style="margin-left:auto;cursor:pointer;color:#9ca3af;">×</span></div>
          </div>
          <div>
            <div class="sbc-date-lbl">End Date (Required)</div>
            <div class="sbc-date-box">📅 05/04/2026</div>
          </div>
        </div>
        <div class="sbc-cal-months">
          ${buildMonth('April 2026', 4, 2026)}
          ${buildMonth('May 2026',   5, 2026)}
        </div>
        <div class="sbc-cal-actions">
          <button class="sbc-cal-clear" id="sbc-cal-clear">Clear All</button>
          <button class="sbc-cal-apply" id="sbc-cal-apply">Apply</button>
        </div>
      </div>`;
  }

  function buildMonth(name, month, year) {
    const dows    = ['Mo','Tu','We','Th','Fr','Sa','Su'];
    const first   = new Date(year, month-1, 1).getDay();
    const offset  = first === 0 ? 6 : first - 1;
    const days    = new Date(year, month, 0).getDate();

    let cells = dows.map(d=>`<div class="sbc-cal-dow">${d}</div>`).join('');
    for (let i=0; i<offset; i++) cells += `<div class="sbc-cal-day empty"></div>`;
    for (let d=1; d<=days; d++) {
      const isSel = (month===5 && d===4); // May 4 pre-selected
      cells += `<div class="sbc-cal-day${isSel?' sel':''}"
        data-date="${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}">${d}</div>`;
    }
    return `<div>
      <div class="sbc-month-hdr">
        <span class="sbc-month-nav">←</span>
        <span>${name}</span>
        <span class="sbc-month-nav">→</span>
      </div>
      <div class="sbc-cal-grid">${cells}</div>
    </div>`;
  }

  function bindCalEvents(drop) {
    drop.querySelectorAll('.sbc-preset').forEach(p => {
      p.addEventListener('click', () => {
        drop.querySelectorAll('.sbc-preset').forEach(x=>x.classList.remove('active'));
        p.classList.add('active');
        state.dateRange.label = p.dataset.preset;
      });
    });

    let selStart = null;
    drop.querySelectorAll('.sbc-cal-day:not(.empty)').forEach(day => {
      day.addEventListener('click', () => {
        if (!selStart) {
          drop.querySelectorAll('.sbc-cal-day').forEach(d=>d.classList.remove('sel','rng'));
          day.classList.add('sel');
          selStart = day.dataset.date;
        } else {
          day.classList.add('sel');
          const fmt = d => d.split('-').reverse().join('/');
          state.dateRange.start = fmt(selStart);
          state.dateRange.end   = fmt(day.dataset.date);
          selStart = null;
        }
      });
    });

    drop.querySelector('#sbc-cal-apply')?.addEventListener('click', () => {
      drop.remove();
      const dash = document.getElementById('sb-comm-dash');
      if (dash) renderOverview(dash);
    });

    drop.querySelector('#sbc-cal-clear')?.addEventListener('click', () => {
      drop.querySelectorAll('.sbc-cal-day').forEach(d=>d.classList.remove('sel','rng'));
      selStart = null;
    });
  }

  /* ══════════════════════════════════════════════════
     FILTER DROPDOWNS
  ══════════════════════════════════════════════════ */

  function toggleCommDrop(anchor) {
    closeAllDrops();
    if (document.getElementById('sbc-comm-drop')) { document.getElementById('sbc-comm-drop').remove(); return; }
    const drop = document.createElement('div');
    drop.id = 'sbc-comm-drop';
    drop.className = 'sbc-drop';
    drop.innerHTML = COMMUNITIES.map(c=>`
      <div class="sbc-drop-item" data-id="${c.id}">
        <input type="checkbox" ${state.selectedCommunities.includes(c.id)?'checked':''} />
        ${c.name}
      </div>`).join('');
    anchor.parentElement.appendChild(drop);
    drop.querySelectorAll('.sbc-drop-item').forEach(item => {
      item.addEventListener('click', e => {
        const cb = item.querySelector('input');
        cb.checked = !cb.checked;
        const id = item.dataset.id;
        if (cb.checked) { if (!state.selectedCommunities.includes(id)) state.selectedCommunities.push(id); }
        else state.selectedCommunities = state.selectedCommunities.filter(x=>x!==id);
        e.stopPropagation();
      });
    });
    drop.addEventListener('click', e=>e.stopPropagation());
  }

  function toggleUGDrop(anchor) {
    closeAllDrops();
    if (document.getElementById('sbc-ug-drop')) { document.getElementById('sbc-ug-drop').remove(); return; }
    const drop = document.createElement('div');
    drop.id = 'sbc-ug-drop';
    drop.className = 'sbc-drop';
    drop.innerHTML = ['All',...USER_GROUPS].map(ug=>`
      <div class="sbc-drop-item${state.selectedUserGroup===(ug==='All'?'all':ug)?' active':''}" data-ug="${ug==='All'?'all':ug}">
        ${ug}
      </div>`).join('');
    anchor.parentElement.appendChild(drop);
    drop.querySelectorAll('.sbc-drop-item').forEach(item => {
      item.addEventListener('click', e => {
        state.selectedUserGroup = item.dataset.ug;
        drop.remove();
        const dash = document.getElementById('sb-comm-dash');
        if (dash) renderOverview(dash);
        e.stopPropagation();
      });
    });
    drop.addEventListener('click', e=>e.stopPropagation());
  }

  function closeAllDrops() {
    ['sbc-cal-drop','sbc-comm-drop','sbc-ug-drop'].forEach(id => document.getElementById(id)?.remove());
  }

  /* ══════════════════════════════════════════════════
     COMMUNITY DETAIL VIEW
  ══════════════════════════════════════════════════ */

  function showDetail(community) {
    state.activeCommunity = community;
    const dash = document.getElementById('sb-comm-dash');
    if (!dash) return;

    const s     = COMMUNITY_STATS[community.id];
    const scale = s.views / 1657;
    const typeClass = community.type === 'Open' ? 'sbc-open-t' : community.type === 'Conditional' ? 'sbc-cond-t' : 'sbc-man-t';

    dash.innerHTML = `
      <div class="sbc-back" id="sbc-back">← Communities</div>

      <div class="sbc-detail-hdr">
        <div>
          <h1 class="sbc-detail-title">${community.name}</h1>
          <div style="display:flex;align-items:center;gap:10px;margin-top:5px;">
            <span class="sbc-badge-type ${typeClass}">${community.type}</span>
            <span style="font-size:13px;color:#6b7280;">👥 ${community.members} members</span>
          </div>
        </div>
        <a class="sbc-open-link" href="#" target="_blank">Open Page Editor ↗</a>
      </div>

      <div class="sbc-stats">
        ${stat('Total Views',        s.views.toLocaleString(),   'up',   '+12%')}
        ${stat('Members',            s.members.toString(),        'up',   '+23%')}
        ${stat('Published Posts',    s.posts.toString(),          'up',   '+10%')}
        ${stat('Published Comments', s.comments.toLocaleString(), 'down', '-12%')}
      </div>

      <div class="sbc-row">
        <div class="sbc-card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <h3 class="sbc-card-title" style="margin:0;">Total Activity Over Time</h3>
          </div>
          <div style="position:relative;height:190px;">
            <canvas id="sbc-detail-chart"></canvas>
          </div>
          <div class="sbc-legend">
            ${leg('Posts','#3b82f6','posts')}
            ${leg('Views','#06b6d4','views')}
            ${leg('Reactions','#a855f7','reactions')}
            ${leg('Comments','#22c55e','comments')}
          </div>
        </div>

        <div class="sbc-card">
          <h3 class="sbc-card-title">Views by User Group</h3>
          <div class="sbc-bars" id="sbc-detail-ug-bars"></div>
        </div>
      </div>

      <div class="sbc-row-2">
        <div class="sbc-card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <h3 class="sbc-card-title" style="margin:0;">Most viewed posts</h3>
            <input class="sbc-search" placeholder="🔍 Search..." style="width:150px;" />
          </div>
          <table class="sbc-ptbl">
            <thead><tr><th>Post</th><th>Views</th><th></th></tr></thead>
            <tbody>
              ${SAMPLE_POSTS.map(p=>`<tr>
                <td><div class="sbc-pname">${p.title}</div></td>
                <td>${p.views}</td>
                <td><span class="sbc-arrow">→</span></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>

        <div class="sbc-card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <h3 class="sbc-card-title" style="margin:0;">Most engaged posts</h3>
            <input class="sbc-search" placeholder="🔍 Search..." style="width:150px;" />
          </div>
          <table class="sbc-ptbl">
            <thead><tr><th>Post</th><th>Likes</th><th>Comments</th><th></th></tr></thead>
            <tbody>
              ${SAMPLE_POSTS.map(p=>`<tr>
                <td><div class="sbc-pname">${p.title}</div></td>
                <td>${p.likes}</td>
                <td>${p.comments}</td>
                <td><span class="sbc-arrow">→</span></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Back button
    dash.querySelector('#sbc-back').addEventListener('click', () => renderOverview(dash));

    // Detail chart
    loadChartJS(() => requestAnimationFrame(() => {
      const canvas = dash.querySelector('#sbc-detail-chart');
      if (!canvas) return;
      if (state.chartInstances.detail) state.chartInstances.detail.destroy();
      state.chartInstances.detail = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
          labels: DATE_LABELS,
          datasets: [
            { label:'Posts',     data: ACTIVITY_DATA.posts.map(v=>Math.round(v*scale)),     borderColor:'#3b82f6', tension:0.4, borderWidth:2, pointRadius:3, pointHoverRadius:5 },
            { label:'Views',     data: ACTIVITY_DATA.views.map(v=>Math.round(v*scale)),     borderColor:'#06b6d4', tension:0.4, borderWidth:2, pointRadius:3, pointHoverRadius:5 },
            { label:'Reactions', data: ACTIVITY_DATA.reactions.map(v=>Math.round(v*scale)), borderColor:'#a855f7', tension:0.4, borderWidth:2, pointRadius:3, pointHoverRadius:5 },
            { label:'Comments',  data: ACTIVITY_DATA.comments.map(v=>Math.round(v*scale)),  borderColor:'#22c55e', tension:0.4, borderWidth:2, pointRadius:3, pointHoverRadius:5 },
          ]
        },
        options: {
          responsive:true, maintainAspectRatio:false,
          interaction:{ mode:'index', intersect:false },
          plugins: {
            legend:{ display:false },
            tooltip:{
              backgroundColor:'#fff', borderColor:'#e5e7eb', borderWidth:1,
              titleColor:'#111827', bodyColor:'#374151', padding:10,
            }
          },
          scales: {
            x:{ grid:{ display:false }, ticks:{ font:{size:11}, color:'#9ca3af' } },
            y:{ grid:{ color:'#f3f4f6' }, ticks:{ font:{size:11}, color:'#9ca3af' }, beginAtZero:true }
          }
        }
      });

      // Series toggles on detail view
      dash.querySelectorAll('.sbc-series-toggle').forEach(cb => {
        cb.addEventListener('change', () => {
          const idx = ['posts','views','reactions','comments'].indexOf(cb.dataset.series);
          if (idx >= 0 && state.chartInstances.detail) {
            state.chartInstances.detail.data.datasets[idx].hidden = !cb.checked;
            state.chartInstances.detail.update();
          }
        });
      });

      // UG bars
      const ugWrap = dash.querySelector('#sbc-detail-ug-bars');
      if (ugWrap) {
        const data = [
          { label:'Indiana',        val:Math.round(1480*scale) },
          { label:'Texas',          val:Math.round(1283*scale) },
          { label:'South Carolina', val:Math.round(1100*scale) },
          { label:'Engineering',    val:Math.round(568*scale)  },
          { label:'Leadership',     val:Math.round(568*scale)  },
        ];
        const max = Math.max(...data.map(d=>d.val));
        ugWrap.innerHTML = data.map(d=>`<div class="sbc-bar-row">
          <div class="sbc-bar-lrow"><span>${d.label}</span><span>${d.val}</span></div>
          <div class="sbc-bar-track"><div class="sbc-bar-fill" style="width:${(d.val/max*100).toFixed(1)}%;background:#1e40af;"></div></div>
        </div>`).join('');
      }
    }));
  }

  /* ══════════════════════════════════════════════════
     INIT + SPA WATCHER
  ══════════════════════════════════════════════════ */

  function init() {
    injectStyles();

    // Immediate attempt
    if (injectNav()) return;

    // MutationObserver — fires as soon as Staffbase renders the sidebar
    const observer = new MutationObserver(() => {
      if (injectNav()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Safety-net poll for 20 s in case MutationObserver misses a React reconcile
    let tries = 0;
    const poll = setInterval(() => {
      if (injectNav() || ++tries > 50) { clearInterval(poll); observer.disconnect(); }
    }, 400);
  }

  // Handle Staffbase SPA navigation — remove injected nav BEFORE React reconciles
  const _push = history.pushState.bind(history);
  history.pushState = function (...args) {
    document.getElementById('sb-comm-nav')?.remove();
    restoreNativeHighlight();
    if (document.getElementById('sb-comm-dash')) unmountDashboard();
    _push(...args);
    setTimeout(init, 600);
  };
  window.addEventListener('popstate', () => {
    document.getElementById('sb-comm-nav')?.remove();
    restoreNativeHighlight();
    if (document.getElementById('sb-comm-dash')) unmountDashboard();
    setTimeout(init, 600);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
