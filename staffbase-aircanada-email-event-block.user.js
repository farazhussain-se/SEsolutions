// ==UserScript==
// @name         Staffbase Email — Air Canada Event Registration Block
// @namespace    https://aircanada.staffbase.com/
// @version      1.1.0
// @description  Drops an AC event card directly into the Staffbase email body and rebrands the Social Links quickblock as an "Event Registration" placeholder (demo)
// @author       Faraz Hussein · Staffbase SE Solutions
// @match        https://app.staffbase.com/admin/email/*
// @match        https://app.staffbase.com/admin/*
// @match        https://*.staffbase.com/admin/email/*
// @match        https://*.staffbase.com/admin/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  /* ══════════════════════════════════════════════════
     EVENT DATA — captured from localStorage with a
     hard-coded fallback so the card always renders.
  ══════════════════════════════════════════════════ */

  const USER_EVENTS_KEY = 'ac_cal_user_events';
  const DEFAULT_EVENT = {
    title: 'Cleared for Departure',
    when:  'May 15, 2026 · 9:00 AM',
    where: 'Live - Townhall',
    editorUrl: 'https://app.staffbase.com/studio/content/company-event/scheduled',
  };
  function pickEvent() {
    try {
      const events = JSON.parse(localStorage.getItem(USER_EVENTS_KEY) || '[]');
      if (events.length) {
        const ev = events[events.length - 1];
        return {
          title: ev.title || DEFAULT_EVENT.title,
          when:  formatWhen(ev) || DEFAULT_EVENT.when,
          where: 'Live - Townhall',
          editorUrl: ev.editorUrl || DEFAULT_EVENT.editorUrl,
        };
      }
    } catch (_) {}
    return { ...DEFAULT_EVENT };
  }
  function formatWhen(ev) {
    if (!ev.date) return null;
    const M = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const d = new Date(ev.date + 'T00:00:00');
    if (isNaN(d)) return null;
    const h = ev.startHour ?? 9, m = ev.startMin ?? 0;
    const ap = h < 12 ? 'AM' : 'PM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${M[d.getMonth()+1]} ${d.getDate()}, ${d.getFullYear()} · ${h12}:${String(m).padStart(2,'0')} ${ap}`;
  }

  /* ══════════════════════════════════════════════════
     CSS
  ══════════════════════════════════════════════════ */

  const CSS = `
    /* Sidebar tile rebrand — purely visual */
    [data-ac-event-tile] svg.ac-original-icon,
    [data-ac-event-tile] img.ac-original-icon { display: none !important; }
    .ac-event-tile-icon {
      display: inline-flex; align-items: center; justify-content: center;
      width: 24px; height: 20px; color: #171719;
    }
    .ac-event-tile-icon svg { width: 18px; height: 18px; stroke: #171719; fill: none; }

    /* Injected event card in the email body */
    .ac-event-li {
      list-style: none;
      display: flex; justify-content: center;
      padding: 12px 0;
      background: transparent;
    }
    .ac-event-card {
      width: 580px; max-width: calc(100% - 20px);
      background: #fff;
      border-radius: 10px;
      overflow: hidden;
      border: 1px solid #f0d3d3;
      box-shadow: 0 2px 6px rgba(0,0,0,0.05);
      font-family: Arial, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .ac-event-head {
      background: #D82F2F;
      color: #fff;
      padding: 14px 18px;
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px;
    }
    .ac-event-head-left {
      display: flex; align-items: center; gap: 10px; min-width: 0;
    }
    .ac-event-icon {
      width: 28px; height: 28px; flex-shrink: 0;
      background: rgba(255,255,255,0.15); border-radius: 6px;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .ac-event-icon svg { width: 16px; height: 16px; fill: #fff; }
    .ac-event-title {
      font-size: 16px; font-weight: 700; line-height: 1.3; color: #fff;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .ac-event-add,
    .ac-event-add:link,
    .ac-event-add:visited,
    .ac-event-add:hover,
    .ac-event-add:active {
      font-size: 12px; font-weight: 600;
      color: #fff !important; text-decoration: none !important;
      padding: 6px 14px; border-radius: 999px;
      background: rgba(255,255,255,0.18);
      border: 1px solid rgba(255,255,255,0.35);
      white-space: nowrap; flex-shrink: 0;
    }
    .ac-event-meta {
      padding: 14px 18px;
      font-size: 14px; color: #374151; background: #fff;
      line-height: 1.55;
    }
    .ac-event-meta div { margin-bottom: 4px; }
    .ac-event-meta div:last-child { margin-bottom: 0; }
    .ac-event-meta b { color: #111827; font-weight: 600; }
    .ac-event-rsvp {
      background: #fef4f4;
      border-top: 1px solid #fce8e8;
      padding: 12px 18px;
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px;
    }
    .ac-event-rsvp-prompt {
      font-size: 14px; font-weight: 600; color: #111827;
    }
    .ac-event-rsvp-btns { display: flex; gap: 8px; }
    .ac-event-rsvp-btn {
      padding: 7px 22px; border-radius: 999px;
      font-size: 13px; font-weight: 600; cursor: pointer;
      font-family: inherit; border: 1px solid transparent;
    }
    .ac-event-rsvp-btn.yes        { background: #D82F2F; color: #fff; }
    .ac-event-rsvp-btn.yes:hover,
    .ac-event-rsvp-btn.yes.on     { background: #b12525; }
    .ac-event-rsvp-btn.no         { background: #fff; color: #374151; border-color: #d1d5db; }
    .ac-event-rsvp-btn.no:hover,
    .ac-event-rsvp-btn.no.on      { background: #f3f4f6; }
  `;

  function injectStyles() {
    if (document.getElementById('ac-event-block-styles')) return;
    const s = document.createElement('style');
    s.id = 'ac-event-block-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════════════════
     SIDEBAR TILE — PURE VISUAL REBRAND
     The tile keeps Staffbase's underlying Social Links
     drag behaviour, but we relabel + reicon it so it
     reads "Event Registration" on camera. No drag
     hooks, no overlay logic — just visual.
  ══════════════════════════════════════════════════ */

  const TILE_CAL_SVG = `<svg viewBox="0 0 24 24" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/></svg>`;

  function rebrandSidebarTile() {
    const tile = document.querySelector(
      '[data-pendo-feature="quickblock-social-links"], [aria-description*="Social Links"]'
    );
    if (!tile || tile.dataset.acEventTile === '1') return;

    try {
      tile.dataset.acEventTile = '1';
      tile.querySelectorAll('svg, img').forEach(el => el.classList.add('ac-original-icon'));

      const host = tile.matches('button') ? tile : tile.querySelector('button') || tile;
      const iconWrap = document.createElement('span');
      iconWrap.className = 'ac-event-tile-icon';
      iconWrap.innerHTML = TILE_CAL_SVG;
      host.insertBefore(iconWrap, host.firstChild);

      const label = Array.from(tile.querySelectorAll('div')).find(d =>
        (d.textContent || '').trim() === 'Social Links'
      );
      if (label) label.textContent = 'Event Registration';

      if (host.hasAttribute('aria-description')) {
        host.setAttribute('aria-description', 'Add Event Registration quickblock to canvas');
      }
    } catch (_) { /* leave the tile alone on any DOM hiccup */ }
  }

  /* ══════════════════════════════════════════════════
     EMAIL BODY — INJECT EVENT CARD
     Append a new <li> directly to the body's <ul>.
     React will leave non-managed children alone in most
     cases; if it ever removes ours, the 1s polling
     interval re-adds it.
  ══════════════════════════════════════════════════ */

  const CAL_SVG = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3h-1V1h-2v2H8V1H6v2H5C3.9 2 3 2.9 3 4v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 18H5V8h14v13zm0-15H5V4h14v2zM7 10h4v4H7z"/></svg>`;

  function buildCardHtml() {
    const ev = pickEvent();
    return `
      <div class="ac-event-card">
        <div class="ac-event-head">
          <div class="ac-event-head-left">
            <span class="ac-event-icon">${CAL_SVG}</span>
            <span class="ac-event-title">${escapeHtml(ev.title)}</span>
          </div>
          <a class="ac-event-add" href="${escapeAttr(ev.editorUrl)}" target="_blank" rel="noopener">+ Add to Calendar</a>
        </div>
        <div class="ac-event-meta">
          <div><b>When:</b> ${escapeHtml(ev.when)}</div>
          <div><b>Where:</b> ${escapeHtml(ev.where)}</div>
        </div>
        <div class="ac-event-rsvp">
          <div class="ac-event-rsvp-prompt">Will you be attending?</div>
          <div class="ac-event-rsvp-btns">
            <button class="ac-event-rsvp-btn yes" type="button">Yes</button>
            <button class="ac-event-rsvp-btn no"  type="button">No</button>
          </div>
        </div>
      </div>
    `.trim();
  }

  function emailBodyList() {
    return document.querySelector('ul.sc-iGgWBj') || document.querySelector('[class*="EmailEditor"] ul');
  }

  function injectEventBlock() {
    const ul = emailBodyList();
    if (!ul) return;
    if (ul.querySelector('[data-ac-event-card="1"]')) return;

    const li = document.createElement('li');
    li.className = 'ac-event-li';
    li.setAttribute('data-ac-event-card', '1');
    li.setAttribute('contenteditable', 'false');
    li.innerHTML = buildCardHtml();

    // Slot it in just above the final block so it reads as content,
    // not the footer. If there's only one block, append.
    const children = Array.from(ul.children);
    if (children.length >= 2) {
      ul.insertBefore(li, children[children.length - 1]);
    } else {
      ul.appendChild(li);
    }
  }

  /* ══════════════════════════════════════════════════
     RSVP CLICK STATE (event delegation, capture phase)
  ══════════════════════════════════════════════════ */

  document.addEventListener('click', (e) => {
    const yes = e.target.closest('.ac-event-rsvp-btn.yes');
    const no  = e.target.closest('.ac-event-rsvp-btn.no');
    if (!yes && !no) return;
    e.preventDefault();
    e.stopPropagation();
    const card = (yes || no).closest('.ac-event-card');
    if (!card) return;
    const y = card.querySelector('.ac-event-rsvp-btn.yes');
    const n = card.querySelector('.ac-event-rsvp-btn.no');
    if (yes) { y.classList.add('on'); n.classList.remove('on'); }
    else     { n.classList.add('on'); y.classList.remove('on'); }
  }, true);

  /* ══════════════════════════════════════════════════
     HELPERS + INIT
  ══════════════════════════════════════════════════ */

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  function tick() {
    try {
      injectStyles();
      rebrandSidebarTile();
      injectEventBlock();
    } catch (_) { /* keep the polling loop alive */ }
  }

  // No MutationObserver, no drag detection — just a calm 1-second poll.
  tick();
  setInterval(tick, 1000);
})();
