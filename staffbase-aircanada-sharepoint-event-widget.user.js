// ==UserScript==
// @name         Staffbase SharePoint — Air Canada Event Widget Renderer
// @namespace    https://aircanada.staffbase.com/
// @version      1.0.0
// @description  Renders the AC event widget card inside Staffbase article previews on SharePoint (demo)
// @author       Faraz Hussein · Staffbase SE Solutions
// @match        https://*.sharepoint.com/*
// @match        https://*.staffbase.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  /* ══════════════════════════════════════════════════
     EVENT DATA
     Hard-coded for the demo. To support multiple events
     later, derive from URL/post-id or localStorage.
  ══════════════════════════════════════════════════ */

  const EVENT = {
    title: 'Cleared for Departure',
    when: 'May 15, 2026 · 9:00 AM',
    where: 'Live - Townhall',
    editorUrl: 'https://app.staffbase.com/studio/content/company-event/scheduled',
  };

  /* ══════════════════════════════════════════════════
     CSS — slightly cleaner than the editor version:
     solid AC red (no gradient), tighter line-height,
     calendar glyph next to the title.
  ══════════════════════════════════════════════════ */

  const CSS = `
    .ac-sp-event-card {
      margin: 20px 0;
      border-radius: 12px;
      overflow: hidden;
      background: #fff;
      border: 1px solid #f0d3d3;
      box-shadow: 0 2px 6px rgba(0,0,0,0.04);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .ac-sp-event-head {
      background: #D82F2F;
      color: #fff;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .ac-sp-event-head-left {
      display: flex; align-items: center; gap: 10px;
      min-width: 0;
    }
    .ac-sp-event-icon {
      display: inline-flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; flex-shrink: 0;
      background: rgba(255,255,255,0.15);
      border-radius: 6px;
    }
    .ac-sp-event-icon svg { width: 18px; height: 18px; fill: #fff; }
    .ac-sp-event-title {
      font-size: 16px; font-weight: 700; line-height: 1.3;
      color: #fff;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .ac-sp-event-add,
    .ac-sp-event-add:link,
    .ac-sp-event-add:visited,
    .ac-sp-event-add:hover,
    .ac-sp-event-add:active {
      font-size: 12px; font-weight: 600;
      color: #fff !important;
      text-decoration: none !important;
      padding: 6px 14px; border-radius: 999px;
      background: rgba(255,255,255,0.18);
      border: 1px solid rgba(255,255,255,0.35);
      white-space: nowrap; flex-shrink: 0;
    }
    .ac-sp-event-add:hover { background: rgba(255,255,255,0.28); }
    .ac-sp-event-meta {
      padding: 14px 20px;
      font-size: 14px; color: #374151;
      background: #fff;
      line-height: 1.55;
    }
    .ac-sp-event-meta div { margin-bottom: 4px; }
    .ac-sp-event-meta div:last-child { margin-bottom: 0; }
    .ac-sp-event-meta b { color: #111827; font-weight: 600; }
    .ac-sp-event-rsvp {
      background: #fef4f4;
      border-top: 1px solid #fce8e8;
      padding: 12px 20px;
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px;
    }
    .ac-sp-event-rsvp-prompt {
      font-size: 14px; font-weight: 600; color: #111827;
    }
    .ac-sp-event-rsvp-btns { display: flex; gap: 8px; }
    .ac-sp-event-rsvp-btn {
      padding: 7px 22px; border-radius: 999px;
      font-size: 13px; font-weight: 600; cursor: pointer;
      font-family: inherit; border: 1px solid transparent;
      transition: background .15s, color .15s;
    }
    .ac-sp-event-rsvp-btn.yes        { background: #D82F2F; color: #fff; }
    .ac-sp-event-rsvp-btn.yes:hover  { background: #b12525; }
    .ac-sp-event-rsvp-btn.yes.on     { background: #b12525; }
    .ac-sp-event-rsvp-btn.no         { background: #fff; color: #374151; border-color: #d1d5db; }
    .ac-sp-event-rsvp-btn.no:hover   { background: #f9fafb; }
    .ac-sp-event-rsvp-btn.no.on      { background: #f3f4f6; }
  `;

  function injectStyles(doc) {
    doc = doc || document;
    if (doc.getElementById('ac-sp-event-styles')) return;
    const s = doc.createElement('style');
    s.id = 'ac-sp-event-styles';
    s.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(s);
  }

  const CALENDAR_SVG = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3h-1V1h-2v2H8V1H6v2H5C3.9 2 3 2.9 3 4v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 18H5V8h14v13zm0-15H5V4h14v2zM7 10h4v4H7z"/></svg>`;

  function buildCardHtml() {
    return `
<div class="ac-sp-event-card" data-ac-sp-event-card="1" contenteditable="false">
  <div class="ac-sp-event-head">
    <div class="ac-sp-event-head-left">
      <span class="ac-sp-event-icon">${CALENDAR_SVG}</span>
      <span class="ac-sp-event-title">${EVENT.title}</span>
    </div>
    <a class="ac-sp-event-add" href="${EVENT.editorUrl}" target="_blank" rel="noopener">+ Add to Calendar</a>
  </div>
  <div class="ac-sp-event-meta">
    <div><b>When:</b> ${EVENT.when}</div>
    <div><b>Where:</b> ${EVENT.where}</div>
  </div>
  <div class="ac-sp-event-rsvp">
    <div class="ac-sp-event-rsvp-prompt">Will you be attending?</div>
    <div class="ac-sp-event-rsvp-btns">
      <button class="ac-sp-event-rsvp-btn yes" type="button">Yes</button>
      <button class="ac-sp-event-rsvp-btn no"  type="button">No</button>
    </div>
  </div>
</div>`.trim();
  }

  /* ══════════════════════════════════════════════════
     INJECTION
  ══════════════════════════════════════════════════ */

  function injectIntoArticle(article) {
    if (!article) return;
    const doc = article.ownerDocument;
    injectStyles(doc);

    // Find the content section that the article body lives in.
    const content = article.querySelector('.news-detail-post-content, .rich-text');
    if (!content) return;
    if (content.querySelector('[data-ac-sp-event-card]')) return;

    const wrapper = doc.createElement('div');
    wrapper.innerHTML = buildCardHtml();
    const card = wrapper.firstChild;
    wireRsvp(card);

    // Insert after the first paragraph if there are 2+, otherwise append.
    const paragraphs = content.querySelectorAll(':scope > p');
    if (paragraphs.length >= 1) paragraphs[0].after(card);
    else content.appendChild(card);
  }

  function wireRsvp(card) {
    const yes = card.querySelector('.ac-sp-event-rsvp-btn.yes');
    const no  = card.querySelector('.ac-sp-event-rsvp-btn.no');
    const set = (winner, loser) => {
      winner.classList.add('on');
      loser.classList.remove('on');
    };
    yes.addEventListener('click', (e) => { e.preventDefault(); set(yes, no); });
    no.addEventListener('click',  (e) => { e.preventDefault(); set(no, yes); });
  }

  function sweep(root) {
    (root || document).querySelectorAll('article.feed-post-detail').forEach(injectIntoArticle);
  }

  /* ══════════════════════════════════════════════════
     OBSERVERS
     The SharePoint shell embeds Staffbase content with
     SPA-style navigation, so re-sweep on DOM changes.
     Also reach into same-origin iframes (no-op for
     cross-origin frames, which the script @match will
     instead enter directly).
  ══════════════════════════════════════════════════ */

  let _obs = null;
  function startObserver() {
    if (_obs) return;
    _obs = new MutationObserver(muts => {
      let touched = false;
      for (const m of muts) {
        if (m.addedNodes.length) { touched = true; break; }
      }
      if (touched) sweep(document);
    });
    _obs.observe(document.body, { childList: true, subtree: true });
  }

  function sweepIframes() {
    document.querySelectorAll('iframe').forEach(f => {
      try {
        if (f.contentDocument) sweep(f.contentDocument);
      } catch (_) { /* cross-origin — script runs there directly via @match */ }
    });
  }

  /* ══════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════ */

  function init() {
    injectStyles(document);
    startObserver();
    sweep(document);
    sweepIframes();
    setInterval(sweepIframes, 2000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
