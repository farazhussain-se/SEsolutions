// ==UserScript==
// @name         Staffbase Planning — ERG Events (Cummins)
// @namespace    https://cumminsergdm.staffbase.rocks/
// @version      1.0.4
// @description  Injects ERG event cards into the Staffbase Editorial Calendar for the Cummins demo
// @author       Faraz Hussein · Staffbase SE Solutions
// @match        https://cumminsergdm.staffbase.rocks/studio/planning*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  /* ══════════════════════════════════════════════════
     DATA
  ══════════════════════════════════════════════════ */

  const ERG_EVENTS = [
    {
      id: 'erg-e1',
      title: 'CBN National Kickoff — Spring 2026',
      date: '2026-04-27',
      startHour: 10, startMin: 0, duration: 90,
      status: 'Published',
      community: 'Cummins Black Network',
      audiences: ['ERG Space', 'Cummins Black Network'],
      notifications: ['Push', 'Email'],
      createdBy: 'Teejay Monoh',
      stats: { attendance: 142, watchTime: '18 min avg', unique: 138, comments: 23, likes: 67 },
      breakdown: [
        { label: 'Indiana',        pct: 38 },
        { label: 'Texas',          pct: 24 },
        { label: 'South Carolina', pct: 18 },
        { label: 'Ohio',           pct: 12 },
        { label: 'Other',          pct:  8 },
      ],
    },
    {
      id: 'erg-e2',
      title: 'Indiana Chapter Networking Night',
      date: '2026-04-28',
      startHour: 17, startMin: 0, duration: 60,
      status: 'Published',
      community: 'Indiana CBN ERG',
      audiences: ['ERG Space', 'Indiana CBN ERG'],
      notifications: ['Push'],
      createdBy: 'Rachel Quisenberry',
      stats: { attendance: 34, watchTime: '45 min avg', unique: 32, comments: 8, likes: 21 },
      breakdown: [
        { label: 'Indianapolis', pct: 52 },
        { label: 'Columbus',     pct: 28 },
        { label: 'Elkhart',      pct: 12 },
        { label: 'Seymour',      pct:  8 },
      ],
    },
    {
      id: 'erg-e3',
      title: 'CBN Leadership & Mentorship Workshop',
      date: '2026-04-29',
      startHour: 11, startMin: 0, duration: 120,
      status: 'Published',
      community: 'Cummins Black Network Leaders',
      audiences: ['ERG Space', 'CBN Leaders Community'],
      notifications: ['Push', 'Email'],
      createdBy: 'Angelia Nowell',
      stats: { attendance: 28, watchTime: '72 min avg', unique: 26, comments: 14, likes: 34 },
      breakdown: [
        { label: 'National Leads', pct: 45 },
        { label: 'Chapter Leads',  pct: 35 },
        { label: 'Regional Leads', pct: 20 },
      ],
    },
    {
      id: 'erg-e4',
      title: 'Make Your Mark: ERG Career Forum',
      date: '2026-05-01',
      startHour: 14, startMin: 0, duration: 90,
      status: 'Scheduled',
      community: 'Cummins Black Network',
      audiences: ['ERG Space', 'All CBN Communities'],
      notifications: ['Push', 'Email'],
      createdBy: 'Teejay Monoh',
      stats: { attendance: 0, watchTime: '—', unique: 0, comments: 0, likes: 0 },
      breakdown: [],
    },
    {
      id: 'erg-e5',
      title: 'Charleston Chapter Monthly Sync',
      date: '2026-05-02',
      startHour: 10, startMin: 0, duration: 60,
      status: 'Scheduled',
      community: 'Charleston CBN ERG',
      audiences: ['ERG Space', 'Charleston CBN ERG'],
      notifications: ['Push'],
      createdBy: 'Rachel Quisenberry',
      stats: { attendance: 0, watchTime: '—', unique: 0, comments: 0, likes: 0 },
      breakdown: [],
    },
  ];

  /* ══════════════════════════════════════════════════
     CSS  (detail panel only — cards use FC's own classes)
  ══════════════════════════════════════════════════ */

  const CSS = `
    /* ── Backdrop ── */
    #erg-panel-backdrop {
      display: none; position: fixed; inset: 0;
      background: rgba(0,0,0,0.45); z-index: 9998;
    }
    #erg-panel-backdrop.open { display: block; }

    /* ── Modal (centered, matches native Staffbase post popup) ── */
    #erg-detail-panel {
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
    #erg-detail-panel.open {
      opacity: 1; pointer-events: auto;
      transform: translate(-50%, -50%);
    }
    #erg-detail-panel * { box-sizing: border-box; }

    /* ── Header image area ── */
    .erg-pnl-hdr {
      width: 100%; height: 180px; position: relative; flex-shrink: 0;
      background: linear-gradient(145deg, #1e3a5f 0%, #0c4a6e 45%, #0369a1 100%);
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 10px; border-radius: 12px 12px 0 0;
      overflow: hidden;
    }
    .erg-pnl-hdr::before {
      content: ''; position: absolute; inset: 0;
      background: radial-gradient(ellipse at 70% 30%, rgba(255,255,255,0.08) 0%, transparent 60%);
    }
    .erg-pnl-hdr-icon { font-size: 40px; position: relative; }
    .erg-pnl-hdr-comm {
      font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.9);
      text-align: center; padding: 0 52px; line-height: 1.35; position: relative;
    }
    .erg-pnl-close {
      position: absolute; top: 10px; right: 10px;
      width: 28px; height: 28px; border-radius: 50%;
      background: rgba(0,0,0,0.35); border: none;
      color: #fff; font-size: 13px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      line-height: 1; z-index: 1;
    }
    .erg-pnl-close:hover { background: rgba(0,0,0,0.55); }

    /* ── Body ── */
    .erg-pnl-body { padding: 18px 20px 24px; }

    .erg-badge {
      display: inline-block; font-size: 12px; font-weight: 600;
      padding: 3px 10px; border-radius: 999px; margin-bottom: 10px;
    }
    .erg-badge.pub   { background: #dcfce7; color: #166534; }
    .erg-badge.sched { background: #fef9c3; color: #92400e; }

    .erg-pnl-title {
      font-size: 18px; font-weight: 700; color: #111827;
      margin: 0 0 6px; line-height: 1.3;
    }
    .erg-pnl-date   { font-size: 13px; color: #6b7280; margin: 0 0 2px; }
    .erg-pnl-author { font-size: 13px; color: #6b7280; margin: 0; }
    .erg-pnl-author a { color: #2563eb; text-decoration: underline; cursor: default; }

    /* ── Divider ── */
    .erg-div { height: 1px; background: #e5e7eb; margin: 14px 0; }

    /* ── Two-column audience + notifications ── */
    .erg-two-col {
      display: grid; grid-template-columns: 1fr 1fr; gap: 0;
    }
    .erg-col { padding-right: 16px; }
    .erg-col:last-child { padding-right: 0; padding-left: 16px; border-left: 1px solid #e5e7eb; }

    .erg-sec {
      font-size: 11px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.06em; color: #9ca3af; margin-bottom: 8px;
    }
    .erg-row {
      display: flex; align-items: center; gap: 8px;
      font-size: 13px; color: #374151; margin-bottom: 6px;
    }
    .erg-row-ic { font-size: 15px; flex-shrink: 0; }

    /* ── Analytics rows (native Staffbase icon + value + label pattern) ── */
    .erg-analytics { padding: 2px 0 0; }
    .erg-analytics-row { display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap; }
    .erg-analytics-row:last-child { margin-bottom: 0; }
    .erg-analytics-item { display: flex; align-items: center; }
    .erg-analytics-icon {
      width: 32px; height: 32px; border-radius: 50%;
      background: #f3f4f6; display: flex; align-items: center;
      justify-content: center; flex-shrink: 0; color: #6b7280;
    }
    .erg-analytics-icon svg { width: 16px; height: 16px; fill: currentColor; }
    .erg-analytics-label { margin-left: 8px; }
    .erg-analytics-val { font-size: 14px; font-weight: 600; color: #111827; line-height: 1.2; white-space: nowrap; }
    .erg-analytics-name { font-size: 12px; color: #6b7280; white-space: nowrap; }

    /* ── Watch time + breakdown (published only, above stats strip) ── */
    .erg-watch {
      display: flex; align-items: center; gap: 12px;
      background: #eff6ff; border: 1px solid #dbeafe;
      border-radius: 8px; padding: 11px 14px; margin-bottom: 14px;
    }
    .erg-watch-val { font-size: 17px; font-weight: 700; color: #1d4ed8; }
    .erg-watch-lbl { font-size: 11px; color: #6b7280; }

    .erg-br { margin-bottom: 8px; }
    .erg-br-lrow {
      display: flex; justify-content: space-between;
      font-size: 12px; color: #374151; margin-bottom: 3px;
    }
    .erg-br-track { height: 6px; border-radius: 999px; background: #f3f4f6; overflow: hidden; }
    .erg-br-fill  { height: 100%; border-radius: 999px; background: #3b82f6; }
    .erg-br-sec   { font-size: 11px; font-weight: 700; text-transform: uppercase;
                    letter-spacing: 0.06em; color: #9ca3af; margin: 12px 0 8px; }
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
    return `${M[d.getMonth()+1]} ${d.getDate()}, 2026 · ${fmt12(ev.startHour, ev.startMin)}`;
  }

  // Calendar SVG icon (distinguishes event posts from article posts)
  const EVENT_SVG = `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" font-size="16">
    <path d="M19 3h-1V1h-2v2H8V1H6v2H5C3.9 2 3 2.9 3 4v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 18H5V8h14v13zm0-15H5V4h14v2zM7 10h4v4H7z" fill-rule="evenodd"/>
  </svg>`;

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
      // topPxInColumn: pixels from the top of colFrame to the given time.
      // Uses viewport coords so the cross-table offset is always correct.
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
    if (document.getElementById('erg-cal-css')) return;
    const s = document.createElement('style');
    s.id = 'erg-cal-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function buildPanel() {
    if (document.getElementById('erg-detail-panel')) return;
    const bd = document.createElement('div');
    bd.id = 'erg-panel-backdrop';
    bd.addEventListener('click', closePanel);
    document.body.appendChild(bd);
    const p = document.createElement('div');
    p.id = 'erg-detail-panel';
    document.body.appendChild(p);
  }

  function openPanel(ev) {
    const panel = document.getElementById('erg-detail-panel');
    if (!panel) return;
    const pub = ev.status === 'Published';

    panel.innerHTML = `
      <div class="erg-pnl-hdr">
        <button class="erg-pnl-close" id="erg-pnl-x">✕</button>
        <div class="erg-pnl-hdr-icon">📅</div>
        <div class="erg-pnl-hdr-comm">${ev.community}</div>
      </div>
      <div class="erg-pnl-body">
        <span class="erg-badge ${pub ? 'pub' : 'sched'}">${ev.status}</span>
        <h2 class="erg-pnl-title">${ev.title}</h2>
        <p class="erg-pnl-date">${fmtDate(ev)}</p>
        <p class="erg-pnl-author">Created by <a>${ev.createdBy}</a></p>

        <div class="erg-div"></div>

        <div class="erg-two-col">
          <div class="erg-col">
            <p class="erg-sec">Audience</p>
            ${ev.audiences.map(a => `
              <div class="erg-row">
                <span class="erg-row-ic">${a.includes('Space') ? '⊞' : '▦'}</span>
                <span>${a}</span>
              </div>`).join('')}
          </div>
          <div class="erg-col">
            <p class="erg-sec">Notifications</p>
            ${ev.notifications.map(n => `
              <div class="erg-row">
                <span class="erg-row-ic">${n === 'Push' ? '📱' : '✉️'}</span>
                <span>${n}</span>
              </div>`).join('')}
          </div>
        </div>

        <div class="erg-div"></div>

        <div class="erg-analytics">
          <div class="erg-analytics-row">
            <div class="erg-analytics-item">
              <div class="erg-analytics-icon">${ICON_CAMPAIGNS}</div>
              <div class="erg-analytics-label">
                <div class="erg-analytics-val">${pub ? ev.stats.attendance : 0}</div>
                <div class="erg-analytics-name">Attendance</div>
              </div>
            </div>
            <div class="erg-analytics-item">
              <div class="erg-analytics-icon">${ICON_VIEW}</div>
              <div class="erg-analytics-label">
                <div class="erg-analytics-val">${pub ? ev.stats.unique : 0}</div>
                <div class="erg-analytics-name">Unique Attendees</div>
              </div>
            </div>
            <div class="erg-analytics-item">
              <div class="erg-analytics-icon">${ICON_USER}</div>
              <div class="erg-analytics-label">
                <div class="erg-analytics-val">${pub ? ev.stats.watchTime : '—'}</div>
                <div class="erg-analytics-name">Avg Watch Time</div>
              </div>
            </div>
          </div>
          <div class="erg-analytics-row">
            <div class="erg-analytics-item">
              <div class="erg-analytics-icon">${ICON_COMMENT}</div>
              <div class="erg-analytics-label">
                <div class="erg-analytics-val">${pub ? ev.stats.comments : 0}</div>
                <div class="erg-analytics-name">Comments</div>
              </div>
            </div>
            <div class="erg-analytics-item">
              <div class="erg-analytics-icon">${ICON_LIKE}</div>
              <div class="erg-analytics-label">
                <div class="erg-analytics-val">${pub ? ev.stats.likes : 0}</div>
                <div class="erg-analytics-name">Likes</div>
              </div>
            </div>
          </div>
        </div>

        ${pub && ev.breakdown.length ? `
          <div class="erg-div"></div>
          <div class="erg-watch">
            <div class="erg-analytics-icon" style="margin-right:10px">${ICON_VIEW}</div>
            <div>
              <div class="erg-watch-val">${ev.stats.watchTime}</div>
              <div class="erg-watch-lbl">Average Watch Time</div>
            </div>
          </div>
          <p class="erg-br-sec">Audience Breakdown</p>
          ${ev.breakdown.map(b => `
            <div class="erg-br">
              <div class="erg-br-lrow"><span>${b.label}</span><span>${b.pct}%</span></div>
              <div class="erg-br-track"><div class="erg-br-fill" style="width:${b.pct}%"></div></div>
            </div>`).join('')}
        ` : ''}
      </div>`;

    panel.querySelector('#erg-pnl-x').addEventListener('click', closePanel);
    requestAnimationFrame(() => {
      panel.classList.add('open');
      document.getElementById('erg-panel-backdrop')?.classList.add('open');
    });
  }

  function closePanel() {
    document.getElementById('erg-detail-panel')?.classList.remove('open');
    document.getElementById('erg-panel-backdrop')?.classList.remove('open');
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

  function injectCards() {
    if (!document.querySelector('td[data-date="2026-04-27"]')) return false;

    const m = measureFC();
    if (!m) return false;

    ERG_EVENTS.forEach(ev => {
      if (document.querySelector(`[data-erg-id="${ev.id}"]`)) return;

      const colFrame = document.querySelector(
        `td[data-date="${ev.date}"] .fc-timegrid-col-frame`
      );
      if (!colFrame) return;

      const topPx    = m.topPxInColumn(ev.startHour, ev.startMin, colFrame);
      const heightPx = m.hPx(ev.duration);

      const harness = document.createElement('div');
      harness.className = 'fc-timegrid-event-harness';
      harness.dataset.ergId = ev.id;
      // Inject into col-frame (not col-events) so FC re-renders don't wipe our cards.
      // Use top+height instead of inset to avoid cross-container offset maths.
      harness.style.cssText = `
        position:absolute; top:${topPx}px; height:${heightPx}px;
        left:2%; right:2%; z-index:10; pointer-events:auto;
      `;

      const isPub = ev.status === 'Published';
      const bgColor     = isPub ? '#e0f2fe' : '#fef9c3';
      const borderColor = isPub ? '#0284c7' : '#ca8a04';
      const titleColor  = isPub ? '#0c4a6e' : '#713f12';
      const metaColor   = isPub ? '#0369a1' : '#92400e';
      const iconColor   = isPub ? '#0284c7' : '#ca8a04';

      harness.innerHTML = `
        <a class="fc-event fc-event-start fc-event-end fc-timegrid-event fc-v-event"
           style="cursor:pointer;display:block;height:100%;" data-erg-id="${ev.id}">
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
                    ${fmt12(ev.startHour, ev.startMin)}<span class="mx-2">·</span>${ev.status}
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
     INIT + SPA WATCHER
  ══════════════════════════════════════════════════ */

  let _reinjectObs = null;

  function startReinjectObserver() {
    _reinjectObs?.disconnect();
    _reinjectObs = new MutationObserver(() => {
      if (!document.querySelector('td[data-date="2026-04-27"]')) return;
      const missing = ERG_EVENTS.some(ev => !document.querySelector(`[data-erg-id="${ev.id}"]`));
      if (missing) injectCards();
    });
    _reinjectObs.observe(document.body, { childList: true, subtree: true });
  }

  let _initPoll = null;

  function init() {
    if (!window.location.href.includes('/studio/planning')) return;
    injectStyles();
    buildPanel();
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

  const _push = history.pushState.bind(history);
  history.pushState = function (...args) {
    _push(...args);
    if (window.location.href.includes('/studio/planning')) setTimeout(init, 500);
  };
  window.addEventListener('popstate', () => {
    if (window.location.href.includes('/studio/planning')) setTimeout(init, 500);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
