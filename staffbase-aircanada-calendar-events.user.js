// ==UserScript==
// @name         Staffbase Planning — Air Canada Crew Events
// @namespace    https://aircanada.staffbase.rocks/
// @version      1.4.0
// @description  AC crew calendar cards + Event creator in Create dropdown + kebab menu + auto-capture of newly created company-events into the planning calendar (demo)
// @match        https://app.staffbase.com/studio/*
// @author       Faraz Hussein · Staffbase SE Solutions
// @match        https://aircanada.staffbase.rocks/studio/planning*
// @match        https://aircanadademo.staffbase.rocks/studio/planning*
// @match        https://*.staffbase.rocks/studio/planning*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  /* ══════════════════════════════════════════════════
     DATA — Air Canada crew/ops events
     Spread 2–3 days apart across May 2026.
  ══════════════════════════════════════════════════ */

  const AC_EVENTS = [
    {
      id: 'ac-e1',
      title: 'Spring 2026 Operational Readiness Briefing',
      date: '2026-05-04',
      startHour: 9, startMin: 0, duration: 90,
      status: 'Published',
      community: 'Air Canada — All Crew',
      audiences: ['Crew Space', 'Network Operations'],
      notifications: ['Push', 'Email'],
      createdBy: 'Lucie Guillemette',
      stats: { attendance: 1842, watchTime: '52 min avg', unique: 1761, comments: 96, likes: 412 },
      breakdown: [
        { label: 'YYZ — Toronto',   pct: 36 },
        { label: 'YUL — Montréal',  pct: 24 },
        { label: 'YVR — Vancouver', pct: 18 },
        { label: 'YYC — Calgary',   pct: 14 },
        { label: 'Other Stations',  pct:  8 },
      ],
    },
    {
      id: 'ac-e2',
      title: 'YYZ Hub: A321XLR Cabin Familiarization Walkaround',
      date: '2026-05-07', // +3 days
      startHour: 13, startMin: 30, duration: 120,
      status: 'Published',
      community: 'YYZ Cabin Crew',
      audiences: ['Crew Space', 'YYZ Base — Cabin'],
      notifications: ['Push'],
      createdBy: 'Marc-André Vézina',
      stats: { attendance: 214, watchTime: '108 min avg', unique: 208, comments: 41, likes: 132 },
      breakdown: [
        { label: 'YYZ — Cabin',  pct: 64 },
        { label: 'YYZ — Pilots', pct: 22 },
        { label: 'YYZ — Ground', pct: 14 },
      ],
    },
    {
      id: 'ac-e3',
      title: 'Cabin Service Excellence — Premium Cabin Workshop',
      date: '2026-05-09', // +2 days
      startHour: 10, startMin: 0, duration: 90,
      status: 'Published',
      community: 'Air Canada Signature Service',
      audiences: ['Crew Space', 'In-Flight Service Leads'],
      notifications: ['Push', 'Email'],
      createdBy: 'Andrew Yiu',
      stats: { attendance: 87, watchTime: '76 min avg', unique: 84, comments: 27, likes: 58 },
      breakdown: [
        { label: 'Signature Class', pct: 48 },
        { label: 'Premium Economy', pct: 32 },
        { label: 'Maple Leaf Lounge', pct: 20 },
      ],
    },
    {
      id: 'ac-e4',
      title: 'YVR Above & Beyond — Q1 Crew Recognition',
      date: '2026-05-12', // +3 days
      startHour: 16, startMin: 0, duration: 60,
      status: 'Published',
      community: 'YVR Base — All Crew',
      audiences: ['Crew Space', 'YVR Base'],
      notifications: ['Push'],
      createdBy: 'Samantha Yip',
      stats: { attendance: 68, watchTime: '42 min avg', unique: 54, comments: 0, likes: 0 },
      breakdown: [
        { label: 'YVR — Cabin',  pct: 58 },
        { label: 'YVR — Pilots', pct: 26 },
        { label: 'YVR — Ground', pct: 16 },
      ],
    },
    {
      id: 'ac-e5',
      title: 'Aeroplan Refresh — Crew FAQ Town Hall',
      date: '2026-05-14', // +2 days
      startHour: 11, startMin: 0, duration: 75,
      status: 'Completed',
      community: 'Air Canada — All Crew',
      audiences: ['Crew Space', 'Loyalty & Customer Experience'],
      notifications: ['Push', 'Email'],
      createdBy: 'Mark Nasr',
      stats: { attendance: 487, watchTime: '58 min avg', unique: 412, comments: 0, likes: 0 },
      breakdown: [
        { label: 'YYZ — Toronto',   pct: 34 },
        { label: 'YUL — Montréal',  pct: 22 },
        { label: 'YVR — Vancouver', pct: 19 },
        { label: 'YYC — Calgary',   pct: 15 },
        { label: 'Other Stations',  pct: 10 },
      ],
    },
  ];

  // Earliest event date — used as the "calendar is rendered" sentinel.
  const SENTINEL_DATE = AC_EVENTS[0].date;

  // Staffbase company-event editor URL — used by Create > Event + kebab "Edit"
  const EVENT_EDITOR_URL = 'https://app.staffbase.com/studio/content/company-event/scheduled';

  // Persist removed event IDs so the SPA observer doesn't resurrect them.
  const REMOVED_KEY = 'ac_cal_removed_events';
  let removedIds = new Set();
  try { removedIds = new Set(JSON.parse(localStorage.getItem(REMOVED_KEY) || '[]')); } catch (_) {}
  function persistRemoved() {
    localStorage.setItem(REMOVED_KEY, JSON.stringify([...removedIds]));
  }

  // User-created events captured from Staffbase company-event flow.
  const USER_EVENTS_KEY = 'ac_cal_user_events';
  let userEvents = [];
  try { userEvents = JSON.parse(localStorage.getItem(USER_EVENTS_KEY) || '[]'); } catch (_) {}
  function persistUserEvents() {
    localStorage.setItem(USER_EVENTS_KEY, JSON.stringify(userEvents));
  }
  function allEvents() { return AC_EVENTS.concat(userEvents); }

  /* ══════════════════════════════════════════════════
     CSS  (detail panel only — cards use FC's own classes)
  ══════════════════════════════════════════════════ */

  const CSS = `
    /* ── Backdrop ── */
    #ac-panel-backdrop {
      display: none; position: fixed; inset: 0;
      background: rgba(0,0,0,0.45); z-index: 9998;
    }
    #ac-panel-backdrop.open { display: block; }

    /* ── Modal (centered, matches native Staffbase post popup) ── */
    #ac-detail-panel {
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%, -46%);
      opacity: 0; pointer-events: none;
      width: 460px; max-width: calc(100vw - 32px);
      max-height: calc(100vh - 64px);
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.22);
      z-index: 9999;
      overflow-y: auto;
      transition: opacity 0.18s ease, transform 0.18s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #ac-detail-panel.open {
      opacity: 1; pointer-events: auto;
      transform: translate(-50%, -50%);
    }
    #ac-detail-panel * { box-sizing: border-box; }

    /* ── Header image area — Air Canada red gradient ── */
    .ac-pnl-hdr {
      width: 100%; height: 180px; position: relative; flex-shrink: 0;
      background: linear-gradient(145deg, #1a1a1a 0%, #6e0d0d 45%, #D82F2F 100%);
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 10px; border-radius: 12px 12px 0 0;
      overflow: hidden;
    }
    .ac-pnl-hdr::before {
      content: ''; position: absolute; inset: 0;
      background: radial-gradient(ellipse at 70% 30%, rgba(255,255,255,0.12) 0%, transparent 60%);
    }
    .ac-pnl-hdr-icon { font-size: 40px; position: relative; line-height: 1; }
    .ac-pnl-hdr-icon svg { width: 44px; height: 44px; fill: #fff; }
    .ac-pnl-hdr-comm {
      font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.95);
      text-align: center; padding: 0 52px; line-height: 1.35; position: relative;
    }
    .ac-pnl-close {
      position: absolute; top: 10px; right: 10px;
      width: 28px; height: 28px; border-radius: 50%;
      background: rgba(0,0,0,0.35); border: none;
      color: #fff; font-size: 13px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      line-height: 1; z-index: 1;
    }
    .ac-pnl-close:hover { background: rgba(0,0,0,0.55); }

    /* ── Body ── */
    .ac-pnl-body { padding: 18px 20px 24px; }

    .ac-badge {
      display: inline-block; font-size: 12px; font-weight: 600;
      padding: 3px 10px; border-radius: 999px;
    }
    .ac-badge.pub   { background: #dcfce7; color: #166534; }
    .ac-badge.sched { background: #fef9c3; color: #92400e; }
    .ac-badge.done  { background: #e5e7eb; color: #374151; }

    /* ── Status row + kebab menu ── */
    .ac-pnl-toprow {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 10px; position: relative;
    }
    .ac-pnl-kebab {
      background: none; border: 0; cursor: pointer;
      width: 30px; height: 30px; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      color: #6b7280; padding: 0;
    }
    .ac-pnl-kebab:hover { background: #f3f4f6; color: #111827; }
    .ac-pnl-kebab svg { width: 18px; height: 18px; fill: currentColor; }
    .ac-pnl-kebab-menu {
      display: none;
      position: absolute; right: 0; top: 36px;
      background: #fff; border: 1px solid #e5e7eb;
      border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.14);
      min-width: 210px; z-index: 20; overflow: hidden;
      padding: 4px 0;
    }
    .ac-pnl-kebab-menu.open { display: block; }
    .ac-pnl-kebab-item {
      display: flex; align-items: center; gap: 10px;
      padding: 9px 14px; font-size: 13px; line-height: 1.2;
      background: none; border: 0; width: 100%; text-align: left;
      cursor: pointer; color: #374151; text-decoration: none;
      font-family: inherit;
    }
    .ac-pnl-kebab-item:hover { background: #f9fafb; }
    .ac-pnl-kebab-item--danger { color: #b91c1c; }
    .ac-pnl-kebab-item--danger:hover { background: #fef2f2; }
    .ac-pnl-kebab-item svg { width: 16px; height: 16px; flex-shrink: 0; fill: currentColor; }

    .ac-pnl-title {
      font-size: 18px; font-weight: 700; color: #111827;
      margin: 0 0 6px; line-height: 1.3;
    }
    .ac-pnl-date   { font-size: 13px; color: #6b7280; margin: 0 0 2px; }
    .ac-pnl-author { font-size: 13px; color: #6b7280; margin: 0; }
    .ac-pnl-author a { color: #D82F2F; text-decoration: underline; cursor: default; }

    /* ── Divider ── */
    .ac-div { height: 1px; background: #e5e7eb; margin: 14px 0; }

    /* ── Two-column audience + notifications ── */
    .ac-two-col {
      display: grid; grid-template-columns: 1fr 1fr; gap: 0;
    }
    .ac-col { padding-right: 16px; }
    .ac-col:last-child { padding-right: 0; padding-left: 16px; border-left: 1px solid #e5e7eb; }

    .ac-sec {
      font-size: 11px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.06em; color: #9ca3af; margin-bottom: 8px;
    }
    .ac-row {
      display: flex; align-items: center; gap: 8px;
      font-size: 13px; color: #374151; margin-bottom: 6px;
    }
    .ac-row-ic { font-size: 15px; flex-shrink: 0; }

    /* ── Analytics rows (native Staffbase icon + value + label pattern) ── */
    .ac-analytics { padding: 2px 0 0; }
    .ac-analytics-row { display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap; }
    .ac-analytics-row:last-child { margin-bottom: 0; }
    .ac-analytics-item { display: flex; align-items: center; }
    .ac-analytics-icon {
      width: 32px; height: 32px; border-radius: 50%;
      background: #f3f4f6; display: flex; align-items: center;
      justify-content: center; flex-shrink: 0; color: #6b7280;
    }
    .ac-analytics-icon svg { width: 16px; height: 16px; fill: currentColor; }
    .ac-analytics-label { margin-left: 8px; }
    .ac-analytics-val { font-size: 14px; font-weight: 600; color: #111827; line-height: 1.2; white-space: nowrap; }
    .ac-analytics-name { font-size: 12px; color: #6b7280; white-space: nowrap; }

  `;

  /* ══════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════ */

  function fmt12(h, min) {
    const ap = h < 12 ? 'AM' : 'PM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(min).padStart(2, '0')} ${ap}`;
  }

  function fmtDate(ev) {
    const M = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const d = new Date(ev.date + 'T00:00:00');
    return `${M[d.getMonth()+1]} ${d.getDate()}, ${d.getFullYear()} · ${fmt12(ev.startHour, ev.startMin)}`;
  }

  // Derive a display status by comparing event end-time to now.
  // Anything that already finished is "Completed", regardless of its declared status.
  function computeStatus(ev) {
    const start = new Date(`${ev.date}T${String(ev.startHour).padStart(2,'0')}:${String(ev.startMin).padStart(2,'0')}:00`);
    const end = new Date(start.getTime() + ev.duration * 60000);
    if (end.getTime() < Date.now()) return 'Completed';
    return ev.status;
  }

  // Calendar SVG icon (distinguishes event posts from article posts)
  const EVENT_SVG = `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" font-size="16">
    <path d="M19 3h-1V1h-2v2H8V1H6v2H5C3.9 2 3 2.9 3 4v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 18H5V8h14v13zm0-15H5V4h14v2zM7 10h4v4H7z" fill-rule="evenodd"/>
  </svg>`;

  // Air Canada maple-leaf glyph for the modal header
  const MAPLE_SVG = `<svg viewBox="0 0 24 24"><path d="M12 2L13.5 7L18 5.5L16 10L21 11L17 14L19 18L14 17L13 22L12 19L11 22L10 17L5 18L7 14L3 11L8 10L6 5.5L10.5 7L12 2Z"/></svg>`;

  // Audience-group icon (two people silhouette) — used for every audience row in the popup.
  const ICON_GROUP = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`;

  // Staffbase DS analytics icons (exact paths from native post popup)
  const ICON_CAMPAIGNS = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
    <path d="M24,9.495A2,2,0,0,0,22.67,7.622.5.5,0,0,0,22,8.093l.007,3.824a.5.5,0,0,0,.67.469A2,2,0,0,0,24,10.5Z"/>
    <path d="M20.5,3.5a1.492,1.492,0,0,0-.7-1.26c-.834-.53-1.469-.086-2.726.519A22.5,22.5,0,0,1,6.972,5.447a.5.5,0,0,0-.472.5v8.606h0a8.312,8.312,0,0,0,4.6,7.334,1,1,0,1,0,.888-1.792,6.288,6.288,0,0,1-3.48-5.421,21.913,21.913,0,0,1,8.55,2.47c1.376.647,1.938,1.035,2.756.5a1.494,1.494,0,0,0,.683-1.264Z"/>
    <path d="M5,6.017a.5.5,0,0,0-.5-.5l-1.013.008A3.505,3.505,0,0,0,0,9.042l.009,2a3.5,3.5,0,0,0,3.516,3.483H4.5a.5.5,0,0,0,.5-.5Z"/>
  </svg>`;
  const ICON_VIEW = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
    <path d="M23.432,10.524C20.787,7.614,16.4,4.538,12,4.6,7.6,4.537,3.213,7.615.568,10.524a2.21,2.21,0,0,0,0,2.948C3.182,16.351,7.507,19.4,11.839,19.4h.308c4.347,0,8.671-3.049,11.288-5.929A2.21,2.21,0,0,0,23.432,10.524ZM7.4,12A4.6,4.6,0,1,1,12,16.6,4.6,4.6,0,0,1,7.4,12ZM12,10a2,2,0,1,1-2,2A2,2,0,0,1,12,10Z"/>
  </svg>`;
  const ICON_USER = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
    <circle cx="12" cy="6.25" r="5.5"/>
    <path d="M12,13.25a9.511,9.511,0,0,0-9.5,9.5.5.5,0,0,0,.5.5H21a.5.5,0,0,0,.5-.5A9.511,9.511,0,0,0,12,13.25Z"/>
  </svg>`;
  const ICON_COMMENT = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
    <path d="M12,.836C5.383.836,0,5.31,0,10.811a9.01,9.01,0,0,0,3.057,6.658L.931,21.713a1,1,0,0,0,1.316,1.355l5.981-2.784a14.217,14.217,0,0,0,3.772.5c6.617,0,12-4.475,12-9.975S18.617.836,12,.836Zm0,17.95a12.176,12.176,0,0,1-3.562-.524,1,1,0,0,0-.714.05l-3.07,1.429a.25.25,0,0,1-.329-.339l.869-1.735a1,1,0,0,0-.269-1.228A7.214,7.214,0,0,1,2,10.811c0-4.4,4.486-7.975,10-7.975s10,3.577,10,7.975S17.514,18.786,12,18.786Z"/>
  </svg>`;
  const ICON_LIKE = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
    <path d="M23.87,12.247A3,3,0,0,0,21,8.373H16.1a1,1,0,0,1-1-1,1.01,1.01,0,0,1,.033-.256l.881-3.343a2.712,2.712,0,0,0-4.839-2.253L6.282,8.449a1,1,0,0,1-.818.424H3.409A1.5,1.5,0,0,0,2,7.873H.5a.5.5,0,0,0-.5.5v14a.5.5,0,0,0,.5.5H2a1.5,1.5,0,0,0,1.5-1.5v-.627c5.121,2.576,6.242,2.881,9.711,2.881.351,0,2.334-.02,3.054-.02,2.8,0,4.665-1.613,5.7-4.958l1.9-6.357A.087.087,0,0,1,23.87,12.247Zm-1.91-.593-.009.028-1.909,6.4c-.76,2.469-1.89,3.521-3.776,3.521-.728,0-1.367.007-1.94.013-4.175.046-4.587.046-10.551-2.975A.5.5,0,0,1,3.5,18.2V11.373a.5.5,0,0,1,.5-.5H5.464A3.005,3.005,0,0,0,7.916,9.6l4.889-6.927a.74.74,0,0,1,1.037-.134.823.823,0,0,1,.1.095.712.712,0,0,1,.135.627L13.2,6.607a3,3,0,0,0,2.9,3.766H21a1,1,0,0,1,1,1,.982.982,0,0,1-.04.28Z"/>
  </svg>`;

  /* ══════════════════════════════════════════════════
     FULLCALENDAR MEASUREMENT
     Uses getBoundingClientRect() so the time-axis table
     and day-column table offsets are correctly reconciled
     across different scroll/offset-parent contexts.
  ══════════════════════════════════════════════════ */

  function measureFC() {
    // Each slot row has TWO <td data-time> cells: fc-timegrid-slot-label (time axis)
    // and fc-timegrid-slot-lane (grid body). Query only the label column so
    // consecutive entries are actually one hour apart, not zero.
    const hourSlots = Array.from(
      document.querySelectorAll('td.fc-timegrid-slot-label[data-time]')
    ).filter(td => /^\d{2}:00:00$/.test(td.dataset.time));

    if (hourSlots.length < 2) return null;

    const s0 = hourSlots[0];
    const s1 = hourSlots[1];
    const r0 = s0.getBoundingClientRect();
    const r1 = s1.getBoundingClientRect();
    const pxPerHour = r1.top - r0.top;
    if (pxPerHour < 10) return null;

    const refHour = parseInt(s0.dataset.time.slice(0, 2), 10);

    return {
      pxPerHour,
      refSlotRect: r0,
      refHour,
      topPxInColumn(h, m, colFrame) {
        const colRect = colFrame.getBoundingClientRect();
        const evY = r0.top + ((h - refHour) * 60 + m) * pxPerHour / 60;
        return evY - colRect.top;
      },
      hPx(durationMin) { return Math.max(32, durationMin * pxPerHour / 60); },
    };
  }

  /* ══════════════════════════════════════════════════
     STYLES + PANEL
  ══════════════════════════════════════════════════ */

  function injectStyles() {
    if (document.getElementById('ac-cal-css')) return;
    const s = document.createElement('style');
    s.id = 'ac-cal-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function buildPanel() {
    if (document.getElementById('ac-detail-panel')) return;
    const bd = document.createElement('div');
    bd.id = 'ac-panel-backdrop';
    bd.addEventListener('click', closePanel);
    document.body.appendChild(bd);
    const p = document.createElement('div');
    p.id = 'ac-detail-panel';
    document.body.appendChild(p);
  }

  function openPanel(ev) {
    const panel = document.getElementById('ac-detail-panel');
    if (!panel) return;
    const status = computeStatus(ev);
    const isDone = status === 'Completed';
    const isPub  = status === 'Published';
    const badgeCls = isDone ? 'done' : (isPub ? 'pub' : 'sched');
    // Completed events show their (or filled-in) attendance stats; future events show zeros.
    const showStats = isDone || isPub;

    panel.innerHTML = `
      <div class="ac-pnl-hdr">
        <button class="ac-pnl-close" id="ac-pnl-x">✕</button>
        <div class="ac-pnl-hdr-icon">${MAPLE_SVG}</div>
        <div class="ac-pnl-hdr-comm">${ev.community}</div>
      </div>
      <div class="ac-pnl-body">
        <div class="ac-pnl-toprow">
          <span class="ac-badge ${badgeCls}">${status}</span>
          <button class="ac-pnl-kebab" id="ac-pnl-kebab" aria-label="More options" aria-haspopup="menu">
            <svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
          </button>
          <div class="ac-pnl-kebab-menu" id="ac-pnl-kebab-menu" role="menu">
            <a class="ac-pnl-kebab-item" href="${ev.editorUrl || EVENT_EDITOR_URL}" target="_blank" rel="noopener" role="menuitem">
              <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
              <span>Edit event</span>
            </a>
            <button class="ac-pnl-kebab-item ac-pnl-kebab-item--danger" id="ac-pnl-remove" role="menuitem">
              <svg viewBox="0 0 24 24"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
              <span>Remove from calendar</span>
            </button>
          </div>
        </div>
        <h2 class="ac-pnl-title">${ev.title}</h2>
        <p class="ac-pnl-date">${fmtDate(ev)}</p>
        <p class="ac-pnl-author">Created by <a>${ev.createdBy}</a></p>

        <div class="ac-div"></div>

        <div class="ac-two-col">
          <div class="ac-col">
            <p class="ac-sec">Audience</p>
            ${ev.audiences.map(a => `
              <div class="ac-row">
                <span class="ac-row-ic">${ICON_GROUP}</span>
                <span>${a}</span>
              </div>`).join('')}
          </div>
          <div class="ac-col">
            <p class="ac-sec">Notifications</p>
            ${ev.notifications.map(n => `
              <div class="ac-row"><span>${n}</span></div>`).join('')}
          </div>
        </div>

        <div class="ac-div"></div>

        <div class="ac-analytics">
          <div class="ac-analytics-row">
            <div class="ac-analytics-item">
              <div class="ac-analytics-icon">${ICON_CAMPAIGNS}</div>
              <div class="ac-analytics-label">
                <div class="ac-analytics-val">${showStats ? ev.stats.attendance : 0}</div>
                <div class="ac-analytics-name">Registered</div>
              </div>
            </div>
            <div class="ac-analytics-item">
              <div class="ac-analytics-icon">${ICON_VIEW}</div>
              <div class="ac-analytics-label">
                <div class="ac-analytics-val">${showStats ? ev.stats.unique : 0}</div>
                <div class="ac-analytics-name">Attended</div>
              </div>
            </div>
            <div class="ac-analytics-item">
              <div class="ac-analytics-icon">${ICON_USER}</div>
              <div class="ac-analytics-label">
                <div class="ac-analytics-val">${showStats ? ev.stats.watchTime : '—'}</div>
                <div class="ac-analytics-name">Watch Time</div>
              </div>
            </div>
          </div>
        </div>

      </div>`;

    panel.querySelector('#ac-pnl-x').addEventListener('click', closePanel);

    // Kebab menu wiring
    const kebabBtn  = panel.querySelector('#ac-pnl-kebab');
    const kebabMenu = panel.querySelector('#ac-pnl-kebab-menu');
    kebabBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      kebabMenu.classList.toggle('open');
    });
    panel.addEventListener('click', (e) => {
      if (!e.target.closest('#ac-pnl-kebab') && !e.target.closest('#ac-pnl-kebab-menu')) {
        kebabMenu.classList.remove('open');
      }
    });
    panel.querySelector('#ac-pnl-remove').addEventListener('click', () => {
      removedIds.add(ev.id);
      persistRemoved();
      document.querySelector(`[data-ac-id="${ev.id}"]`)?.remove();
      injectedCards = injectedCards.filter(c => c.dataset.acId !== ev.id);
      closePanel();
    });

    requestAnimationFrame(() => {
      panel.classList.add('open');
      document.getElementById('ac-panel-backdrop')?.classList.add('open');
    });
  }

  function closePanel() {
    document.getElementById('ac-detail-panel')?.classList.remove('open');
    document.getElementById('ac-panel-backdrop')?.classList.remove('open');
  }

  /* ══════════════════════════════════════════════════
     INJECT CARDS
     Injects into .fc-timegrid-col-frame (stable across
     FC re-renders) using position:absolute + top/height.
  ══════════════════════════════════════════════════ */

  let injectedCards = [];

  function clearCards() {
    injectedCards.forEach(c => c.remove());
    injectedCards = [];
  }

  function calendarReady() {
    // Sentinel: at least one of our event dates must be in the DOM.
    return allEvents().some(ev => document.querySelector(`td[data-date="${ev.date}"]`));
  }

  function injectCards() {
    if (!calendarReady()) return false;

    const m = measureFC();
    if (!m) return false;

    allEvents().forEach(ev => {
      if (removedIds.has(ev.id)) return;
      if (document.querySelector(`[data-ac-id="${ev.id}"]`)) return;

      const colFrame = document.querySelector(
        `td[data-date="${ev.date}"] .fc-timegrid-col-frame`
      );
      if (!colFrame) return;

      const topPx    = m.topPxInColumn(ev.startHour, ev.startMin, colFrame);
      const heightPx = m.hPx(ev.duration);

      const harness = document.createElement('div');
      harness.className = 'fc-timegrid-event-harness';
      harness.dataset.acId = ev.id;
      // Inject into col-frame (not col-events) so FC re-renders don't wipe our cards.
      // Use top+height instead of inset to avoid cross-container offset maths.
      harness.style.cssText = `
        position:absolute; top:${topPx}px; height:${heightPx}px;
        left:2%; right:2%; z-index:10; pointer-events:auto;
      `;

      const status = computeStatus(ev);
      const isPub  = status === 'Published';
      const isDone = status === 'Completed';
      // Palette: AC red (published) · amber (scheduled) · gray (completed)
      const bgColor     = isDone ? '#f3f4f6' : (isPub ? '#fef2f2' : '#fef9c3');
      const borderColor = isDone ? '#9ca3af' : (isPub ? '#D82F2F' : '#ca8a04');
      const titleColor  = isDone ? '#374151' : (isPub ? '#7f1d1d' : '#713f12');
      const metaColor   = isDone ? '#6b7280' : (isPub ? '#b91c1c' : '#92400e');
      const iconColor   = isDone ? '#9ca3af' : (isPub ? '#D82F2F' : '#ca8a04');

      harness.innerHTML = `
        <a class="fc-event fc-event-start fc-event-end fc-timegrid-event fc-v-event"
           style="cursor:pointer;display:block;height:100%;" data-ac-id="${ev.id}">
          <div class="fc-event-main" style="height:100%;">
            <button class="block w-full border border-solid border-transparent h-full rounded-8"
                    type="button" style="height:100%;">
              <span class="event-content-weekly flex h-full flex-col items-start rounded-8
                           px-[6px] py-[10px] gap-8 overflow-hidden hover:cursor-pointer"
                    style="background:${bgColor};border-left:3px solid ${borderColor};height:100%;">
                <span class="event-title-weekly w-full overflow-hidden text-left text-12
                             leading-16 font-medium text-ellipsis whitespace-nowrap"
                      style="color:${titleColor};"
                      title="${ev.title}">${ev.title}</span>
                <span class="event-status-weekly flex w-full justify-between gap-2 overflow-hidden"
                      style="color:${metaColor};">
                  <span class="overflow-hidden text-12 font-medium text-ellipsis whitespace-nowrap capitalize">
                    ${fmt12(ev.startHour, ev.startMin)}<span class="mx-2">·</span>${status}
                  </span>
                  <span class="shrink-0" style="color:${iconColor};">${EVENT_SVG}</span>
                </span>
              </span>
            </button>
          </div>
        </a>`;

      harness.querySelector('a').addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        openPanel(ev);
      });

      colFrame.appendChild(harness);
      injectedCards.push(harness);
    });

    return injectedCards.length > 0;
  }

  /* ══════════════════════════════════════════════════
     CREATE-MENU INJECTION ("Event" option)
     The "Create" dropdown is a Floating UI menu (.ds-action-menu)
     that mounts/unmounts on open/close. We observe document.body
     and append our menuitem whenever a fresh menu appears.
  ══════════════════════════════════════════════════ */

  function injectCreateMenuItem(menu) {
    if (!menu || menu.querySelector('[data-ac-create-event]')) return;
    // Only target the Planning create menu (which contains Post + Blocker).
    const labels = Array.from(menu.querySelectorAll('.ds-action-menu__item-label'))
      .map(s => s.textContent.trim());
    if (!labels.includes('Post') || !labels.includes('Blocker')) return;

    const link = document.createElement('a');
    link.setAttribute('role', 'menuitem');
    link.className = 'ds-action-menu__item ds-action-menu__item--default ds-action-menu__link-item';
    link.href = EVENT_EDITOR_URL;
    link.target = '_blank';
    link.rel = 'noopener';
    link.tabIndex = -1;
    link.setAttribute('data-ac-create-event', 'true');
    link.innerHTML = `<span class="ds-action-menu__item-label">Event</span>`;

    // Insert before Blocker so order becomes: Post, Email, Event, Blocker.
    const blockerEl = Array.from(menu.children).find(el =>
      el.querySelector?.('.ds-action-menu__item-label')?.textContent.trim() === 'Blocker'
    );
    if (blockerEl) menu.insertBefore(link, blockerEl);
    else menu.appendChild(link);
  }

  let _createMenuObs = null;
  function startCreateMenuObserver() {
    if (_createMenuObs) return;
    _createMenuObs = new MutationObserver(muts => {
      for (const m of muts) {
        for (const node of m.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.classList?.contains('ds-action-menu')) injectCreateMenuItem(node);
          node.querySelectorAll?.('.ds-action-menu').forEach(injectCreateMenuItem);
        }
      }
    });
    _createMenuObs.observe(document.body, { childList: true, subtree: true });
    // Handle a menu that's already open at script load time.
    document.querySelectorAll('.ds-action-menu').forEach(injectCreateMenuItem);
  }

  /* ══════════════════════════════════════════════════
     COMPANY-EVENT CAPTURE
     Hooks fetch + XHR to intercept the POST/PUT that
     creates a Staffbase company-event and stores its
     details into userEvents[] so the planning calendar
     can render the freshly-created event.
     Also scrapes the /overview page as a fallback.
  ══════════════════════════════════════════════════ */

  function looksLikeEventEndpoint(url) {
    return typeof url === 'string' && /company-event|companyEvent|\/events?(\b|\/)/i.test(url);
  }

  // Pull useful fields out of varied Staffbase response shapes.
  function extractEventFields(data) {
    if (!data || typeof data !== 'object') return null;
    // Some endpoints wrap in {data: {...}} or {event: {...}}.
    const candidates = [data, data.data, data.event, data.result].filter(Boolean);
    for (const c of candidates) {
      const id = c.id || c._id || c.eventId;
      const title = c.title || c.name || c.displayName;
      const start = c.startDate || c.startTime || c.start || c.scheduledStart;
      if (id && title && start) return {
        id: String(id),
        title: String(title),
        start,
        end: c.endDate || c.endTime || c.end || c.scheduledEnd,
        description: c.shortDescription || c.description,
        moderators: c.moderators,
        audiences: c.targetAudience || c.userGroups || c.audiences,
      };
    }
    return null;
  }

  function captureFromApi(raw) {
    const f = extractEventFields(raw);
    if (!f) return false;

    const startDate = new Date(f.start);
    if (isNaN(startDate.getTime())) return false;
    const endDate = f.end ? new Date(f.end) : new Date(startDate.getTime() + 60 * 60 * 1000);
    const durationMin = Math.max(30, Math.round((endDate - startDate) / 60000));

    const audienceList = Array.isArray(f.audiences) ? f.audiences.map(a =>
      typeof a === 'string' ? a : (a.name || a.title || a.displayName || 'Group')
    ) : ['Company Event'];

    const ev = {
      id: `user-${f.id}`,
      title: f.title,
      date: startDate.toISOString().slice(0, 10),
      startHour: startDate.getHours(),
      startMin: startDate.getMinutes(),
      duration: durationMin,
      status: 'Scheduled',
      community: audienceList[0] || 'Company Event',
      audiences: audienceList.length ? audienceList : ['Live Broadcast'],
      notifications: ['Push', 'Email'],
      createdBy: 'You',
      stats: { attendance: 0, watchTime: '—', unique: 0, comments: 0, likes: 0 },
      breakdown: [],
      userCreated: true,
      editorUrl: `https://app.staffbase.com/studio/content/company-event/${f.id}/overview`,
    };

    const existing = userEvents.findIndex(e => e.id === ev.id);
    if (existing >= 0) userEvents[existing] = ev;
    else userEvents.push(ev);
    persistUserEvents();

    // If user is on the planning page right now, paint it in.
    if (location.href.includes('/studio/planning')) setTimeout(injectCards, 100);
    return true;
  }

  function hookFetch() {
    if (window.fetch.__acHooked) return;
    const orig = window.fetch.bind(window);
    const wrapped = async function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const method = ((init && init.method) || (typeof input === 'object' && input.method) || 'GET').toUpperCase();
      const resp = await orig(input, init);
      try {
        if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && looksLikeEventEndpoint(url)) {
          resp.clone().json().then(captureFromApi).catch(() => {});
        }
      } catch (_) {}
      return resp;
    };
    wrapped.__acHooked = true;
    window.fetch = wrapped;
  }

  function hookXHR() {
    if (XMLHttpRequest.prototype.__acHooked) return;
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__acMethod = method;
      this.__acUrl = url;
      return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      this.addEventListener('load', () => {
        try {
          const m = (this.__acMethod || '').toUpperCase();
          if ((m === 'POST' || m === 'PUT' || m === 'PATCH') && looksLikeEventEndpoint(this.__acUrl)) {
            const data = JSON.parse(this.responseText);
            captureFromApi(data);
          }
        } catch (_) {}
      });
      return origSend.apply(this, arguments);
    };
    XMLHttpRequest.prototype.__acHooked = true;
  }

  // Fallback: scrape the overview page when the user lands on a freshly
  // created event. The URL pattern is /studio/content/company-event/{id}/overview.
  function maybeScrapeOverview() {
    const m = location.href.match(/\/studio\/content\/company-event\/([0-9a-f]{16,})\/overview/i);
    if (!m) return;
    const id = m[1];
    const userId = `user-${id}`;
    if (userEvents.some(e => e.id === userId)) return;

    let tries = 0;
    const poll = setInterval(() => {
      tries++;
      const h1 = document.querySelector('h1, [class*="title"]');
      const title = h1 && h1.textContent.trim();
      // Grab a date line like "May 15 at 9:00 AM - May 15 at 10:00 AM".
      const dateLine = Array.from(document.querySelectorAll('p, span, div'))
        .map(el => el.textContent.trim())
        .find(t => /\b\d{1,2}:\d{2}\s*(AM|PM)\b/i.test(t) && /[A-Z][a-z]{2}\s+\d{1,2}/.test(t));

      if (title && dateLine) {
        clearInterval(poll);
        const parsed = parseOverviewDateLine(dateLine);
        if (!parsed) return;
        const ev = {
          id: userId,
          title,
          date: parsed.date,
          startHour: parsed.startHour,
          startMin: parsed.startMin,
          duration: parsed.duration,
          status: 'Scheduled',
          community: 'Company Event',
          audiences: ['Live Broadcast'],
          notifications: ['Push', 'Email'],
          createdBy: 'You',
          stats: { attendance: 0, watchTime: '—', unique: 0, comments: 0, likes: 0 },
          breakdown: [],
          userCreated: true,
          editorUrl: location.href,
        };
        userEvents.push(ev);
        persistUserEvents();
      }
      if (tries > 40) clearInterval(poll); // ~12s cap
    }, 300);
  }

  function parseOverviewDateLine(line) {
    // e.g. "May 15 at 9:00 AM - May 15 at 10:00 AM"
    const MONTHS = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12 };
    const re = /([A-Z][a-z]{2})\s+(\d{1,2})\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)\s*[-–—]\s*([A-Z][a-z]{2})\s+(\d{1,2})\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i;
    const m = line.match(re);
    if (!m) return null;
    const year = new Date().getFullYear();
    const toMins = (h, mi, ap) => {
      let H = parseInt(h, 10) % 12;
      if (/PM/i.test(ap)) H += 12;
      return H * 60 + parseInt(mi, 10);
    };
    const sm = toMins(m[3], m[4], m[5]);
    const em = toMins(m[8], m[9], m[10]);
    const startMon = MONTHS[m[1]], startDay = parseInt(m[2], 10);
    return {
      date: `${year}-${String(startMon).padStart(2,'0')}-${String(startDay).padStart(2,'0')}`,
      startHour: Math.floor(sm / 60),
      startMin: sm % 60,
      duration: Math.max(30, em - sm),
    };
  }

  /* ══════════════════════════════════════════════════
     INIT + SPA WATCHER
  ══════════════════════════════════════════════════ */

  let _reinjectObs = null;

  function startReinjectObserver() {
    _reinjectObs?.disconnect();
    _reinjectObs = new MutationObserver(() => {
      if (!calendarReady()) return;
      const missing = allEvents().some(ev =>
        !removedIds.has(ev.id) &&
        document.querySelector(`td[data-date="${ev.date}"]`) &&
        !document.querySelector(`[data-ac-id="${ev.id}"]`)
      );
      if (missing) injectCards();
    });
    _reinjectObs.observe(document.body, { childList: true, subtree: true });
  }

  let _initPoll = null;

  /* ══════════════════════════════════════════════════
     DEMO RESET HOTKEY (⌘+⇧+0 / Ctrl+Shift+0)
     Wipes captured + removed event state and reloads.
     Surfaces a quick toast so the action is visible on camera.
  ══════════════════════════════════════════════════ */

  function resetDemoState() {
    localStorage.removeItem(USER_EVENTS_KEY);
    localStorage.removeItem(REMOVED_KEY);

    const toast = document.createElement('div');
    toast.textContent = 'Demo state reset — reloading…';
    toast.style.cssText = `
      position: fixed; top: 24px; left: 50%; transform: translateX(-50%);
      background: #1a1a1a; color: #fff; padding: 12px 22px;
      border-radius: 10px; font: 600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      box-shadow: 0 8px 24px rgba(0,0,0,.25); z-index: 99999;
    `;
    document.body.appendChild(toast);
    setTimeout(() => location.reload(), 650);
  }

  function hookResetHotkey() {
    if (window.__acResetHooked) return;
    window.__acResetHooked = true;
    window.addEventListener('keydown', (e) => {
      // Cmd+Shift+0 on macOS or Ctrl+Shift+0 elsewhere.
      // Use e.code so Shift+0 (which is ")") still matches.
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'Digit0') {
        e.preventDefault();
        resetDemoState();
      }
    }, true);
  }

  function init() {
    // These run on ANY /studio/* page so we capture events even when
    // the user is in the creation flow, not just on planning.
    hookFetch();
    hookXHR();
    hookResetHotkey();
    maybeScrapeOverview();

    if (!window.location.href.includes('/studio/planning')) return;
    injectStyles();
    buildPanel();
    startCreateMenuObserver();
    clearCards();
    _reinjectObs?.disconnect();
    clearInterval(_initPoll);

    if (injectCards()) { startReinjectObserver(); return; }

    // FullCalendar renders asynchronously — poll every 300ms rather than
    // counting mutations (React fires far more mutations than any safe limit).
    _initPoll = setInterval(() => {
      if (injectCards()) {
        clearInterval(_initPoll);
        startReinjectObserver();
      }
    }, 300);
    // Stop trying after 30 seconds
    setTimeout(() => clearInterval(_initPoll), 30000);
  }

  function onStudioNav() {
    if (window.location.href.includes('/studio/')) setTimeout(init, 500);
  }
  const _push = history.pushState.bind(history);
  history.pushState = function (...args) {
    _push(...args);
    onStudioNav();
  };
  window.addEventListener('popstate', onStudioNav);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
