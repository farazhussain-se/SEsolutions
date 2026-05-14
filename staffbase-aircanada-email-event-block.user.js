// ==UserScript==
// @name         Staffbase Email — Air Canada Event Registration Block
// @namespace    https://aircanada.staffbase.com/
// @version      1.0.1
// @description  Rebrand Social Links quickblock as "Event Registration" + render the AC event widget over the dropped block in the email composer (demo)
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
     EVENT DATA — pulls captured event from localStorage
     when available, otherwise falls back to the demo
     defaults so the block always renders something.
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
     CSS — overlay rendered on top of the Social Links
     block when our drag is active.
  ══════════════════════════════════════════════════ */

  const CSS = `
    /* Hide the underlying Social Links rendering when masked */
    [data-ac-event-block="1"] > .ac-event-underlay { visibility: hidden !important; }

    /* Overlay card */
    .ac-event-overlay {
      position: absolute; inset: 8px;
      z-index: 5;
      background: #fff;
      border-radius: 10px;
      overflow: hidden;
      border: 1px solid #f0d3d3;
      box-shadow: 0 2px 6px rgba(0,0,0,0.04);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex; flex-direction: column;
    }
    .ac-event-head {
      background: #D82F2F; color: #fff;
      padding: 12px 18px;
      display: flex; align-items: center; justify-content: space-between;
      gap: 10px;
    }
    .ac-event-head-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .ac-event-icon {
      width: 26px; height: 26px; flex-shrink: 0;
      background: rgba(255,255,255,0.15); border-radius: 6px;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .ac-event-icon svg { width: 16px; height: 16px; fill: #fff; }
    .ac-event-title {
      font-size: 15px; font-weight: 700; line-height: 1.3; color: #fff;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .ac-event-add,
    .ac-event-add:link,
    .ac-event-add:visited,
    .ac-event-add:hover,
    .ac-event-add:active {
      font-size: 11px; font-weight: 600;
      color: #fff !important; text-decoration: none !important;
      padding: 5px 12px; border-radius: 999px;
      background: rgba(255,255,255,0.18);
      border: 1px solid rgba(255,255,255,0.35);
      white-space: nowrap; flex-shrink: 0;
    }
    .ac-event-meta {
      padding: 12px 18px;
      font-size: 13px; color: #374151;
      background: #fff;
      line-height: 1.5;
    }
    .ac-event-meta div { margin-bottom: 4px; }
    .ac-event-meta div:last-child { margin-bottom: 0; }
    .ac-event-meta b { color: #111827; font-weight: 600; }
    .ac-event-rsvp {
      background: #fef4f4;
      border-top: 1px solid #fce8e8;
      padding: 10px 18px;
      display: flex; align-items: center; justify-content: space-between;
      gap: 10px;
    }
    .ac-event-rsvp-prompt {
      font-size: 13px; font-weight: 600; color: #111827;
    }
    .ac-event-rsvp-btns { display: flex; gap: 8px; }
    .ac-event-rsvp-btn {
      padding: 6px 18px; border-radius: 999px;
      font-size: 12px; font-weight: 600; cursor: pointer;
      font-family: inherit; border: 1px solid transparent;
    }
    .ac-event-rsvp-btn.yes { background: #D82F2F; color: #fff; }
    .ac-event-rsvp-btn.yes:hover, .ac-event-rsvp-btn.yes.on { background: #b12525; }
    .ac-event-rsvp-btn.no  { background: #fff; color: #374151; border-color: #d1d5db; }
    .ac-event-rsvp-btn.no:hover, .ac-event-rsvp-btn.no.on { background: #f3f4f6; }

    /* Rebranded sidebar tile */
    [data-ac-event-tile="1"] svg, [data-ac-event-tile="1"] img.ac-original-icon { display: none !important; }
    .ac-event-tile-icon {
      display: inline-flex; align-items: center; justify-content: center;
      width: 24px; height: 20px; color: #171719;
    }
    .ac-event-tile-icon svg { display: inline-block !important; width: 18px; height: 18px; stroke: #171719; fill: none; }
  `;

  function injectStyles() {
    if (document.getElementById('ac-event-block-styles')) return;
    const s = document.createElement('style');
    s.id = 'ac-event-block-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════════════════
     SIDEBAR — REBRAND SOCIAL LINKS AS EVENT REGISTRATION
  ══════════════════════════════════════════════════ */

  const SOCIAL_LINKS_FEATURE = 'quickblock-social-links';
  const TILE_CAL_SVG = `<svg viewBox="0 0 24 24" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/></svg>`;

  function rebrandSocialLinksTile(root) {
    const tile = (root || document).querySelector(
      `[data-pendo-feature="${SOCIAL_LINKS_FEATURE}"], [aria-description="Add Social Links quickblock to canvas"]`
    );
    if (!tile || tile.dataset.acEventTile === '1') return false;

    tile.dataset.acEventTile = '1';

    // Swap label.
    const label = tile.querySelector('[id^=":r"], .text-label-xs, button > div');
    // Find the actual label inside the tile (the div with the text "Social Links").
    const labelEl = Array.from(tile.querySelectorAll('div'))
      .find(d => (d.textContent || '').trim() === 'Social Links');
    if (labelEl) labelEl.textContent = 'Event Registration';

    // Swap icon: tag any existing svg/img so our CSS hides it, then prepend ours.
    const btn = tile.matches('button') ? tile : tile.querySelector('button');
    const host = btn || tile;
    host.querySelectorAll('svg, img').forEach(el => el.classList.add('ac-original-icon'));

    const iconWrap = document.createElement('span');
    iconWrap.className = 'ac-event-tile-icon';
    iconWrap.innerHTML = TILE_CAL_SVG;
    host.insertBefore(iconWrap, host.firstChild);

    // Update accessibility label.
    if (host.hasAttribute('aria-description')) {
      host.setAttribute('aria-description', 'Add Event Registration quickblock to canvas');
    }

    // Wire drag tracking on this tile (and any draggable ancestor).
    const draggables = [tile, tile.closest('[draggable="true"]')].filter(Boolean);
    draggables.forEach(node => {
      node.addEventListener('dragstart', () => { dragArmed = Date.now(); }, true);
      node.addEventListener('dragend',   () => { /* leave dragArmed; cleared after apply */ }, true);
    });

    return true;
  }

  /* ══════════════════════════════════════════════════
     EMAIL BODY — DETECT NEW BLOCK + APPLY OVERLAY
  ══════════════════════════════════════════════════ */

  // Timestamp of the most recent dragstart on our rebranded tile.
  // We consider a new block to be "ours" if it appears within DRAG_WINDOW_MS.
  let dragArmed = 0;
  const DRAG_WINDOW_MS = 4000;

  function blocksContainer() {
    // The body is the <ul class="sc-iGgWBj ..."> in the email composer.
    return document.querySelector('ul.sc-iGgWBj') || document.querySelector('[class*="EmailEditor"] ul');
  }

  function getBlockWrappers() {
    const container = blocksContainer();
    if (!container) return [];
    // Each block in the email body is structured as:
    //   ul > div[draggable] > div[id][draggable]
    // Target *only* the inner draggable so we ignore deeply-nested CKEditor
    // mounts and other elements that happen to have ids.
    return Array.from(container.querySelectorAll(
      ':scope > div[draggable] > div[id][draggable="true"]'
    ));
  }

  function applyOverlayToBlock(blockEl) {
    if (!blockEl || !document.contains(blockEl)) return;
    if (blockEl.dataset.acEventBlock === '1') return;
    blockEl.dataset.acEventBlock = '1';

    // The visible content cell — wrap existing children so we can absolutely
    // position our overlay on top while preserving Staffbase's block state.
    blockEl.style.position = 'relative';

    // Make all immediate visual children part of an underlay group.
    Array.from(blockEl.children).forEach(c => c.classList.add('ac-event-underlay'));

    // Build the overlay.
    const ev = pickEvent();
    const overlay = document.createElement('div');
    overlay.className = 'ac-event-overlay';
    overlay.contentEditable = 'false';
    overlay.innerHTML = `
      <div class="ac-event-head">
        <div class="ac-event-head-left">
          <span class="ac-event-icon"><svg viewBox="0 0 24 24"><path d="M19 3h-1V1h-2v2H8V1H6v2H5C3.9 2 3 2.9 3 4v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 18H5V8h14v13zm0-15H5V4h14v2zM7 10h4v4H7z"/></svg></span>
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
    `;
    blockEl.appendChild(overlay);

    // RSVP click state.
    const yes = overlay.querySelector('.yes');
    const no  = overlay.querySelector('.no');
    yes.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); yes.classList.add('on'); no.classList.remove('on'); });
    no.addEventListener('click',  (e) => { e.preventDefault(); e.stopPropagation(); no.classList.add('on');  yes.classList.remove('on'); });
  }

  let lastBlockIds = new Set();
  function snapshotBlockIds() {
    getBlockWrappers().forEach(el => lastBlockIds.add(el.id));
  }

  function handleNewBlocks() {
    const wrappers = getBlockWrappers();
    if (!wrappers.length) return;

    const fresh = wrappers.filter(n => !lastBlockIds.has(n.id) && document.contains(n));
    wrappers.forEach(n => lastBlockIds.add(n.id));

    if (!fresh.length) return;
    if (Date.now() - dragArmed > DRAG_WINDOW_MS) return;

    try {
      const target = fresh[fresh.length - 1];
      if (document.contains(target)) applyOverlayToBlock(target);
    } catch (_) { /* node may have unmounted between detect + apply */ }
    dragArmed = 0;
  }

  /* ══════════════════════════════════════════════════
     OBSERVER + INIT
  ══════════════════════════════════════════════════ */

  let _obs = null;
  let _scheduled = false;
  function scheduleSweep() {
    if (_scheduled) return;
    _scheduled = true;
    requestAnimationFrame(() => {
      _scheduled = false;
      try {
        rebrandSocialLinksTile(document);
        handleNewBlocks();
      } catch (_) { /* swallow — keep observer alive across React churn */ }
    });
  }
  function startObserver() {
    if (_obs) return;
    _obs = new MutationObserver(scheduleSweep);
    _obs.observe(document.body, { childList: true, subtree: true });
  }

  /* ══════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════ */

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  function init() {
    injectStyles();
    rebrandSocialLinksTile(document);
    snapshotBlockIds();
    startObserver();
  }

  // SPA navigation — re-init on route change.
  const _push = history.pushState.bind(history);
  history.pushState = function (...args) {
    _push(...args);
    setTimeout(init, 400);
  };
  window.addEventListener('popstate', () => setTimeout(init, 400));

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
