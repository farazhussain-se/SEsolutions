// ==UserScript==
// @name         Staffbase Analytics – Compass AI
// @namespace    staffbase-se-solutions
// @version      2.1.0
// @description  Gemini-powered "Compass AI" for Staffbase Studio analytics — reads the live analytics API and answers in natural language (LLM via the Gemini API)
// @author       Faraz Hussain
// @match        *://*.staffbase.com/studio/analytics*
// @match        *://*.staffbase.rocks/studio/analytics*
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      generativelanguage.googleapis.com
// ==/UserScript==

(function () {
  'use strict';

  const PANEL_ID   = 'sb-ai-panel';
  const BTN_ID     = 'sb-ai-btn';
  const STYLES_ID  = 'sb-ai-styles';

  /* ─── Gemini (direct API via GM_xmlhttpRequest) ────────────── */
  // Replify's Supabase proxy is origin-locked (no CORS for staffbase.*),
  // so a page-context fetch can't reach it. We instead call Google's
  // Gemini API directly through GM_xmlhttpRequest, which isn't bound by
  // the page's CORS policy. The key is read from localStorage so it never
  // lives in source control — set it once in the browser console:
  //   localStorage.setItem('compassGeminiKey', 'AIza…')
  const GEMINI_MODEL    = 'gemini-2.5-flash';
  const GEMINI_KEY_LS   = 'compassGeminiKey';
  const GEMINI_ENDPOINT = m => 'https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent';

  function getGeminiKey() {
    try { return (localStorage.getItem(GEMINI_KEY_LS) || '').trim(); } catch (_) { return ''; }
  }

  // Cross-origin POST that bypasses the page CORS policy (Tampermonkey /
  // Greasemonkey). Resolves with the parsed JSON body.
  function gmPost(url, payload) {
    const gmx = (typeof GM_xmlhttpRequest !== 'undefined') ? GM_xmlhttpRequest
              : (typeof GM !== 'undefined' && GM.xmlHttpRequest) ? GM.xmlHttpRequest
              : null;
    if (!gmx) {
      return Promise.reject(new Error('GM_xmlhttpRequest unavailable — run this in Tampermonkey with @grant GM_xmlhttpRequest.'));
    }
    return new Promise((resolve, reject) => {
      gmx({
        method: 'POST',
        url,
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify(payload),
        timeout: 45000,
        onload: r => {
          if (r.status >= 200 && r.status < 300) {
            try { resolve(JSON.parse(r.responseText)); }
            catch (_) { reject(new Error('Gemini returned malformed JSON.')); }
          } else {
            let detail = r.status;
            try { const e = JSON.parse(r.responseText); detail = (e.error && (e.error.message || e.error)) || detail; } catch (_) {}
            reject(new Error('Gemini API ' + detail));
          }
        },
        onerror:   () => reject(new Error('Gemini request failed (network).')),
        ontimeout: () => reject(new Error('Gemini request timed out.')),
      });
    });
  }

  /* ─── Live analytics API ────────────────────────────────────── */
  // Default window = last 7 days (the analytics UI keeps its own range in
  // component state, not the URL, so we pick a sane default to report on).
  function dateRange(days) {
    const until = new Date();
    const since = new Date(until.getTime() - (days || 7) * 864e5);
    return { since: since.toISOString(), until: until.toISOString(), label: 'past ' + (days || 7) + ' days' };
  }

  // Same-origin fetch on the logged-in session. If Replify's analytics
  // demo-mocker is active, these endpoints return its scaled numbers —
  // which is exactly what you want the chatbot to narrate in a demo.
  async function apiGet(path) {
    const res = await fetch(path, { credentials: 'include', headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(path.split('?')[0] + ' → ' + res.status);
    return res.json();
  }

  const settled = r => (r && r.status === 'fulfilled') ? r.value : null;

  function mapTopPosts(r) {
    if (!r || !Array.isArray(r.ranking)) return [];
    const posts = (r.entities && r.entities.posts) || {};
    return r.ranking.slice(0, 10).map(item => {
      const id = item && item.group && item.group.postId;
      return {
        title:    (id && posts[id] && posts[id].title) || 'Untitled',
        visits:   item.registeredVisits,
        visitors: item.registeredVisitors,
        likes:    item.likes,
        comments: item.comments,
        shares:   item.shares,
      };
    });
  }

  async function fetchAnalytics(page) {
    const range = dateRange(7);
    const qs = 'since=' + encodeURIComponent(range.since) + '&until=' + encodeURIComponent(range.until);

    if (page === 'news') {
      const [agg, ts, rank] = await Promise.allSettled([
        apiGet('/api/branch/analytics/posts/stats/aggregated?' + qs),
        apiGet('/api/branch/analytics/posts/timeseries?' + qs + '&groupBy=day'),
        apiGet('/api/branch/analytics/posts/rankings?' + qs + '&limit=10'),
      ]);
      const tsv = settled(ts);
      return {
        page, range,
        aggregated: settled(agg),
        timeseries: (tsv && Array.isArray(tsv.timeseries) ? tsv.timeseries : []).slice(-14),
        topPosts: mapTopPosts(settled(rank)),
      };
    }

    if (page === 'pages') {
      const [stats, rank, ts] = await Promise.allSettled([
        apiGet('/api/branch/analytics/pages/stats?' + qs),
        apiGet('/api/branch/analytics/pages/ranking?' + qs + '&limit=10'),
        apiGet('/api/branch/analytics/pages/timeseries?' + qs),
      ]);
      const rk = settled(rank), tsv = settled(ts);
      return {
        page, range,
        stats: settled(stats),
        topPages: ((rk && rk.data) || []).slice(0, 10).map(p => ({
          title: p.title || p.name || p.id, views: p.views, viewers: p.viewers, bounceRate: p.bounceRate,
        })),
        timeseries: ((tsv && tsv.data) || []).slice(-14),
      };
    }

    if (page === 'users') {
      const u = await apiGet('/api/branch/analytics/v2/users/timeseries?' + qs + '&groupBy=day').catch(() => null);
      return { page, range, total: u && u.total, timeseries: ((u && u.timeseries) || []).slice(-14) };
    }

    if (page === 'email') {
      const o = await apiGet('/api/email-analytics/overview?' + qs).catch(() => null);
      return { page, range, overview: o };
    }

    // Fallback: try the news aggregate so the assistant still has something real.
    try {
      return { page, range, aggregated: await apiGet('/api/branch/analytics/posts/stats/aggregated?' + qs) };
    } catch (_) {
      return { page, range, note: 'No analytics endpoint is mapped for this tab yet.' };
    }
  }

  /* ─── Gemini call ───────────────────────────────────────────── */
  async function callGemini(question, page, data, history) {
    const key = getGeminiKey();
    if (!key) {
      throw new Error('No Gemini API key set. In the browser console run: localStorage.setItem(\'compassGeminiKey\',\'AIza…\') then retry.');
    }
    const NL = String.fromCharCode(10);
    const transcript = (history || [])
      .filter(m => m.role)
      .slice(-6)
      .map(m => (m.role === 'user' ? 'User' : 'Compass') + ': ' + m.text)
      .join(NL);

    const dataJson = JSON.stringify(data, null, 2).slice(0, 12000);
    const prompt = [
      'You are "Compass AI", an analytics assistant embedded in Staffbase Studio.',
      'You are viewing the **' + page + '** analytics tab for the ' + (data && data.range ? data.range.label : 'selected period') + '.',
      'Answer the user using ONLY the live analytics JSON below. Be concise and specific, quote the real numbers, and add brief interpretation where it helps. Do not invent metrics that are not present; if the data does not contain the answer, say so briefly.',
      '',
      'LIVE ANALYTICS DATA (JSON):',
      dataJson,
      '',
      transcript ? ('Conversation so far:' + NL + transcript + NL) : '',
      'User question: "' + question + '"',
      '',
      'Respond with ONLY a JSON object (no markdown fences) of this exact shape:',
      '{"text": "1-2 sentence direct answer", "bullets": ["3-5 short supporting points, each quoting a real number from the data"], "followUps": ["2 natural follow-up questions the user might ask next"]}',
    ].join(NL);

    const json = await gmPost(GEMINI_ENDPOINT(GEMINI_MODEL) + '?key=' + encodeURIComponent(key), {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
    });

    const text = (((json.candidates || [])[0] || {}).content || {}).parts;
    const raw  = (text && text[0] && text[0].text) || '';
    const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();

    let parsed;
    try { parsed = JSON.parse(cleaned); }
    catch (_) { parsed = { text: cleaned || 'I could not parse a response.', bullets: [], followUps: [] }; }

    return {
      text:      parsed.text || 'No answer returned.',
      bullets:   Array.isArray(parsed.bullets) ? parsed.bullets : [],
      followUps: Array.isArray(parsed.followUps) ? parsed.followUps : [],
    };
  }

  /* ─── Suggested prompts per page ───────────────────────────── */
  const PROMPTS = {
    news:  ['Summarise news performance this week', 'Which channel had the most visits?', 'How do likes compare to comments?', 'What drove the spike in new posts?'],
    pages: ['Summarise page views this week', 'Which pages had the most traffic?', 'Are there pages with no visits?', 'What caused the 64% increase in views?'],
    users: ['Summarise user activity this week', 'What\'s the user engagement funnel?', 'Why did active users drop 12%?', 'How many users are fully engaged?'],
    default: ['Summarise analytics performance', 'What\'s driving engagement?', 'Show me the top metrics', 'What should I focus on?'],
  };

  /* ─── Utilities ─────────────────────────────────────────────── */
  function getCurrentPage() {
    const p = window.location.pathname;
    if (p.includes('/analytics/news'))        return 'news';
    if (p.includes('/analytics/pages'))       return 'pages';
    if (p.includes('/analytics/users'))       return 'users';
    if (p.includes('/analytics/email'))       return 'email';
    if (p.includes('/analytics/chat'))        return 'chat';
    if (p.includes('/analytics/hashtags'))    return 'hashtags';
    if (p.includes('/analytics/communities')) return 'communities';
    return 'default';
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }


  /* ─── State ─────────────────────────────────────────────────── */
  let messages = [];
  let convEl   = null;
  let inputEl  = null;
  let isOpen   = false;

  /* ─── CSS ───────────────────────────────────────────────────── */
  const CSS = `
    #${BTN_ID}{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:6px;border:none;background:none;cursor:pointer;font-family:Inter,sans-serif;font-size:14px;font-weight:500;color:#004EB9;transition:background .15s;white-space:nowrap;}
    #${BTN_ID}:hover{background:#EEF4FF;}
    #${BTN_ID} .sbai-spark{background:linear-gradient(135deg,#004EB9,#7B3FE4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}

    #${PANEL_ID}{position:fixed;top:0;right:-400px;width:370px;height:100vh;background:#fff;border-left:1px solid #e5e9f0;box-shadow:-6px 0 32px rgba(0,0,0,.1);z-index:9999;display:flex;flex-direction:column;font-family:Inter,sans-serif;transition:right .28s cubic-bezier(.4,0,.2,1);}
    #${PANEL_ID}.open{right:0;}

    .sbai-hd{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #e5e9f0;flex-shrink:0;}
    .sbai-hd-title{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:#171719;}
    .sbai-hd-title .spark{font-size:15px;background:linear-gradient(135deg,#004EB9,#7B3FE4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
    .sbai-hd-btns{display:flex;gap:2px;}
    .sbai-ic{display:flex;align-items:center;justify-content:center;width:30px;height:30px;border:none;background:none;border-radius:6px;cursor:pointer;color:#7a7d8a;transition:background .15s;}
    .sbai-ic:hover{background:#f4f5f7;color:#171719;}

    .sbai-chat-sub{font-size:11px;color:#adb0bb;padding:8px 18px 0;font-weight:500;}

    .sbai-conv{flex:1;overflow-y:auto;padding:20px 16px;display:flex;flex-direction:column;gap:16px;}

    .sbai-intro{display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;margin-top:24px;}
    .sbai-intro-icon{font-size:26px;background:linear-gradient(135deg,#004EB9,#7B3FE4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
    .sbai-intro h2{font-size:15px;font-weight:600;color:#171719;margin:0;}
    .sbai-intro p{font-size:13px;color:#535560;margin:0;line-height:1.5;}
    .sbai-chips{display:flex;flex-wrap:wrap;gap:7px;justify-content:center;margin-top:6px;}
    .sbai-chip{padding:7px 13px;border:1px solid #e5e9f0;border-radius:18px;background:#fff;font-size:12.5px;color:#004EB9;cursor:pointer;font-family:Inter,sans-serif;transition:all .15s;text-align:left;line-height:1.4;}
    .sbai-chip:hover{background:#EEF4FF;border-color:#004EB9;}

    .sbai-msg{display:flex;flex-direction:column;gap:4px;}
    .sbai-msg--user{align-items:flex-end;}
    .sbai-msg--ai{align-items:flex-start;}
    .sbai-bubble{max-width:92%;padding:10px 14px;border-radius:12px;font-size:13.5px;line-height:1.55;}
    .sbai-bubble--user{background:#EEF4FF;color:#171719;border-bottom-right-radius:3px;}
    .sbai-bubble--ai{background:#f8f9fa;color:#171719;border:1px solid #e9eaed;border-bottom-left-radius:3px;}
    .sbai-bubble--ai ul{margin:8px 0 0;padding-left:18px;}
    .sbai-bubble--ai li{margin-bottom:4px;font-size:13px;line-height:1.5;}
    .sbai-fb{display:flex;gap:2px;margin-top:4px;padding-left:2px;}
    .sbai-fb-btn{display:flex;align-items:center;justify-content:center;width:26px;height:26px;border:none;background:none;border-radius:5px;cursor:pointer;color:#adb0bb;font-size:12px;transition:all .15s;}
    .sbai-fb-btn:hover{background:#f4f5f7;color:#171719;}
    .sbai-follow{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;padding-left:2px;}
    .sbai-follow-chip{padding:5px 11px;border:1px solid #e5e9f0;border-radius:14px;background:#fff;font-size:11.5px;color:#004EB9;cursor:pointer;font-family:Inter,sans-serif;transition:all .15s;}
    .sbai-follow-chip:hover{background:#EEF4FF;border-color:#004EB9;}

    .sbai-typing{display:flex;align-items:center;gap:4px;padding:10px 14px;background:#f8f9fa;border:1px solid #e9eaed;border-radius:12px;border-bottom-left-radius:3px;width:56px;}
    .sbai-dot{width:5px;height:5px;background:#adb0bb;border-radius:50%;animation:sbDot 1.2s ease-in-out infinite;}
    .sbai-dot:nth-child(2){animation-delay:.2s;}
    .sbai-dot:nth-child(3){animation-delay:.4s;}
    @keyframes sbDot{0%,60%,100%{transform:scale(1);opacity:.4;}30%{transform:scale(1.5);opacity:1;}}

    .sbai-ft{padding:10px 14px 14px;border-top:1px solid #e5e9f0;flex-shrink:0;}
    .sbai-ctx{background:#f8f9fa;border:1px solid #e5e9f0;border-radius:10px;padding:10px 12px;}
    .sbai-ctx-label{font-size:10.5px;font-weight:600;color:#adb0bb;text-transform:uppercase;letter-spacing:.5px;margin-bottom:7px;}
    .sbai-input-row{display:flex;align-items:flex-end;gap:6px;}
    .sbai-input{flex:1;border:none;background:transparent;font-family:Inter,sans-serif;font-size:13.5px;color:#171719;resize:none;outline:none;min-height:20px;max-height:110px;line-height:1.5;overflow:hidden;}
    .sbai-input::placeholder{color:#c2c4cc;}
    .sbai-plus{font-size:17px;color:#adb0bb;cursor:pointer;background:none;border:none;padding:0 2px;line-height:1;transition:color .15s;flex-shrink:0;}
    .sbai-plus:hover{color:#535560;}
    .sbai-send{width:30px;height:30px;border-radius:7px;border:none;background:#004EB9;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s;}
    .sbai-send:hover{background:#003A8C;}
    .sbai-send:disabled{background:#e5e9f0;cursor:not-allowed;}
    .sbai-disc{font-size:11px;color:#adb0bb;margin-top:7px;text-align:center;}
    .sbai-disc a{color:#004EB9;text-decoration:none;}
    .sbai-disc a:hover{text-decoration:underline;}
  `;

  /* ─── Render helpers ────────────────────────────────────────── */
  function renderIntro() {
    const page    = getCurrentPage();
    const prompts = PROMPTS[page] || PROMPTS.default;
    convEl.innerHTML = `
      <div class="sbai-intro">
        <div class="sbai-intro-icon">✦</div>
        <h2>Compass AI</h2>
        <p>I read this tab's live analytics and answer in plain language. Pick a prompt or ask me anything.</p>
        <div class="sbai-chips">
          ${prompts.map(p => `<button class="sbai-chip" data-p="${esc(p)}">${esc(p)}</button>`).join('')}
        </div>
      </div>`;
    convEl.querySelectorAll('.sbai-chip').forEach(b => b.addEventListener('click', () => send(b.dataset.p)));
  }

  function renderMsgs() {
    if (messages.length === 0) { renderIntro(); return; }

    convEl.innerHTML = messages.map(m => {
      if (m.role === 'user') {
        return `<div class="sbai-msg sbai-msg--user"><div class="sbai-bubble sbai-bubble--user">${esc(m.text)}</div></div>`;
      }
      const bullets = m.bullets?.length
        ? `<ul>${m.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : '';
      const follows = m.followUps?.length
        ? `<div class="sbai-follow">${m.followUps.map(f => `<button class="sbai-follow-chip" data-p="${esc(f)}">${esc(f)}</button>`).join('')}</div>` : '';
      return `
        <div class="sbai-msg sbai-msg--ai">
          <div class="sbai-bubble sbai-bubble--ai">
            ${esc(m.text)}${bullets}
          </div>
          <div class="sbai-fb">
            <button class="sbai-fb-btn" data-action="up">👍</button>
            <button class="sbai-fb-btn" data-action="down">👎</button>
            <button class="sbai-fb-btn" data-action="copy" data-text="${esc(m.text)}">📋</button>
          </div>
          ${follows}
        </div>`;
    }).join('');

    convEl.querySelectorAll('.sbai-follow-chip').forEach(b => b.addEventListener('click', () => send(b.dataset.p)));
    convEl.querySelectorAll('[data-action="copy"]').forEach(b => b.addEventListener('click', () => {
      navigator.clipboard?.writeText(b.dataset.text);
      b.textContent = '✓';
      setTimeout(() => { b.textContent = '📋'; }, 1500);
    }));
    convEl.scrollTop = convEl.scrollHeight;
  }

  function showTyping() {
    const d = document.createElement('div');
    d.id = 'sbai-typing-msg';
    d.className = 'sbai-msg sbai-msg--ai';
    d.innerHTML = `<div class="sbai-typing"><div class="sbai-dot"></div><div class="sbai-dot"></div><div class="sbai-dot"></div></div>`;
    convEl.appendChild(d);
    convEl.scrollTop = convEl.scrollHeight;
  }

  function hideTyping() {
    document.getElementById('sbai-typing-msg')?.remove();
  }

  /* ─── Send ──────────────────────────────────────────────────── */
  async function send(text) {
    if (!text?.trim()) return;
    text = text.trim();
    messages.push({ role: 'user', text });
    renderMsgs();
    if (inputEl) { inputEl.value = ''; inputEl.style.height = 'auto'; }
    showTyping();
    convEl.scrollTop = convEl.scrollHeight;

    const page = getCurrentPage();
    try {
      // 1. Pull the live analytics for this tab, 2. let Gemini narrate it.
      const data = await fetchAnalytics(page);
      const r = await callGemini(text, page, data, messages);
      hideTyping();
      messages.push({ role: 'ai', text: r.text, bullets: r.bullets, followUps: r.followUps });
      renderMsgs();
    } catch (err) {
      hideTyping();
      const msg = String((err && err.message) || err);
      const isLLM = /Gemini|GM_xmlhttpRequest|API key/i.test(msg);
      const hint = isLLM
        ? 'I couldn\'t reach the AI service. Set a Gemini API key once in the console — localStorage.setItem(\'compassGeminiKey\',\'AIza…\') — then retry.'
        : 'I couldn\'t load analytics for this tab. Make sure you\'re on a Studio analytics page and signed in.';
      messages.push({ role: 'ai', text: hint, bullets: [msg], followUps: [] });
      renderMsgs();
    }
  }

  /* ─── Panel open / close / new ──────────────────────────────── */
  function openPanel()  { isOpen = true;  document.getElementById(PANEL_ID)?.classList.add('open');    setTimeout(() => inputEl?.focus(), 300); }
  function closePanel() { isOpen = false; document.getElementById(PANEL_ID)?.classList.remove('open'); }
  function newConv() {
    messages = [];
    renderMsgs();
    if (inputEl) { inputEl.value = ''; inputEl.style.height = 'auto'; inputEl.focus(); }
    const lbl = document.getElementById('sbai-ctx-label');
    if (lbl) {
      const page = getCurrentPage();
      lbl.textContent = 'Context · ' + (page === 'default' ? 'Analytics' : page.charAt(0).toUpperCase() + page.slice(1)) + ' Analytics';
    }
  }

  /* ─── Build DOM ─────────────────────────────────────────────── */
  function buildPanel() {
    document.getElementById(PANEL_ID)?.remove();

    if (!document.getElementById(STYLES_ID)) {
      const s = document.createElement('style');
      s.id = STYLES_ID;
      s.textContent = CSS;
      document.head.appendChild(s);
    }

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="sbai-hd">
        <div class="sbai-hd-title">
          <span class="spark">✦</span> Compass AI
        </div>
        <div class="sbai-hd-btns">
          <button class="sbai-ic" id="sbai-hist" title="History">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M13 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7V3zm-1 5v5l4 2.4-1 1.7-5-3V8h2z"/></svg>
          </button>
          <button class="sbai-ic" id="sbai-new" title="New conversation">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          </button>
          <button class="sbai-ic" id="sbai-close" title="Close">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>
      </div>
      <div class="sbai-chat-sub">New Chat</div>
      <div class="sbai-conv" id="sbai-conv"></div>
      <div class="sbai-ft">
        <div class="sbai-ctx">
          <div class="sbai-ctx-label" id="sbai-ctx-label">Context · ${getCurrentPage() === 'default' ? 'Analytics' : getCurrentPage().charAt(0).toUpperCase() + getCurrentPage().slice(1)} Analytics</div>
          <div class="sbai-input-row">
            <button class="sbai-plus" title="Add context">+</button>
            <textarea class="sbai-input" id="sbai-input" placeholder="Ask questions about your data…" rows="1"></textarea>
            <button class="sbai-send" id="sbai-send" title="Send">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
          </div>
        </div>
        <div class="sbai-disc">AI assistant can make mistakes. Please double-check responses. <a href="#">Learn more</a></div>
      </div>`;

    document.body.appendChild(panel);

    convEl  = document.getElementById('sbai-conv');
    inputEl = document.getElementById('sbai-input');

    renderMsgs();

    document.getElementById('sbai-close').addEventListener('click', closePanel);
    document.getElementById('sbai-new').addEventListener('click', newConv);
    document.getElementById('sbai-send').addEventListener('click', () => send(inputEl.value));
    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(inputEl.value); }
    });
    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 110) + 'px';
    });

    // Close on outside click
    panel.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', e => {
      if (isOpen && !document.getElementById(BTN_ID)?.contains(e.target)) closePanel();
    });
  }

  function injectButton() {
    if (document.getElementById(BTN_ID)) return;
    const tier2 = document.querySelector('.ds-studio-header__tier-two');
    if (!tier2) return;
    const right = tier2.querySelector('.ds-studio-header__item:last-child');
    if (!right) return;

    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.innerHTML = `<span class="sbai-spark">✦</span> Compass AI`;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      isOpen ? closePanel() : openPanel();
    });
    right.insertBefore(btn, right.firstChild);
  }

  /* ─── Init + SPA nav ────────────────────────────────────────── */
  function updateContextLabel() {
    const lbl = document.getElementById('sbai-ctx-label');
    if (!lbl) return;
    const page = getCurrentPage();
    lbl.textContent = 'Context · ' +
      (page === 'default' ? 'Analytics' : page.charAt(0).toUpperCase() + page.slice(1)) + ' Analytics';
  }

  function resetConversation() {
    messages = [];
    if (convEl) renderMsgs();
    if (inputEl) { inputEl.value = ''; inputEl.style.height = 'auto'; }
    updateContextLabel();
  }

  // Override newConv to use shared reset
  newConv = resetConversation;

  function init() {
    injectButton();
    if (!document.getElementById(PANEL_ID)) buildPanel();
  }

  // Retry until the React header has rendered, then wire up once
  let attempts = 0;
  function tryInit() {
    if (document.querySelector('.ds-studio-header__tier-two') && location.pathname.includes('/analytics')) {
      init();
    } else if (attempts++ < 40) {
      setTimeout(tryInit, 300);
    }
  }
  tryInit();

  // Intercept History API pushState / replaceState — fires exactly once per navigation,
  // avoids the MutationObserver-on-body freeze on React SPAs.
  let navTimer = null;
  function onNavChange() {
    clearTimeout(navTimer);
    navTimer = setTimeout(() => {
      if (location.pathname.includes('/analytics')) {
        resetConversation();   // clear chat for the new tab
        updateContextLabel();
        injectButton();        // re-inject if React wiped the header
      } else {
        closePanel();
      }
    }, 250);
  }

  const _push    = history.pushState.bind(history);
  const _replace = history.replaceState.bind(history);
  history.pushState    = function(...a) { _push(...a);    onNavChange(); };
  history.replaceState = function(...a) { _replace(...a); onNavChange(); };
  window.addEventListener('popstate', onNavChange);

  // Lightweight MutationObserver scoped only to the header element —
  // re-injects the button if React re-renders and removes it.
  function watchHeader() {
    const header = document.querySelector('.ds-studio-header');
    if (!header) return;
    new MutationObserver(() => {
      if (location.pathname.includes('/analytics') && !document.getElementById(BTN_ID)) {
        injectButton();
      }
    }).observe(header, { childList: true, subtree: true });
  }
  // Wait for header, then attach the narrow observer
  (function waitForHeader() {
    if (document.querySelector('.ds-studio-header')) watchHeader();
    else setTimeout(waitForHeader, 400);
  })();

})();
