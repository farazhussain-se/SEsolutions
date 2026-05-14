// ==UserScript==
// @name         Staffbase News — Air Canada Event Widget
// @namespace    https://aircanada.staffbase.com/
// @version      1.0.2
// @description  Adds an Event widget to the article editor's Add Widget palette + event picker + AC-branded event card in the text area (demo)
// @author       Faraz Hussein · Staffbase SE Solutions
// @match        https://app.staffbase.com/admin/plugin/news/*
// @match        https://*.staffbase.com/admin/plugin/news/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  /* ══════════════════════════════════════════════════
     SHARED STATE
     Pulls events captured by the calendar script.
  ══════════════════════════════════════════════════ */

  const USER_EVENTS_KEY = 'ac_cal_user_events';
  function getUserEvents() {
    try { return JSON.parse(localStorage.getItem(USER_EVENTS_KEY) || '[]'); } catch (_) { return []; }
  }

  // Static fallback so the picker is never empty during a demo.
  const FALLBACK_EVENTS = [
    {
      id: 'fallback-cleared',
      title: 'Cleared for Departure',
      date: new Date().toISOString().slice(0, 10),
      startHour: 9, startMin: 0, duration: 60,
      community: 'Air Canada — All Crew',
      editorUrl: 'https://app.staffbase.com/studio/content/company-event/scheduled',
    },
  ];

  function allPickableEvents() {
    const captured = getUserEvents();
    return captured.length ? captured : FALLBACK_EVENTS;
  }

  /* ══════════════════════════════════════════════════
     CSS
  ══════════════════════════════════════════════════ */

  const CSS = `
    /* Event tile injected into the Add Widget palette. We don't know
       Staffbase's exact tile classes, so this is a defensive baseline
       that works alongside any cloned classes from an existing tile. */
    .ac-ew-injected-tile {
      cursor: pointer;
    }
    .ac-ew-injected-tile [data-ac-ew-label] {
      font-weight: 500;
    }

    /* Event picker modal — matches Staffbase's native widget config layout
       (see Static Content Widget for reference). */
    .ac-ew-backdrop {
      position: fixed; inset: 0; z-index: 99999;
      background: rgba(0,0,0,0.45);
      display: none; align-items: center; justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .ac-ew-backdrop.open { display: flex; }
    .ac-ew-modal {
      background: #fff; border-radius: 12px;
      width: 560px; max-width: calc(100vw - 32px);
      max-height: calc(100vh - 64px);
      box-shadow: 0 16px 48px rgba(0,0,0,0.25);
      display: flex; flex-direction: column;
      overflow: hidden;
      color: #1f2937;
    }
    .ac-ew-modal-head {
      padding: 24px 32px 18px; text-align: center;
    }
    .ac-ew-modal-head h2 {
      margin: 0; font-size: 18px; font-weight: 700; color: #111827;
    }
    .ac-ew-modal-body {
      padding: 0 32px 8px; overflow-y: auto; flex: 1;
    }
    .ac-ew-section { margin-bottom: 28px; }
    .ac-ew-section h3 {
      font-size: 15px; font-weight: 700; color: #111827;
      margin: 0 0 18px;
    }

    /* One label + control row, matching Static Content widget spacing. */
    .ac-ew-row {
      display: flex;
      align-items: flex-start;
      gap: 18px;
      margin-bottom: 18px;
    }
    .ac-ew-row:last-child { margin-bottom: 0; }
    .ac-ew-row-label {
      flex: 0 0 140px;
      font-size: 13px; color: #1f2937;
      padding-top: 8px;
      display: flex; align-items: center; gap: 6px;
    }
    .ac-ew-row-control { flex: 1; min-width: 0; }

    .ac-ew-help {
      display: inline-flex; align-items: center; justify-content: center;
      width: 14px; height: 14px; border-radius: 50%;
      border: 1px solid #d1d5db; color: #9ca3af;
      font-size: 10px; line-height: 1; font-weight: 600;
      flex-shrink: 0;
    }

    .ac-ew-input, .ac-ew-select {
      width: 100%;
      border: 1px solid #e5e7eb; border-radius: 6px;
      padding: 8px 12px; font-size: 13px; background: #f9fafb;
      font-family: inherit; color: #1f2937;
      box-sizing: border-box;
    }
    .ac-ew-input:focus, .ac-ew-select:focus {
      outline: none; border-color: #2563eb;
      box-shadow: 0 0 0 2px rgba(37,99,235,.18);
      background: #fff;
    }

    /* Device toggle row — matches Static Content's blue square buttons */
    .ac-ew-device-row { display: inline-flex; gap: 4px; }
    .ac-ew-device-btn {
      width: 38px; height: 32px;
      border: 0; border-radius: 4px;
      background: #2089f7; color: #fff; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center;
      padding: 0;
      transition: background .15s;
    }
    .ac-ew-device-btn svg { width: 18px; height: 18px; fill: currentColor; }
    .ac-ew-device-btn.off { background: #e5e7eb; color: #9ca3af; }
    .ac-ew-device-btn:hover { filter: brightness(0.96); }

    /* Radios stacked, label inline next to each */
    .ac-ew-radio {
      display: flex; align-items: center; gap: 10px;
      font-size: 13px; color: #1f2937; cursor: pointer;
      padding: 4px 0;
      line-height: 1.4;
    }
    .ac-ew-radio input[type=radio] {
      margin: 0; accent-color: #2563eb;
      width: 16px; height: 16px;
      cursor: pointer;
    }

    .ac-ew-modal-foot {
      display: flex; gap: 12px;
      padding: 18px 32px 24px;
    }
    .ac-ew-btn {
      flex: 1;
      padding: 11px 22px; border-radius: 6px; font-size: 14px;
      font-weight: 600; cursor: pointer; border: 1px solid transparent;
      font-family: inherit;
      transition: all .15s ease;
    }
    .ac-ew-btn-cancel {
      background: #fff; color: #1f2937; border-color: #d1d5db;
    }
    .ac-ew-btn-cancel:hover { background: #f9fafb; }
    .ac-ew-btn-ok {
      background: #2089f7; color: #fff;
    }
    .ac-ew-btn-ok:hover { background: #1971d3; }
    .ac-ew-btn-ok:disabled { background: #93c5fd; cursor: not-allowed; }

    /* Inserted widget card — Air Canada brand */
    .ac-ew-card-host {
      /* Wrapper styles applied by .content-widget-wrapper (Staffbase). */
    }
    .ac-ew-card {
      border-radius: 10px;
      overflow: hidden;
      background: #fff;
      border: 1px solid #f0d3d3;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      max-width: 100%;
    }
    .ac-ew-card-head {
      background: linear-gradient(135deg, #D82F2F 0%, #b12525 100%);
      color: #fff; padding: 14px 18px;
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px;
    }
    .ac-ew-card-title {
      font-size: 16px; font-weight: 700; line-height: 1.25;
    }
    .ac-ew-card-add {
      font-size: 12px; font-weight: 600; color: #fff;
      text-decoration: none; white-space: nowrap;
      padding: 4px 10px; border-radius: 12px;
      background: rgba(255,255,255,0.18);
      border: 1px solid rgba(255,255,255,0.3);
    }
    .ac-ew-card-meta {
      padding: 12px 18px; font-size: 13px; color: #374151;
      background: #fff;
    }
    .ac-ew-card-meta div { margin-bottom: 4px; }
    .ac-ew-card-meta div:last-child { margin-bottom: 0; }
    .ac-ew-card-meta b { color: #111827; font-weight: 600; }
    .ac-ew-card-rsvp {
      background: #fef2f2;
      padding: 12px 18px;
      display: flex; align-items: center; justify-content: space-between;
      gap: 10px; border-top: 1px solid #fce8e8;
    }
    .ac-ew-card-rsvp-prompt {
      font-size: 13px; font-weight: 600; color: #111827;
    }
    .ac-ew-card-rsvp-btns { display: flex; gap: 8px; }
    .ac-ew-card-rsvp-btn {
      padding: 6px 18px; border-radius: 18px; font-size: 13px;
      font-weight: 600; cursor: pointer; font-family: inherit;
      border: 1px solid transparent;
    }
    .ac-ew-card-rsvp-btn.yes { background: #D82F2F; color: #fff; }
    .ac-ew-card-rsvp-btn.no  { background: #fff; color: #374151; border-color: #d1d5db; }
  `;

  function injectStyles() {
    if (document.getElementById('ac-ew-styles')) return;
    const s = document.createElement('style');
    s.id = 'ac-ew-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════════════════
     ADD WIDGET MODAL — INJECT EVENT TILE
     Staffbase's palette uses stable class names + the
     existing tiles carry aria-label="<name>" — we use
     those directly rather than text-walking the DOM.
     The new tile is inserted right after "Weather Time".
  ══════════════════════════════════════════════════ */

  const TILE_GRID_CLASS  = 'ui-commons__widget-menu__buttons-container';
  const TILE_BTN_CLASS   = 'ui-commons__widget-menu__button';
  const TILE_LABEL_CLASS = 'ui-commons__widget-menu__label';
  const ANCHOR_LABEL     = 'Weather Time';

  // Inline calendar SVG matching the style of other tile icons.
  const TILE_CALENDAR_SVG = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#464B50" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="width:28px;height:28px;"><rect x="3" y="5" width="18" height="16" rx="2" class="accent-stroke"/><line x1="3" y1="10" x2="21" y2="10" class="accent-stroke"/><line x1="8" y1="3" x2="8" y2="7" class="accent-stroke"/><line x1="16" y1="3" x2="16" y2="7" class="accent-stroke"/></svg>`;

  function findPaletteParts(root) {
    if (!(root instanceof HTMLElement)) return null;
    const grid = root.matches?.(`.${TILE_GRID_CLASS}`)
      ? root
      : root.querySelector?.(`.${TILE_GRID_CLASS}`);
    if (!grid) return null;
    if (grid.querySelector('[data-ac-ew-tile]')) return null;

    const anchor = grid.querySelector(`[aria-label="${ANCHOR_LABEL}"]`);
    const tiles  = grid.querySelectorAll(`.${TILE_BTN_CLASS}`);
    const sample = anchor || tiles[tiles.length - 1] || tiles[0];
    if (!sample) return null;

    return { grid, sample, anchor };
  }

  function injectEventTile(parts) {
    const { grid, sample, anchor } = parts;
    if (grid.querySelector('[data-ac-ew-tile]')) return;

    const tile = sample.cloneNode(true);
    tile.setAttribute('data-ac-ew-tile', '1');
    tile.setAttribute('aria-label', 'Event');
    tile.classList.add('ac-ew-injected-tile');

    // Wipe all icon nodes from the clone and prepend our calendar SVG.
    tile.querySelectorAll('svg, img').forEach(n => n.remove());
    const iconWrap = document.createElement('span');
    iconWrap.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;';
    iconWrap.innerHTML = TILE_CALENDAR_SVG;
    tile.insertBefore(iconWrap, tile.firstChild);

    // Replace the label text inside the cloned label element.
    const label = tile.querySelector(`.${TILE_LABEL_CLASS}`);
    if (label) {
      label.textContent = 'Event';
      label.setAttribute('data-ac-ew-label', '1');
    }

    // Strip any anchor hrefs from the clone (e.g. Email tile is an <a>).
    tile.querySelectorAll('a[href]').forEach(a => a.removeAttribute('href'));

    tile.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeStaffbasePalette();
      openEventPicker();
    }, true);
    tile.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        closeStaffbasePalette();
        openEventPicker();
      }
    });

    if (anchor && anchor.nextSibling) {
      grid.insertBefore(tile, anchor.nextSibling);
    } else {
      grid.appendChild(tile);
    }
  }

  function closeStaffbasePalette() {
    const cancel = Array.from(document.querySelectorAll('button')).find(b =>
      (b.textContent || '').trim().toLowerCase() === 'cancel'
    );
    if (cancel) cancel.click();
    else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }

  let _paletteObs = null;
  function startPaletteObserver() {
    if (_paletteObs) return;
    _paletteObs = new MutationObserver(mutations => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          const parts = findPaletteParts(node);
          if (parts) injectEventTile(parts);
        }
      }
    });
    _paletteObs.observe(document.body, { childList: true, subtree: true });

    // Cover the case where the palette is already open at script load.
    const parts = findPaletteParts(document.body);
    if (parts) injectEventTile(parts);
  }

  /* ══════════════════════════════════════════════════
     EVENT PICKER MODAL
  ══════════════════════════════════════════════════ */

  let pickerBackdrop = null;
  function buildPicker() {
    if (pickerBackdrop) return;
    pickerBackdrop = document.createElement('div');
    pickerBackdrop.className = 'ac-ew-backdrop';
    pickerBackdrop.innerHTML = `
      <div class="ac-ew-modal" role="dialog" aria-labelledby="ac-ew-title">
        <div class="ac-ew-modal-head"><h2 id="ac-ew-title">Event Widget</h2></div>
        <div class="ac-ew-modal-body">
          <div class="ac-ew-section">
            <h3>General</h3>
            <div class="ac-ew-row">
              <div class="ac-ew-row-label">Title:</div>
              <div class="ac-ew-row-control">
                <input class="ac-ew-input" id="ac-ew-title-input" placeholder="">
              </div>
            </div>
            <div class="ac-ew-row">
              <div class="ac-ew-row-label">Show on: <span class="ac-ew-help">?</span></div>
              <div class="ac-ew-row-control">
                <div class="ac-ew-device-row">
                  <button class="ac-ew-device-btn" data-device="desktop" title="Desktop"><svg viewBox="0 0 24 24"><path d="M21 3H3a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h7v2H7v2h10v-2h-3v-2h7a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 13H3V5h18v11z"/></svg></button>
                  <button class="ac-ew-device-btn" data-device="tablet" title="Tablet"><svg viewBox="0 0 24 24"><path d="M19 0H5a3 3 0 0 0-3 3v18a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V3a3 3 0 0 0-3-3zM12 22a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm8-4H4V4h16v14z"/></svg></button>
                  <button class="ac-ew-device-btn" data-device="mobile" title="Mobile"><svg viewBox="0 0 24 24"><path d="M17 1H7a3 3 0 0 0-3 3v16a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V4a3 3 0 0 0-3-3zm-5 21a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm6-4H6V4h12v15z"/></svg></button>
                </div>
              </div>
            </div>
            <div class="ac-ew-row">
              <div class="ac-ew-row-label">Visibility in the App: <span class="ac-ew-help">?</span></div>
              <div class="ac-ew-row-control">
                <label class="ac-ew-radio"><input type="radio" name="ac-ew-vis" value="all" checked> For all users</label>
                <label class="ac-ew-radio"><input type="radio" name="ac-ew-vis" value="groups"> For selected groups</label>
              </div>
            </div>
          </div>
          <div class="ac-ew-section">
            <h3>Event Data</h3>
            <div class="ac-ew-row">
              <div class="ac-ew-row-label">Event:</div>
              <div class="ac-ew-row-control">
                <select class="ac-ew-select" id="ac-ew-event-select"></select>
              </div>
            </div>
          </div>
        </div>
        <div class="ac-ew-modal-foot">
          <button class="ac-ew-btn ac-ew-btn-cancel" id="ac-ew-cancel">Cancel</button>
          <button class="ac-ew-btn ac-ew-btn-ok" id="ac-ew-ok">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(pickerBackdrop);

    pickerBackdrop.addEventListener('click', (e) => {
      if (e.target === pickerBackdrop) closeEventPicker();
    });
    pickerBackdrop.querySelector('#ac-ew-cancel').addEventListener('click', closeEventPicker);
    pickerBackdrop.querySelector('#ac-ew-ok').addEventListener('click', confirmEventPicker);

    pickerBackdrop.querySelectorAll('.ac-ew-device-btn').forEach(btn => {
      btn.addEventListener('click', () => btn.classList.toggle('off'));
    });
  }

  function openEventPicker() {
    injectStyles();
    buildPicker();
    const select = pickerBackdrop.querySelector('#ac-ew-event-select');
    const events = allPickableEvents();
    select.innerHTML = events.map((ev, i) =>
      `<option value="${i}">${escapeHtml(ev.title)} — ${formatPickerDate(ev)}</option>`
    ).join('');
    pickerBackdrop.querySelector('#ac-ew-title-input').value = '';
    pickerBackdrop.classList.add('open');
  }

  function closeEventPicker() {
    pickerBackdrop?.classList.remove('open');
  }

  function confirmEventPicker() {
    const idx = parseInt(pickerBackdrop.querySelector('#ac-ew-event-select').value, 10);
    const events = allPickableEvents();
    const ev = events[idx];
    if (!ev) return closeEventPicker();
    const title = pickerBackdrop.querySelector('#ac-ew-title-input').value.trim();
    insertEventWidget(ev, title);
    closeEventPicker();
  }

  /* ══════════════════════════════════════════════════
     WIDGET INSERTION INTO TINYMCE
  ══════════════════════════════════════════════════ */

  function getTinyMCEBody() {
    // Inline mode: #tinymce in main document.
    let body = document.querySelector('#tinymce');
    if (body) return body;
    // IFrame mode: find iframe whose body is #tinymce.
    for (const iframe of document.querySelectorAll('iframe')) {
      try {
        const b = iframe.contentDocument && iframe.contentDocument.querySelector('#tinymce');
        if (b) return b;
      } catch (_) { /* cross-origin — skip */ }
    }
    return null;
  }

  function buildWidgetHtml(ev, customTitle) {
    const id = 'ac-ew-' + Math.random().toString(36).slice(2, 12);
    const titleText = customTitle || ev.title;
    const dateText = formatLong(ev);
    const where = (ev.community || ev.audiences?.[0] || 'Live Broadcast').replace(/\s+—\s+/g, ' • ');
    const editorUrl = ev.editorUrl || 'https://app.staffbase.com/studio/content/company-event/scheduled';

    // The outer .content-widget-wrapper + mceNonEditable matches Staffbase's
    // pattern so TinyMCE treats this as an atomic block.
    return `
<div class="content-widget-wrapper ac-ew-card-host mceNonEditable widget-overlay-menu-container widget-on-card"
     contenteditable="false"
     data-ac-event-widget="1"
     data-react-widget-id="${id}"
     data-ac-event-id="${escapeAttr(ev.id || '')}"
     data-ac-event-title="${escapeAttr(titleText)}">
  <div class="ac-ew-card">
    <div class="ac-ew-card-head">
      <div class="ac-ew-card-title">${escapeHtml(titleText)}</div>
      <a class="ac-ew-card-add" href="${escapeAttr(editorUrl)}" target="_blank" rel="noopener">+ Add to Calendar</a>
    </div>
    <div class="ac-ew-card-meta">
      <div><b>When:</b> ${escapeHtml(dateText)}</div>
      <div><b>Where:</b> ${escapeHtml(where)}</div>
    </div>
    <div class="ac-ew-card-rsvp">
      <div class="ac-ew-card-rsvp-prompt">Will you be attending?</div>
      <div class="ac-ew-card-rsvp-btns">
        <button class="ac-ew-card-rsvp-btn yes" type="button">Yes</button>
        <button class="ac-ew-card-rsvp-btn no" type="button">No</button>
      </div>
    </div>
  </div>
</div><p><br></p>`;
  }

  function injectStylesIntoEditorDoc(doc) {
    if (!doc || doc.getElementById('ac-ew-editor-styles')) return;
    const s = doc.createElement('style');
    s.id = 'ac-ew-editor-styles';
    s.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(s);
  }

  function insertEventWidget(ev, customTitle) {
    const html = buildWidgetHtml(ev, customTitle);

    // Preferred path: use TinyMCE's API if exposed.
    const tinymce = window.tinymce || (window.parent && window.parent.tinymce);
    if (tinymce && tinymce.activeEditor) {
      const ed = tinymce.activeEditor;
      injectStylesIntoEditorDoc(ed.getDoc?.());
      ed.insertContent(html);
      ed.focus();
      return;
    }

    // Fallback: manually splice into the contentEditable body at the
    // current selection (or end of content).
    const body = getTinyMCEBody();
    if (!body) {
      console.warn('[AC Event Widget] TinyMCE body not found — widget not inserted.');
      return;
    }
    injectStylesIntoEditorDoc(body.ownerDocument);
    const range = body.ownerDocument.getSelection().rangeCount
      ? body.ownerDocument.getSelection().getRangeAt(0)
      : null;
    const tmp = body.ownerDocument.createElement('div');
    tmp.innerHTML = html;
    const frag = body.ownerDocument.createDocumentFragment();
    while (tmp.firstChild) frag.appendChild(tmp.firstChild);
    if (range && body.contains(range.commonAncestorContainer)) {
      range.collapse(false);
      range.insertNode(frag);
    } else {
      body.appendChild(frag);
    }
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

  function fmt12(h, m) {
    const ap = h < 12 ? 'AM' : 'PM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m || 0).padStart(2,'0')} ${ap}`;
  }
  function formatLong(ev) {
    const M = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
    const d = new Date(ev.date + 'T00:00:00');
    return `${M[d.getMonth()+1]} ${d.getDate()}, ${d.getFullYear()} · ${fmt12(ev.startHour, ev.startMin)}`;
  }
  function formatPickerDate(ev) {
    const M = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const d = new Date(ev.date + 'T00:00:00');
    return `${M[d.getMonth()+1]} ${d.getDate()}, ${fmt12(ev.startHour, ev.startMin)}`;
  }

  /* ══════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════ */

  function init() {
    injectStyles();
    startPaletteObserver();

    // Inject editor styles into any TinyMCE iframe that's already mounted.
    setInterval(() => {
      document.querySelectorAll('iframe').forEach(f => {
        try { injectStylesIntoEditorDoc(f.contentDocument); } catch (_) {}
      });
      const body = document.querySelector('#tinymce');
      if (body) injectStylesIntoEditorDoc(body.ownerDocument);
    }, 1500);
  }

  // SPA navigation — re-run if the editor remounts.
  const _push = history.pushState.bind(history);
  history.pushState = function (...args) {
    _push(...args);
    setTimeout(init, 400);
  };
  window.addEventListener('popstate', () => setTimeout(init, 400));

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
