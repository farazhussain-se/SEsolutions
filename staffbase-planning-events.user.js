// ==UserScript==
// @name         Planning — Custom Event Cards
// @namespace    https://staffbase.github.io/solutions-monorepo/global-js/planning-events
// @version      0.1.0
// @description  Adds custom event cards to the Studio Planning week grid + "Event" entry in the Create dropdown + auto-capture of newly created company-events (demo).
// @author       Staffbase Solutions Engineering
// @match        https://*.staffbase.com/studio/*
// @match        https://app.staffbase.com/studio/*
// @run-at       document-idle
// @grant        none
// @noframes
// @updateURL    https://staffbase.github.io/solutions-monorepo/global-js/dist/planning-events.user.js
// @downloadURL  https://staffbase.github.io/solutions-monorepo/global-js/dist/planning-events.user.js
// ==/UserScript==

// @sb-customization
// @slug         planning-events
// @name         Planning — Custom Event Cards
// @description  Adds custom event cards to the Studio Planning week grid + "Event" entry in the Create dropdown + auto-capture of newly created company-events (demo).
// @target       studio
// @match        https://*.staffbase.com/studio/*
// @match        https://app.staffbase.com/studio/*
// @version      0.1.0
// @author       Staffbase Solutions Engineering

(function () {
    'use strict';

    const SLUG = 'planning-events';
    const FLAG = '__sb_' + SLUG.replace(/-/g, '_') + '_loaded';
    if (window[FLAG]) return;
    window[FLAG] = true;

    /* ──────────────────────────────────────────────────────────────────
       CONFIG — edit these to fit the demo
       ────────────────────────────────────────────────────────────────── */
    const BRAND     = '#1f6feb';
    const BRAND_DK  = '#1858c4';
    const EVENT_EDITOR_URL = 'https://app.staffbase.com/studio/content/company-event/scheduled';
    const USER_EVENTS_KEY    = 'sb_planning_events_user_events';
    const REMOVED_EVENTS_KEY = 'sb_planning_events_removed_events';

    /* Seed events. First event's date doubles as the "calendar rendered" sentinel.
       Replace these with your prospect's demo data — never with real customer data. */
    const SEED_EVENTS = [
        {
            id: 'seed-e1',
            title: 'Quarterly Town Hall',
            date: '2026-06-12',
            startHour: 10, startMin: 0, duration: 60,
            status: 'Published',
            community: 'All Employees',
            audiences: ['Company-Wide', 'Leadership'],
            notifications: ['Push', 'Email'],
            createdBy: 'Internal Comms',
            stats: { attendance: 1240, watchTime: '52 min avg', unique: 1180, comments: 64, likes: 318 },
            breakdown: [
                { label: 'HQ',     pct: 45 },
                { label: 'Remote', pct: 35 },
                { label: 'Field',  pct: 20 },
            ],
        },
    ];

    /* ──────────────────────────────────────────────────────────────────
       State (persisted)
       ────────────────────────────────────────────────────────────────── */
    let removedIds = new Set();
    try { removedIds = new Set(JSON.parse(localStorage.getItem(REMOVED_EVENTS_KEY) || '[]')); } catch (_) {}
    const persistRemoved = () =>
        localStorage.setItem(REMOVED_EVENTS_KEY, JSON.stringify([...removedIds]));

    let userEvents = [];
    try { userEvents = JSON.parse(localStorage.getItem(USER_EVENTS_KEY) || '[]'); } catch (_) {}
    const persistUserEvents = () =>
        localStorage.setItem(USER_EVENTS_KEY, JSON.stringify(userEvents));
    const allEvents = () => SEED_EVENTS.concat(userEvents);

    /* ──────────────────────────────────────────────────────────────────
       SPA-nav wrapper
       ────────────────────────────────────────────────────────────────── */
    function shouldRunHere() {
        return location.pathname.includes('/studio/');
    }
    function isPlanningRoute() {
        return location.href.includes('/studio/planning');
    }

    let mounted = false;
    let injectedCards = [];
    let _reinjectObs = null;
    let _createMenuObs = null;
    let _initPoll = null;

    function mount() {
        if (mounted) return;
        if (!shouldRunHere()) return;
        // These hooks install once globally — they're safe to call repeatedly
        // because they self-flag (see hookFetch / hookXHR / hookResetHotkey).
        hookFetch();
        hookXHR();
        hookResetHotkey();
        maybeScrapeOverview();

        if (isPlanningRoute()) {
            injectStyles();
            buildPanel();
            startCreateMenuObserver();
            clearCards();
            _reinjectObs && _reinjectObs.disconnect();
            clearInterval(_initPoll);

            if (!injectCards()) {
                _initPoll = setInterval(() => {
                    if (injectCards()) {
                        clearInterval(_initPoll);
                        startReinjectObserver();
                    }
                }, 300);
                setTimeout(() => clearInterval(_initPoll), 30000);
            } else {
                startReinjectObserver();
            }
        }
        mounted = true;
        console.info('[' + SLUG + '] mounted');
    }

    function unmount() {
        if (!mounted) return;
        clearInterval(_initPoll);
        _reinjectObs && _reinjectObs.disconnect();
        _reinjectObs = null;
        _createMenuObs && _createMenuObs.disconnect();
        _createMenuObs = null;
        clearCards();
        document.querySelectorAll('[data-sb-cust="' + SLUG + '"]').forEach(n => n.remove());
        mounted = false;
    }

    function onRouteChange() {
        if (shouldRunHere()) mount();
        else                 unmount();
        // Mount stays — but if we left /studio/planning we should drop the cards.
        if (mounted && !isPlanningRoute()) {
            clearCards();
            _reinjectObs && _reinjectObs.disconnect();
            _reinjectObs = null;
        } else if (mounted && isPlanningRoute()) {
            // Re-arm planning-only pieces on nav back.
            if (!_reinjectObs) {
                injectStyles();
                buildPanel();
                startCreateMenuObserver();
                if (!injectCards()) {
                    clearInterval(_initPoll);
                    _initPoll = setInterval(() => {
                        if (injectCards()) {
                            clearInterval(_initPoll);
                            startReinjectObserver();
                        }
                    }, 300);
                    setTimeout(() => clearInterval(_initPoll), 30000);
                } else {
                    startReinjectObserver();
                }
            }
        }
    }

    ['pushState', 'replaceState'].forEach(k => {
        const orig = history[k];
        history[k] = function () {
            const r = orig.apply(this, arguments);
            queueMicrotask(onRouteChange);
            return r;
        };
    });
    window.addEventListener('popstate', onRouteChange);

    /* ──────────────────────────────────────────────────────────────────
       Styles
       ────────────────────────────────────────────────────────────────── */
    function injectStyles() {
        if (document.querySelector('style[data-sb-cust="' + SLUG + '"]')) return;
        const style = document.createElement('style');
        style.setAttribute('data-sb-cust', SLUG);
        style.textContent = `
            #sb-cust-planning-events-backdrop {
                display: none; position: fixed; inset: 0;
                background: rgba(0,0,0,0.45); z-index: 9998;
            }
            #sb-cust-planning-events-backdrop.open { display: block; }
            #sb-cust-planning-events-panel {
                position: fixed; top: 50%; left: 50%;
                transform: translate(-50%, -46%);
                opacity: 0; pointer-events: none;
                width: 460px; max-width: calc(100vw - 32px);
                max-height: calc(100vh - 64px);
                background: #fff; border-radius: 12px;
                box-shadow: 0 8px 40px rgba(0,0,0,0.22);
                z-index: 9999; overflow-y: auto;
                transition: opacity 0.18s ease, transform 0.18s ease;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            }
            #sb-cust-planning-events-panel.open {
                opacity: 1; pointer-events: auto;
                transform: translate(-50%, -50%);
            }
            #sb-cust-planning-events-panel * { box-sizing: border-box; }
            .sb-cust-planning-events-hdr {
                width: 100%; height: 180px; position: relative; flex-shrink: 0;
                background: linear-gradient(145deg, #1a1a1a 0%, #2c3e64 45%, ${BRAND} 100%);
                display: flex; flex-direction: column; align-items: center;
                justify-content: center; gap: 10px; border-radius: 12px 12px 0 0;
                overflow: hidden;
            }
            .sb-cust-planning-events-hdr::before {
                content: ''; position: absolute; inset: 0;
                background: radial-gradient(ellipse at 70% 30%, rgba(255,255,255,0.12) 0%, transparent 60%);
            }
            .sb-cust-planning-events-hdr-icon svg { width: 44px; height: 44px; fill: #fff; }
            .sb-cust-planning-events-hdr-comm {
                font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.95);
                text-align: center; padding: 0 52px; line-height: 1.35; position: relative;
            }
            .sb-cust-planning-events-close {
                position: absolute; top: 10px; right: 10px;
                width: 28px; height: 28px; border-radius: 50%;
                background: rgba(0,0,0,0.35); border: none; color: #fff; font-size: 13px;
                cursor: pointer; display: flex; align-items: center; justify-content: center;
                line-height: 1; z-index: 1;
            }
            .sb-cust-planning-events-close:hover { background: rgba(0,0,0,0.55); }
            .sb-cust-planning-events-body { padding: 18px 20px 24px; }
            .sb-cust-planning-events-badge {
                display: inline-block; font-size: 12px; font-weight: 600;
                padding: 3px 10px; border-radius: 999px;
            }
            .sb-cust-planning-events-badge.pub   { background: #dcfce7; color: #166534; }
            .sb-cust-planning-events-badge.sched { background: #fef9c3; color: #92400e; }
            .sb-cust-planning-events-badge.done  { background: #e5e7eb; color: #374151; }
            .sb-cust-planning-events-toprow { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; position: relative; }
            .sb-cust-planning-events-kebab {
                background: none; border: 0; cursor: pointer;
                width: 30px; height: 30px; border-radius: 6px;
                display: flex; align-items: center; justify-content: center;
                color: #6b7280; padding: 0;
            }
            .sb-cust-planning-events-kebab:hover { background: #f3f4f6; color: #111827; }
            .sb-cust-planning-events-kebab svg { width: 18px; height: 18px; fill: currentColor; }
            .sb-cust-planning-events-kebab-menu {
                display: none; position: absolute; right: 0; top: 36px;
                background: #fff; border: 1px solid #e5e7eb;
                border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.14);
                min-width: 210px; z-index: 20; overflow: hidden; padding: 4px 0;
            }
            .sb-cust-planning-events-kebab-menu.open { display: block; }
            .sb-cust-planning-events-kebab-item {
                display: flex; align-items: center; gap: 10px;
                padding: 9px 14px; font-size: 13px; line-height: 1.2;
                background: none; border: 0; width: 100%; text-align: left;
                cursor: pointer; color: #374151; text-decoration: none; font-family: inherit;
            }
            .sb-cust-planning-events-kebab-item:hover { background: #f9fafb; }
            .sb-cust-planning-events-kebab-item--danger { color: #b91c1c; }
            .sb-cust-planning-events-kebab-item--danger:hover { background: #fef2f2; }
            .sb-cust-planning-events-kebab-item svg { width: 16px; height: 16px; flex-shrink: 0; fill: currentColor; }
            .sb-cust-planning-events-title { font-size: 18px; font-weight: 700; color: #111827; margin: 0 0 6px; line-height: 1.3; }
            .sb-cust-planning-events-date  { font-size: 13px; color: #6b7280; margin: 0 0 2px; }
            .sb-cust-planning-events-author { font-size: 13px; color: #6b7280; margin: 0; }
            .sb-cust-planning-events-author a { color: ${BRAND}; text-decoration: underline; cursor: default; }
            .sb-cust-planning-events-div { height: 1px; background: #e5e7eb; margin: 14px 0; }
            .sb-cust-planning-events-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
            .sb-cust-planning-events-col { padding-right: 16px; }
            .sb-cust-planning-events-col:last-child { padding-right: 0; padding-left: 16px; border-left: 1px solid #e5e7eb; }
            .sb-cust-planning-events-sec {
                font-size: 11px; font-weight: 700; text-transform: uppercase;
                letter-spacing: 0.06em; color: #9ca3af; margin-bottom: 8px;
            }
            .sb-cust-planning-events-row {
                display: flex; align-items: center; gap: 8px;
                font-size: 13px; color: #374151; margin-bottom: 6px;
            }
            .sb-cust-planning-events-analytics-row { display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap; }
            .sb-cust-planning-events-analytics-item { display: flex; align-items: center; }
            .sb-cust-planning-events-analytics-icon {
                width: 32px; height: 32px; border-radius: 50%;
                background: #f3f4f6; display: flex; align-items: center;
                justify-content: center; flex-shrink: 0; color: #6b7280;
            }
            .sb-cust-planning-events-analytics-icon svg { width: 16px; height: 16px; fill: currentColor; }
            .sb-cust-planning-events-analytics-label { margin-left: 8px; }
            .sb-cust-planning-events-analytics-val { font-size: 14px; font-weight: 600; color: #111827; line-height: 1.2; white-space: nowrap; }
            .sb-cust-planning-events-analytics-name { font-size: 12px; color: #6b7280; white-space: nowrap; }
        `;
        document.head.appendChild(style);
    }

    /* ──────────────────────────────────────────────────────────────────
       Helpers + icons
       ────────────────────────────────────────────────────────────────── */
    function fmt12(h, min) {
        const ap = h < 12 ? 'AM' : 'PM';
        const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
        return h12 + ':' + String(min).padStart(2, '0') + ' ' + ap;
    }
    function fmtDate(ev) {
        const M = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const d = new Date(ev.date + 'T00:00:00');
        return M[d.getMonth()+1] + ' ' + d.getDate() + ', ' + d.getFullYear() + ' · ' + fmt12(ev.startHour, ev.startMin);
    }
    function computeStatus(ev) {
        const start = new Date(ev.date + 'T' + String(ev.startHour).padStart(2,'0') + ':' + String(ev.startMin).padStart(2,'0') + ':00');
        const end = new Date(start.getTime() + ev.duration * 60000);
        if (end.getTime() < Date.now()) return 'Completed';
        return ev.status;
    }
    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[c]));
    }
    function escapeAttr(s) { return escapeHtml(s); }

    const EVENT_SVG = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" font-size="16"><path d="M19 3h-1V1h-2v2H8V1H6v2H5C3.9 2 3 2.9 3 4v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 18H5V8h14v13zm0-15H5V4h14v2zM7 10h4v4H7z" fill-rule="evenodd"/></svg>';
    const ICON_HEAD  = '<svg viewBox="0 0 24 24"><path d="M19 3h-1V1h-2v2H8V1H6v2H5C3.9 2 3 2.9 3 4v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 18H5V8h14v13zm0-15H5V4h14v2zM7 10h4v4H7z"/></svg>';
    const ICON_GROUP = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>';
    const ICON_REG   = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>';
    const ICON_VIEW  = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>';
    const ICON_TIME  = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm.5-13H11v6l5.25 3.15.75-1.23L12.5 12V7z"/></svg>';

    /* ──────────────────────────────────────────────────────────────────
       FullCalendar measurement (uses bounding rects so it's offset-parent-safe)
       ────────────────────────────────────────────────────────────────── */
    function measureFC() {
        const hourSlots = Array.from(
            document.querySelectorAll('td.fc-timegrid-slot-label[data-time]')
        ).filter(td => /^\d{2}:00:00$/.test(td.dataset.time));
        if (hourSlots.length < 2) return null;
        const s0 = hourSlots[0], s1 = hourSlots[1];
        const r0 = s0.getBoundingClientRect();
        const r1 = s1.getBoundingClientRect();
        const pxPerHour = r1.top - r0.top;
        if (pxPerHour < 10) return null;
        const refHour = parseInt(s0.dataset.time.slice(0, 2), 10);
        return {
            pxPerHour, refSlotRect: r0, refHour,
            topPxInColumn(h, m, colFrame) {
                const colRect = colFrame.getBoundingClientRect();
                const evY = r0.top + ((h - refHour) * 60 + m) * pxPerHour / 60;
                return evY - colRect.top;
            },
            hPx(durationMin) { return Math.max(32, durationMin * pxPerHour / 60); },
        };
    }

    /* ──────────────────────────────────────────────────────────────────
       Detail panel
       ────────────────────────────────────────────────────────────────── */
    function buildPanel() {
        if (document.getElementById('sb-cust-planning-events-panel')) return;
        const bd = document.createElement('div');
        bd.id = 'sb-cust-planning-events-backdrop';
        bd.setAttribute('data-sb-cust', SLUG);
        bd.addEventListener('click', closePanel);
        document.body.appendChild(bd);
        const p = document.createElement('div');
        p.id = 'sb-cust-planning-events-panel';
        p.setAttribute('data-sb-cust', SLUG);
        document.body.appendChild(p);
    }

    function openPanel(ev) {
        const panel = document.getElementById('sb-cust-planning-events-panel');
        if (!panel) return;
        const status = computeStatus(ev);
        const isDone = status === 'Completed';
        const isPub  = status === 'Published';
        const badgeCls = isDone ? 'done' : (isPub ? 'pub' : 'sched');
        const showStats = isDone || isPub;

        panel.innerHTML = `
            <div class="sb-cust-planning-events-hdr">
                <button class="sb-cust-planning-events-close" data-pe-x>✕</button>
                <div class="sb-cust-planning-events-hdr-icon">${ICON_HEAD}</div>
                <div class="sb-cust-planning-events-hdr-comm">${escapeHtml(ev.community)}</div>
            </div>
            <div class="sb-cust-planning-events-body">
                <div class="sb-cust-planning-events-toprow">
                    <span class="sb-cust-planning-events-badge ${badgeCls}">${status}</span>
                    <button class="sb-cust-planning-events-kebab" data-pe-kebab aria-label="More options" aria-haspopup="menu">
                        <svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
                    </button>
                    <div class="sb-cust-planning-events-kebab-menu" data-pe-kebab-menu role="menu">
                        <a class="sb-cust-planning-events-kebab-item" href="${escapeAttr(ev.editorUrl || EVENT_EDITOR_URL)}" target="_blank" rel="noopener" role="menuitem">
                            <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                            <span>Edit event</span>
                        </a>
                        <button class="sb-cust-planning-events-kebab-item sb-cust-planning-events-kebab-item--danger" data-pe-remove role="menuitem">
                            <svg viewBox="0 0 24 24"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                            <span>Remove from calendar</span>
                        </button>
                    </div>
                </div>
                <h2 class="sb-cust-planning-events-title">${escapeHtml(ev.title)}</h2>
                <p class="sb-cust-planning-events-date">${fmtDate(ev)}</p>
                <p class="sb-cust-planning-events-author">Created by <a>${escapeHtml(ev.createdBy)}</a></p>
                <div class="sb-cust-planning-events-div"></div>
                <div class="sb-cust-planning-events-two-col">
                    <div class="sb-cust-planning-events-col">
                        <p class="sb-cust-planning-events-sec">Audience</p>
                        ${ev.audiences.map(a => `
                            <div class="sb-cust-planning-events-row">
                                <span>${ICON_GROUP}</span>
                                <span>${escapeHtml(a)}</span>
                            </div>`).join('')}
                    </div>
                    <div class="sb-cust-planning-events-col">
                        <p class="sb-cust-planning-events-sec">Notifications</p>
                        ${ev.notifications.map(n => `
                            <div class="sb-cust-planning-events-row"><span>${escapeHtml(n)}</span></div>`).join('')}
                    </div>
                </div>
                <div class="sb-cust-planning-events-div"></div>
                <div class="sb-cust-planning-events-analytics-row">
                    <div class="sb-cust-planning-events-analytics-item">
                        <div class="sb-cust-planning-events-analytics-icon">${ICON_REG}</div>
                        <div class="sb-cust-planning-events-analytics-label">
                            <div class="sb-cust-planning-events-analytics-val">${showStats ? escapeHtml(String(ev.stats.attendance)) : 0}</div>
                            <div class="sb-cust-planning-events-analytics-name">Registered</div>
                        </div>
                    </div>
                    <div class="sb-cust-planning-events-analytics-item">
                        <div class="sb-cust-planning-events-analytics-icon">${ICON_VIEW}</div>
                        <div class="sb-cust-planning-events-analytics-label">
                            <div class="sb-cust-planning-events-analytics-val">${showStats ? escapeHtml(String(ev.stats.unique)) : 0}</div>
                            <div class="sb-cust-planning-events-analytics-name">Attended</div>
                        </div>
                    </div>
                    <div class="sb-cust-planning-events-analytics-item">
                        <div class="sb-cust-planning-events-analytics-icon">${ICON_TIME}</div>
                        <div class="sb-cust-planning-events-analytics-label">
                            <div class="sb-cust-planning-events-analytics-val">${showStats ? escapeHtml(String(ev.stats.watchTime)) : '—'}</div>
                            <div class="sb-cust-planning-events-analytics-name">Watch Time</div>
                        </div>
                    </div>
                </div>
            </div>`;

        panel.querySelector('[data-pe-x]').addEventListener('click', closePanel);
        const kebabBtn  = panel.querySelector('[data-pe-kebab]');
        const kebabMenu = panel.querySelector('[data-pe-kebab-menu]');
        kebabBtn.addEventListener('click', (e) => { e.stopPropagation(); kebabMenu.classList.toggle('open'); });
        panel.addEventListener('click', (e) => {
            if (!e.target.closest('[data-pe-kebab]') && !e.target.closest('[data-pe-kebab-menu]')) {
                kebabMenu.classList.remove('open');
            }
        });
        panel.querySelector('[data-pe-remove]').addEventListener('click', () => {
            removedIds.add(ev.id);
            persistRemoved();
            const card = document.querySelector('[data-pe-id="' + ev.id + '"]');
            if (card) card.remove();
            injectedCards = injectedCards.filter(c => c.dataset.peId !== ev.id);
            closePanel();
        });

        requestAnimationFrame(() => {
            panel.classList.add('open');
            const bd = document.getElementById('sb-cust-planning-events-backdrop');
            if (bd) bd.classList.add('open');
        });
    }

    function closePanel() {
        const p  = document.getElementById('sb-cust-planning-events-panel');
        const bd = document.getElementById('sb-cust-planning-events-backdrop');
        if (p)  p.classList.remove('open');
        if (bd) bd.classList.remove('open');
    }

    /* ──────────────────────────────────────────────────────────────────
       Card injection
       ────────────────────────────────────────────────────────────────── */
    function clearCards() {
        injectedCards.forEach(c => c.remove());
        injectedCards = [];
    }
    function calendarReady() {
        return allEvents().some(ev => document.querySelector('td[data-date="' + ev.date + '"]'));
    }

    function injectCards() {
        if (!calendarReady()) return false;
        const m = measureFC();
        if (!m) return false;

        allEvents().forEach(ev => {
            if (removedIds.has(ev.id)) return;
            if (document.querySelector('[data-pe-id="' + ev.id + '"]')) return;

            const colFrame = document.querySelector('td[data-date="' + ev.date + '"] .fc-timegrid-col-frame');
            if (!colFrame) return;

            const topPx    = m.topPxInColumn(ev.startHour, ev.startMin, colFrame);
            const heightPx = m.hPx(ev.duration);

            const harness = document.createElement('div');
            harness.className = 'fc-timegrid-event-harness';
            harness.setAttribute('data-sb-cust', SLUG);
            harness.dataset.peId = ev.id;
            harness.style.cssText =
                'position:absolute;top:' + topPx + 'px;height:' + heightPx + 'px;' +
                'left:2%;right:2%;z-index:10;pointer-events:auto;';

            const status = computeStatus(ev);
            const isPub  = status === 'Published';
            const isDone = status === 'Completed';
            const bgColor     = isDone ? '#f3f4f6' : (isPub ? '#eef4ff' : '#fef9c3');
            const borderColor = isDone ? '#9ca3af' : (isPub ? BRAND : '#ca8a04');
            const titleColor  = isDone ? '#374151' : (isPub ? '#1e3a8a' : '#713f12');
            const metaColor   = isDone ? '#6b7280' : (isPub ? BRAND_DK : '#92400e');
            const iconColor   = isDone ? '#9ca3af' : (isPub ? BRAND : '#ca8a04');

            harness.innerHTML = `
                <a class="fc-event fc-event-start fc-event-end fc-timegrid-event fc-v-event"
                   style="cursor:pointer;display:block;height:100%;" data-pe-id="${escapeAttr(ev.id)}">
                    <div class="fc-event-main" style="height:100%;">
                        <button class="block w-full border border-solid border-transparent h-full rounded-8" type="button" style="height:100%;">
                            <span class="event-content-weekly flex h-full flex-col items-start rounded-8 px-[6px] py-[10px] gap-8 overflow-hidden hover:cursor-pointer"
                                  style="background:${bgColor};border-left:3px solid ${borderColor};height:100%;">
                                <span class="event-title-weekly w-full overflow-hidden text-left text-12 leading-16 font-medium text-ellipsis whitespace-nowrap"
                                      style="color:${titleColor};" title="${escapeAttr(ev.title)}">${escapeHtml(ev.title)}</span>
                                <span class="event-status-weekly flex w-full justify-between gap-2 overflow-hidden" style="color:${metaColor};">
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
                e.preventDefault(); e.stopPropagation();
                openPanel(ev);
            });

            colFrame.appendChild(harness);
            injectedCards.push(harness);
        });

        return injectedCards.length > 0;
    }

    function startReinjectObserver() {
        _reinjectObs && _reinjectObs.disconnect();
        _reinjectObs = new MutationObserver(() => {
            if (!calendarReady()) return;
            const missing = allEvents().some(ev =>
                !removedIds.has(ev.id) &&
                document.querySelector('td[data-date="' + ev.date + '"]') &&
                !document.querySelector('[data-pe-id="' + ev.id + '"]')
            );
            if (missing) injectCards();
        });
        _reinjectObs.observe(document.body, { childList: true, subtree: true });
    }

    /* ──────────────────────────────────────────────────────────────────
       Create-menu injection ("Event" option)
       ────────────────────────────────────────────────────────────────── */
    function injectCreateMenuItem(menu) {
        if (!menu || menu.querySelector('[data-pe-create-event]')) return;
        const labels = Array.from(menu.querySelectorAll('.ds-action-menu__item-label'))
            .map(s => s.textContent.trim());
        if (!labels.includes('Post') || !labels.includes('Blocker')) return;

        const link = document.createElement('a');
        link.setAttribute('role', 'menuitem');
        link.setAttribute('data-sb-cust', SLUG);
        link.className = 'ds-action-menu__item ds-action-menu__item--default ds-action-menu__link-item';
        link.href = EVENT_EDITOR_URL;
        link.target = '_blank';
        link.rel = 'noopener';
        link.tabIndex = -1;
        link.setAttribute('data-pe-create-event', 'true');
        const labelSpan = document.createElement('span');
        labelSpan.className = 'ds-action-menu__item-label';
        labelSpan.textContent = 'Event';
        link.appendChild(labelSpan);

        const blockerEl = Array.from(menu.children).find(el => {
            const lbl = el.querySelector && el.querySelector('.ds-action-menu__item-label');
            return lbl && lbl.textContent.trim() === 'Blocker';
        });
        if (blockerEl) menu.insertBefore(link, blockerEl);
        else           menu.appendChild(link);
    }

    function startCreateMenuObserver() {
        if (_createMenuObs) return;
        _createMenuObs = new MutationObserver(muts => {
            for (const m of muts) {
                for (const node of m.addedNodes) {
                    if (!(node instanceof HTMLElement)) continue;
                    if (node.classList && node.classList.contains('ds-action-menu')) injectCreateMenuItem(node);
                    if (node.querySelectorAll) node.querySelectorAll('.ds-action-menu').forEach(injectCreateMenuItem);
                }
            }
        });
        _createMenuObs.observe(document.body, { childList: true, subtree: true });
        document.querySelectorAll('.ds-action-menu').forEach(injectCreateMenuItem);
    }

    /* ──────────────────────────────────────────────────────────────────
       Company-event capture (fetch / XHR hooks + /overview scrape)
       ────────────────────────────────────────────────────────────────── */
    function looksLikeEventEndpoint(url) {
        return typeof url === 'string' && /company-event|companyEvent|\/events?(\b|\/)/i.test(url);
    }

    function extractEventFields(data) {
        if (!data || typeof data !== 'object') return null;
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
            id: 'user-' + f.id,
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
            editorUrl: 'https://app.staffbase.com/studio/content/company-event/' + f.id + '/overview',
        };
        const existing = userEvents.findIndex(e => e.id === ev.id);
        if (existing >= 0) userEvents[existing] = ev;
        else userEvents.push(ev);
        persistUserEvents();
        if (isPlanningRoute()) setTimeout(injectCards, 100);
        return true;
    }

    function hookFetch() {
        if (window.fetch && window.fetch.__sbPlanningEventsHooked) return;
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
        wrapped.__sbPlanningEventsHooked = true;
        window.fetch = wrapped;
    }

    function hookXHR() {
        if (XMLHttpRequest.prototype.__sbPlanningEventsHooked) return;
        const origOpen = XMLHttpRequest.prototype.open;
        const origSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function (method, url) {
            this.__sbPeMethod = method;
            this.__sbPeUrl = url;
            return origOpen.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function () {
            this.addEventListener('load', () => {
                try {
                    const m = (this.__sbPeMethod || '').toUpperCase();
                    if ((m === 'POST' || m === 'PUT' || m === 'PATCH') && looksLikeEventEndpoint(this.__sbPeUrl)) {
                        captureFromApi(JSON.parse(this.responseText));
                    }
                } catch (_) {}
            });
            return origSend.apply(this, arguments);
        };
        XMLHttpRequest.prototype.__sbPlanningEventsHooked = true;
    }

    function maybeScrapeOverview() {
        const m = location.href.match(/\/studio\/content\/company-event\/([0-9a-f]{16,})\/overview/i);
        if (!m) return;
        const id = m[1];
        const userId = 'user-' + id;
        if (userEvents.some(e => e.id === userId)) return;

        let tries = 0;
        const poll = setInterval(() => {
            tries++;
            const h1 = document.querySelector('h1, [class*="title"]');
            const title = h1 && h1.textContent.trim();
            const dateLine = Array.from(document.querySelectorAll('p, span, div'))
                .map(el => el.textContent.trim())
                .find(t => /\b\d{1,2}:\d{2}\s*(AM|PM)\b/i.test(t) && /[A-Z][a-z]{2}\s+\d{1,2}/.test(t));
            if (title && dateLine) {
                clearInterval(poll);
                const parsed = parseOverviewDateLine(dateLine);
                if (!parsed) return;
                const ev = {
                    id: userId, title, date: parsed.date,
                    startHour: parsed.startHour, startMin: parsed.startMin, duration: parsed.duration,
                    status: 'Scheduled', community: 'Company Event',
                    audiences: ['Live Broadcast'], notifications: ['Push', 'Email'],
                    createdBy: 'You',
                    stats: { attendance: 0, watchTime: '—', unique: 0, comments: 0, likes: 0 },
                    breakdown: [], userCreated: true, editorUrl: location.href,
                };
                userEvents.push(ev);
                persistUserEvents();
            }
            if (tries > 40) clearInterval(poll);
        }, 300);
    }

    function parseOverviewDateLine(line) {
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
            date: year + '-' + String(startMon).padStart(2,'0') + '-' + String(startDay).padStart(2,'0'),
            startHour: Math.floor(sm / 60), startMin: sm % 60,
            duration: Math.max(30, em - sm),
        };
    }

    /* ──────────────────────────────────────────────────────────────────
       Reset hotkey (Cmd/Ctrl+Shift+0)
       ────────────────────────────────────────────────────────────────── */
    function resetDemoState() {
        localStorage.removeItem(USER_EVENTS_KEY);
        localStorage.removeItem(REMOVED_EVENTS_KEY);
        const toast = document.createElement('div');
        toast.setAttribute('data-sb-cust', SLUG);
        toast.textContent = 'Demo state reset — reloading…';
        toast.style.cssText =
            'position:fixed;top:24px;left:50%;transform:translateX(-50%);' +
            'background:#1a1a1a;color:#fff;padding:12px 22px;' +
            'border-radius:10px;font:600 13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
            'box-shadow:0 8px 24px rgba(0,0,0,.25);z-index:99999;';
        document.body.appendChild(toast);
        setTimeout(() => location.reload(), 650);
    }

    function hookResetHotkey() {
        if (window.__sb_planning_events_reset_hooked) return;
        window.__sb_planning_events_reset_hooked = true;
        window.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'Digit0') {
                e.preventDefault();
                resetDemoState();
            }
        }, true);
    }

    /* ──────────────────────────────────────────────────────────────────
       Boot
       ────────────────────────────────────────────────────────────────── */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onRouteChange, { once: true });
    } else {
        onRouteChange();
    }
})();
