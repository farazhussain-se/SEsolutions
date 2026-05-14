// ==UserScript==
// @name         Staffbase News — Air Canada Event Widget
// @namespace    https://aircanada.staffbase.com/
// @version      1.0.0
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

    /* Event picker modal — modelled on the User Profile Widget popup */
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
    }
    .ac-ew-modal-head {
      padding: 22px 28px 16px; text-align: center;
      border-bottom: 1px solid #eef0f3;
    }
    .ac-ew-modal-head h2 {
      margin: 0; font-size: 18px; font-weight: 700; color: #111827;
    }
    .ac-ew-modal-body {
      padding: 22px 28px; overflow-y: auto; flex: 1;
    }
    .ac-ew-section {
      margin-bottom: 22px;
    }
    .ac-ew-section h3 {
      font-size: 14px; font-weight: 700; color: #111827;
      margin: 0 0 14px;
    }
    .ac-ew-field {
      display: grid;
      grid-template-columns: 130px 1fr;
      align-items: center;
      gap: 12px;
      margin-bottom: 14px;
    }
    .ac-ew-field-label {
      font-size: 13px; color: #374151;
    }
    .ac-ew-field-help {
      display: inline-block;
      width: 14px; height: 14px; border-radius: 50%;
      background: #e5e7eb; color: #6b7280;
      font-size: 10px; text-align: center; line-height: 14px;
      margin-left: 4px;
    }
    .ac-ew-input, .ac-ew-select {
      width: 100%;
      border: 1px solid #d1d5db; border-radius: 6px;
      padding: 8px 10px; font-size: 13px; background: #fff;
      font-family: inherit;
    }
    .ac-ew-input:focus, .ac-ew-select:focus {
      outline: none; border-color: #D82F2F;
      box-shadow: 0 0 0 3px rgba(216,47,47,.12);
    }
    .ac-ew-device-row {
      display: flex; gap: 8px;
    }
    .ac-ew-device-btn {
      width: 44px; height: 36px;
      border: 1px solid #d1d5db; border-radius: 6px;
      background: #2563eb; color: #fff; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
    }
    .ac-ew-device-btn svg { width: 18px; height: 18px; fill: currentColor; }
    .ac-ew-device-btn.off { background: #fff; color: #6b7280; }
    .ac-ew-radio-row { display: flex; flex-direction: column; gap: 6px; }
    .ac-ew-radio-row label {
      display: flex; align-items: center; gap: 8px;
      font-size: 13px; color: #374151; cursor: pointer;
    }
    .ac-ew-radio-row input[type=radio] { accent-color: #D82F2F; }

    .ac-ew-modal-foot {
      display: flex; gap: 10px; justify-content: space-between;
      padding: 16px 28px 22px;
      border-top: 1px solid #eef0f3;
    }
    .ac-ew-btn {
      padding: 10px 22px; border-radius: 6px; font-size: 14px;
      font-weight: 600; cursor: pointer; border: 0; font-family: inherit;
      transition: all .15s ease;
      min-width: 140px;
    }
    .ac-ew-btn-cancel {
      background: #fff; color: #374151; border: 1px solid #d1d5db;
    }
    .ac-ew-btn-cancel:hover { background: #f9fafb; }
    .ac-ew-btn-ok {
      background: #2563eb; color: #fff;
    }
    .ac-ew-btn-ok:hover { background: #1d4ed8; }
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
     Staffbase's Add Widget palette is mounted into the
     DOM each time it opens. We detect it by looking for
     a container whose descendants include known tile
     labels ("Static Content", "User Profile", etc.),
     then clone an existing tile to keep the styling.
  ══════════════════════════════════════════════════ */

  // Labels that uniquely identify the Add Widget palette.
  const PALETTE_LABEL_SIGNATURES = ['Static Content', 'User Profile', 'Infobox', 'Accordion'];

  function findPaletteContainer(root) {
    // Walk added subtree looking for an element whose textContent contains
    // at least 3 of the known labels (the palette grid).
    if (!(root instanceof HTMLElement)) return null;
    if (root.querySelector('[data-ac-ew-tile]')) return null;  // already injected
    const txt = root.textContent || '';
    const hits = PALETTE_LABEL_SIGNATURES.filter(l => txt.includes(l)).length;
    if (hits < 3) return null;
    return findGridCommonAncestor(root);
  }

  function findGridCommonAncestor(root) {
    // Find each label's element, then find their nearest common ancestor.
    const labelEls = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let n;
    while ((n = walker.nextNode())) {
      const t = (n.nodeValue || '').trim();
      if (PALETTE_LABEL_SIGNATURES.includes(t)) labelEls.push(n.parentElement);
      if (labelEls.length >= 3) break;
    }
    if (labelEls.length < 2) return null;

    // Walk up from labelEls[0] until the ancestor contains all the others.
    let anc = labelEls[0];
    while (anc && !labelEls.every(el => anc.contains(el))) anc = anc.parentElement;
    if (!anc) return null;

    // The grid is usually the *direct* parent of each tile. labelEls[0]
    // is the label inside a tile; walk up to the tile, then return its parent.
    let tile = labelEls[0];
    while (tile && tile.parentElement && tile.parentElement.contains(labelEls[1])) {
      // climb until the next step would put a sibling out of the parent
      const nextUp = tile.parentElement;
      if (nextUp === anc || nextUp.parentElement === anc) { tile = nextUp; break; }
      tile = nextUp;
    }
    return tile && tile.parentElement ? { grid: tile.parentElement, sampleTile: tile } : null;
  }

  // Inline calendar SVG matching the style of other tile icons.
  const TILE_CALENDAR_SVG = `<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#1a1a1a" stroke-width="1.6"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/></svg>`;

  function injectEventTile(grid, sampleTile) {
    if (grid.querySelector('[data-ac-ew-tile]')) return;

    const tile = sampleTile.cloneNode(true);
    tile.setAttribute('data-ac-ew-tile', '1');
    tile.classList.add('ac-ew-injected-tile');

    // Replace icon: assume the first svg or image inside the tile is the icon.
    const icon = tile.querySelector('svg, img');
    if (icon) {
      const wrap = document.createElement('span');
      wrap.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:' +
        (icon.getAttribute('width') || 32) + 'px;height:' + (icon.getAttribute('height') || 32) + 'px;';
      wrap.innerHTML = TILE_CALENDAR_SVG;
      icon.replaceWith(wrap.firstChild);
    }

    // Replace label: find the text node containing the original label.
    const txtNode = walkFindLabel(tile);
    if (txtNode) {
      txtNode.parentElement.setAttribute('data-ac-ew-label', '1');
      txtNode.nodeValue = 'Event';
    }

    // Strip any href/links that might trigger the original tile's behaviour.
    tile.querySelectorAll('a[href]').forEach(a => a.removeAttribute('href'));

    // Click handler: close the palette and open our picker.
    tile.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeStaffbasePalette();
      openEventPicker();
    }, true);

    grid.appendChild(tile);
  }

  function walkFindLabel(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const t = (n.nodeValue || '').trim();
      if (t && t.length < 40 && /^[A-Z]/.test(t)) return n;
    }
    return null;
  }

  function closeStaffbasePalette() {
    // The Cancel button in Staffbase's palette closes it.
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
          const found = findPaletteContainer(node);
          if (found) injectEventTile(found.grid, found.sampleTile);
        }
      }
    });
    _paletteObs.observe(document.body, { childList: true, subtree: true });
    // Also handle a palette that's already open at script load.
    const found = findPaletteContainer(document.body);
    if (found) injectEventTile(found.grid, found.sampleTile);
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
            <div class="ac-ew-field">
              <span class="ac-ew-field-label">Title:</span>
              <input class="ac-ew-input" id="ac-ew-title-input" placeholder="">
            </div>
            <div class="ac-ew-field">
              <span class="ac-ew-field-label">Show on: <span class="ac-ew-field-help">?</span></span>
              <div class="ac-ew-device-row">
                <button class="ac-ew-device-btn" data-device="desktop" title="Desktop"><svg viewBox="0 0 24 24"><path d="M21 3H3a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h7v2H7v2h10v-2h-3v-2h7a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 13H3V5h18v11z"/></svg></button>
                <button class="ac-ew-device-btn" data-device="tablet" title="Tablet"><svg viewBox="0 0 24 24"><path d="M19 0H5a3 3 0 0 0-3 3v18a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V3a3 3 0 0 0-3-3zM12 22a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm8-4H4V4h16v14z"/></svg></button>
                <button class="ac-ew-device-btn" data-device="mobile" title="Mobile"><svg viewBox="0 0 24 24"><path d="M17 1H7a3 3 0 0 0-3 3v16a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V4a3 3 0 0 0-3-3zm-5 21a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm6-4H6V4h12v15z"/></svg></button>
              </div>
            </div>
            <div class="ac-ew-field">
              <span class="ac-ew-field-label">Visibility in the App: <span class="ac-ew-field-help">?</span></span>
              <div class="ac-ew-radio-row">
                <label><input type="radio" name="ac-ew-vis" value="all" checked> For all users</label>
                <label><input type="radio" name="ac-ew-vis" value="groups"> For selected groups</label>
              </div>
            </div>
          </div>
          <div class="ac-ew-section">
            <h3>Event Data</h3>
            <div class="ac-ew-field">
              <span class="ac-ew-field-label">Event:</span>
              <select class="ac-ew-select" id="ac-ew-event-select"></select>
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
