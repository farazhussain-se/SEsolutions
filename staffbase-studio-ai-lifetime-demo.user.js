// ==UserScript==
// @name         Staffbase Analytics – Studio AI (Life Time canned demo)
// @namespace    staffbase-se-solutions
// @version      1.0.0
// @description  "Studio AI" for the Life Time Studio — no LLM, no API key. Ships with three scripted answers on club app adoption, part-time/full-time activation, and Navigator ticket deflection.
// @author       Faraz Hussain
// @match        *://lifetime-inc.staffbase.rocks/studio*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/farazhussain-se/SEsolutions/main/staffbase-studio-ai-lifetime-demo.user.js
// @downloadURL  https://raw.githubusercontent.com/farazhussain-se/SEsolutions/main/staffbase-studio-ai-lifetime-demo.user.js
// ==/UserScript==

(function () {
  'use strict';

  // This build intentionally has NO LLM call and NO API key prompt — every
  // answer below is scripted for the Life Time demo (lifetime-inc.staffbase.rocks),
  // covering the three questions the demo script calls for: club app adoption,
  // part-time/full-time app activation, and Navigator ticket deflection.
  // Swap in fresh numbers before reusing this for a different demo instance.

  const PANEL_ID  = 'ltai-panel';
  const BTN_ID    = 'ltai-btn';
  const STYLES_ID = 'ltai-styles';

  /* ─── The three canned prompts, verbatim ───────────────────────────── */
  const Q1 = 'Which clubs have the highest app adoption this month, and which five are furthest behind our launch target?';
  const Q2 = 'What percentage of our part-time team members with no company email have activated the app, versus full-time staff?';
  const Q3 = 'How many HR and IT questions did Navigator answer this month without creating a ticket?';

  /* ─── Canned answers ────────────────────────────────────────────────── */
  const RESPONSES = {
    clubAdoption: {
      text: 'Across all 190 clubs, 94% of team members are active in the app in the last 30 days, four points above your 90% launch target. Your strongest clubs are Chanhassen, MN, Lakeville, MN, and Frisco, TX, all at 98% or higher. The five furthest behind are your newest openings, led by Paradise Valley, AZ at 71% and Rosemount, MN at 74%.',
      chart: 'clubAdoption',
      bullets: [],
      followUps: [Q2, Q3],
    },

    activation: {
      text: 'Of your 44,583 team members, roughly three quarters are part time and about half have no company email. Even so, 91% of your part-time, no-email team members have activated the app, against 96% for full-time staff and 93% company-wide. This is the deskless majority that email-based tools never reach. You have not just kept the population Beekeeper served, you have grown it.',
      chart: 'activation',
      bullets: [],
      followUps: [Q1, Q3],
    },

    navigator: {
      text: 'This month Navigator resolved 18,400 team-member questions with no ticket, covering pay, benefits, time off, and policy. That is 62% of your routine HR and IT questions deflected from the service desk, an estimated 2,300 hours of staff time back. The trend climbs every month as more workflows come online, which speaks straight to your goal of fewer tickets and measurable efficiency.',
      chart: 'navigator',
      bullets: [],
      followUps: [Q1, Q2],
    },

    fallback: {
      text: 'I can help with club app adoption against your 90% launch target, part-time versus full-time app activation, or how many HR and IT questions Navigator is resolving without a ticket. Which would you like to dig into?',
      bullets: [],
      followUps: [Q1, Q2, Q3],
    },
  };

  /* ─── Keyword → canned-answer routing ──────────────────────────────── */
  const ROUTES = [
    {
      response: 'navigator',
      test: q => /(navigator|ticket|deflect|service desk|help desk|hr and it|hr\/it)/.test(q),
    },
    {
      response: 'activation',
      test: q => /(part[- ]?time|full[- ]?time|seasonal|no[- ]?email|no company email|activat)/.test(q),
    },
    {
      response: 'clubAdoption',
      test: q => /(club|clubs|adoption|launch target)/.test(q),
    },
  ];

  function getCannedAnswer(question) {
    const q = String(question || '').toLowerCase();
    const route = ROUTES.find(r => r.test(q));
    return RESPONSES[route ? route.response : 'fallback'];
  }

  /* ─── Suggested prompts ─────────────────────────────────────────────── */
  const PROMPTS = [Q1, Q2, Q3];

  /* ─── Inline SVG charts (self-contained — no image hosting needed) ──── */
  // Validated categorical pair (dataviz skill default palette): blue/orange
  // clear both the CVD and normal-vision floors in light mode. Bars use a
  // 4px rounded data-end, square at the baseline, per the mark spec.
  const CHART_BLUE      = '#2a78d6';
  const CHART_BLUE_DARK = '#104281';
  const CHART_ORANGE    = '#eb6834';
  const INK             = '#0b0b0b';
  const INK_SECONDARY   = '#52514e';
  const INK_MUTED       = '#898781';
  const GRID            = '#e1e0d9';
  const SURFACE         = '#fcfcfb';
  const r1 = n => Math.round(n * 10) / 10;

  // Horizontal bar, rounded only on the data-end (right), square at the baseline (left).
  function barH(x, y, w, h, r) {
    if (w <= 0) return '';
    r = Math.min(r, w, h / 2);
    return `M${x},${y} H${x + w - r} A${r},${r} 0 0 1 ${x + w},${y + r} V${y + h - r} A${r},${r} 0 0 1 ${x + w - r},${y + h} H${x} Z`;
  }

  // Vertical column, rounded only on the data-end (top), square at the baseline (bottom).
  function barV(x, y, w, h, r) {
    if (h <= 0) return '';
    r = Math.min(r, w / 2, h);
    return `M${x},${y + h} V${y + r} A${r},${r} 0 0 1 ${x + r},${y} H${x + w - r} A${r},${r} 0 0 1 ${x + w},${y + r} V${y + h} Z`;
  }

  const CHARTS = {
    // Q1 — club adoption vs. 90% launch target
    clubAdoption() {
      const data = [
        ['Chanhassen, MN', 99], ['Lakeville, MN', 98], ['Frisco, TX', 98],
        ['Vernon Hills, IL', 97], ['Edina, MN', 97],
        ['Las Colinas, TX', 82], ['Fishers, IN', 79], ['Brea, CA', 76],
        ['Rosemount, MN', 74], ['Paradise Valley, AZ', 71],
      ];
      const trackX = 94, trackW = 176, rowH = 18, top = 16, barThick = 12;
      const targetX = r1(trackX + trackW * 0.9);
      const rows = data.map(([label, val], i) => {
        const y = top + i * rowH;
        const w = r1(trackW * (val / 100));
        const color = val >= 90 ? CHART_BLUE : CHART_ORANGE;
        const labelInside = w > 24;
        const valueX = labelInside ? trackX + w - 5 : trackX + w + 5;
        const valueAnchor = labelInside ? 'end' : 'start';
        const valueFill = labelInside ? '#fff' : INK;
        return `
          <text x="${trackX - 4}" y="${y + barThick / 2 + 3}" text-anchor="end" font-size="8" fill="${INK_SECONDARY}">${label}</text>
          <path d="${barH(trackX, y, w, barThick, 4)}" fill="${color}">
            <title>${label}: ${val}%</title>
          </path>
          <text x="${valueX}" y="${y + barThick / 2 + 3}" text-anchor="${valueAnchor}" font-size="8.5" font-weight="600" fill="${valueFill}">${val}%</text>`;
      }).join('');
      const chartH = top + data.length * rowH;
      return `
        <svg viewBox="0 0 280 ${chartH + 6}" width="100%" role="img" aria-label="App adoption by club, last 30 days, vs. 90% launch target">
          <line x1="${targetX}" y1="${top - 4}" x2="${targetX}" y2="${chartH - 2}" stroke="${INK_MUTED}" stroke-width="1" stroke-dasharray="3,2"/>
          <text x="${targetX}" y="${top - 6}" text-anchor="middle" font-size="7" fill="${INK_MUTED}">90% target</text>
          ${rows}
        </svg>`;
    },

    // Q2 — activation by team-member segment
    activation() {
      const data = [
        ['Full-time', 96, CHART_BLUE], ['Part-time', 91, CHART_BLUE],
        ['Seasonal', 88, CHART_BLUE], ['Company avg', 93, CHART_BLUE_DARK],
      ];
      const plotTop = 26, baseline = 118, plotBottom = baseline;
      const plotH = baseline - plotTop;
      const bandW = 60, barW = 26, chartW = bandW * data.length + 20;
      const avgY = r1(baseline - plotH * (93 / 100));
      const cols = data.map(([label, val, color], i) => {
        const cx = 20 + i * bandW + bandW / 2;
        const x = cx - barW / 2;
        const h = r1(plotH * (val / 100));
        const y = r1(baseline - h);
        return `
          <text x="${cx}" y="${r1(y - 6)}" text-anchor="middle" font-size="9" font-weight="600" fill="${INK}">${val}%</text>
          <path d="${barV(x, y, barW, h, 4)}" fill="${color}">
            <title>${label}: ${val}%</title>
          </path>
          <text x="${cx}" y="${baseline + 13}" text-anchor="middle" font-size="8" fill="${INK_SECONDARY}">${label}</text>`;
      }).join('');
      return `
        <svg viewBox="0 0 ${chartW} 140" width="100%" role="img" aria-label="App activation by team-member segment">
          <line x1="16" y1="${baseline}" x2="${chartW - 4}" y2="${baseline}" stroke="${GRID}" stroke-width="1"/>
          <line x1="16" y1="${avgY}" x2="${chartW - 4}" y2="${avgY}" stroke="${INK_MUTED}" stroke-width="1" stroke-dasharray="3,2"/>
          ${cols}
        </svg>`;
    },

    // Q3 — Navigator questions resolved without a ticket, 6-month trend
    navigator() {
      const data = [
        ['Jan', 6200], ['Feb', 9100], ['Mar', 12400],
        ['Apr', 14800], ['May', 16500], ['Jun', 18400],
      ];
      const x0 = 20, xStep = 48, baseline = 110, top = 14, domainMax = 20000;
      const yFor = v => r1(baseline - ((baseline - top) * v) / domainMax);
      const pts = data.map((d, i) => [x0 + i * xStep, yFor(d[1])]);
      const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');
      const area = `${line} L${pts[pts.length - 1][0]},${baseline} L${pts[0][0]},${baseline} Z`;
      const dots = pts.map(([x, y], i) => `
          <circle cx="${x}" cy="${y}" r="4" fill="${CHART_BLUE}" stroke="${SURFACE}" stroke-width="2">
            <title>${data[i][0]}: ${(data[i][1] / 1000).toFixed(1)}k</title>
          </circle>`).join('');
      const months = data.map((d, i) => `<text x="${x0 + i * xStep}" y="128" text-anchor="middle" font-size="8" fill="${INK_MUTED}">${d[0]}</text>`).join('');
      const first = data[0], last = data[data.length - 1];
      return `
        <svg viewBox="0 0 280 140" width="100%" role="img" aria-label="Questions resolved by Navigator without a ticket, 6-month trend, ending at 18,400 in June">
          <line x1="16" y1="${baseline}" x2="264" y2="${baseline}" stroke="${GRID}" stroke-width="1"/>
          <path d="${area}" fill="${CHART_BLUE}" opacity="0.1"/>
          <path d="${line}" fill="none" stroke="${CHART_BLUE}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
          ${dots}
          <text x="${pts[0][0]}" y="${r1(pts[0][1] - 9)}" text-anchor="middle" font-size="8" font-weight="600" fill="${INK}">${(first[1] / 1000).toFixed(1)}k</text>
          <text x="${pts[pts.length - 1][0]}" y="${r1(pts[pts.length - 1][1] - 9)}" text-anchor="middle" font-size="8" font-weight="600" fill="${INK}">${(last[1] / 1000).toFixed(1)}k</text>
          ${months}
        </svg>`;
    },
  };

  /* ─── Utilities ─────────────────────────────────────────────────────── */
  function getCurrentPage() {
    const p = window.location.pathname;
    const m = p.match(/\/studio\/([^/?#]+)/);
    return m ? m[1] : 'studio';
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ─── State ─────────────────────────────────────────────────────────── */
  let messages = [];
  let convEl   = null;
  let inputEl  = null;
  let isOpen   = false;

  /* ─── CSS ───────────────────────────────────────────────────────────── */
  const CSS = `
    #${BTN_ID}{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:6px;border:none;background:none;cursor:pointer;font-family:Inter,sans-serif;font-size:14px;font-weight:500;color:#004EB9;transition:background .15s;white-space:nowrap;}
    #${BTN_ID}:hover{background:#EEF4FF;}
    #${BTN_ID} .ltai-spark{background:linear-gradient(135deg,#004EB9,#7B3FE4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}

    #${PANEL_ID}{position:fixed;top:0;right:-400px;width:370px;height:100vh;background:#fff;border-left:1px solid #e5e9f0;box-shadow:-6px 0 32px rgba(0,0,0,.1);z-index:9999;display:flex;flex-direction:column;font-family:Inter,sans-serif;transition:right .28s cubic-bezier(.4,0,.2,1);}
    #${PANEL_ID}.open{right:0;}

    .ltai-hd{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #e5e9f0;flex-shrink:0;}
    .ltai-hd-title{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:#171719;}
    .ltai-hd-title .spark{font-size:15px;background:linear-gradient(135deg,#004EB9,#7B3FE4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
    .ltai-hd-btns{display:flex;gap:2px;}
    .ltai-ic{display:flex;align-items:center;justify-content:center;width:30px;height:30px;border:none;background:none;border-radius:6px;cursor:pointer;color:#7a7d8a;transition:background .15s;}
    .ltai-ic:hover{background:#f4f5f7;color:#171719;}

    .ltai-chat-sub{font-size:11px;color:#adb0bb;padding:8px 18px 0;font-weight:500;}

    .ltai-conv{flex:1;overflow-y:auto;padding:20px 16px;display:flex;flex-direction:column;gap:16px;}

    .ltai-intro{display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;margin-top:24px;}
    .ltai-intro-icon{font-size:26px;background:linear-gradient(135deg,#004EB9,#7B3FE4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
    .ltai-intro h2{font-size:15px;font-weight:600;color:#171719;margin:0;}
    .ltai-intro p{font-size:13px;color:#535560;margin:0;line-height:1.5;}
    .ltai-chips{display:flex;flex-wrap:wrap;gap:7px;justify-content:center;margin-top:6px;}
    .ltai-chip{padding:7px 13px;border:1px solid #e5e9f0;border-radius:18px;background:#fff;font-size:12.5px;color:#004EB9;cursor:pointer;font-family:Inter,sans-serif;transition:all .15s;text-align:left;line-height:1.4;}
    .ltai-chip:hover{background:#EEF4FF;border-color:#004EB9;}

    .ltai-msg{display:flex;flex-direction:column;gap:4px;}
    .ltai-msg--user{align-items:flex-end;}
    .ltai-msg--ai{align-items:flex-start;}
    .ltai-bubble{max-width:92%;padding:10px 14px;border-radius:12px;font-size:13.5px;line-height:1.55;}
    .ltai-bubble--user{background:#EEF4FF;color:#171719;border-bottom-right-radius:3px;}
    .ltai-bubble--ai{background:#f8f9fa;color:#171719;border:1px solid #e9eaed;border-bottom-left-radius:3px;}
    .ltai-bubble--ai ul{margin:8px 0 0;padding-left:18px;}
    .ltai-bubble--ai li{margin-bottom:4px;font-size:13px;line-height:1.5;}
    .ltai-chart{margin-top:10px;}
    .ltai-chart svg{display:block;width:100%;height:auto;font-family:Inter,sans-serif;}
    .ltai-fb{display:flex;gap:2px;margin-top:4px;padding-left:2px;}
    .ltai-fb-btn{display:flex;align-items:center;justify-content:center;width:26px;height:26px;border:none;background:none;border-radius:5px;cursor:pointer;color:#adb0bb;font-size:12px;transition:all .15s;}
    .ltai-fb-btn:hover{background:#f4f5f7;color:#171719;}
    .ltai-follow{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;padding-left:2px;}
    .ltai-follow-chip{padding:5px 11px;border:1px solid #e5e9f0;border-radius:14px;background:#fff;font-size:11.5px;color:#004EB9;cursor:pointer;font-family:Inter,sans-serif;transition:all .15s;}
    .ltai-follow-chip:hover{background:#EEF4FF;border-color:#004EB9;}

    .ltai-typing{display:flex;align-items:center;gap:4px;padding:10px 14px;background:#f8f9fa;border:1px solid #e9eaed;border-radius:12px;border-bottom-left-radius:3px;width:56px;}
    .ltai-dot{width:5px;height:5px;background:#adb0bb;border-radius:50%;animation:ltDot 1.2s ease-in-out infinite;}
    .ltai-dot:nth-child(2){animation-delay:.2s;}
    .ltai-dot:nth-child(3){animation-delay:.4s;}
    @keyframes ltDot{0%,60%,100%{transform:scale(1);opacity:.4;}30%{transform:scale(1.5);opacity:1;}}

    .ltai-ft{padding:10px 14px 14px;border-top:1px solid #e5e9f0;flex-shrink:0;}
    .ltai-ctx{background:#f8f9fa;border:1px solid #e5e9f0;border-radius:10px;padding:10px 12px;}
    .ltai-ctx-label{font-size:10.5px;font-weight:600;color:#adb0bb;text-transform:uppercase;letter-spacing:.5px;margin-bottom:7px;}
    .ltai-input-row{display:flex;align-items:flex-end;gap:6px;}
    .ltai-input{flex:1;border:none;background:transparent;font-family:Inter,sans-serif;font-size:13.5px;color:#171719;resize:none;outline:none;min-height:20px;max-height:110px;line-height:1.5;overflow:hidden;}
    .ltai-input::placeholder{color:#c2c4cc;}
    .ltai-plus{font-size:17px;color:#adb0bb;cursor:pointer;background:none;border:none;padding:0 2px;line-height:1;transition:color .15s;flex-shrink:0;}
    .ltai-plus:hover{color:#535560;}
    .ltai-send{width:30px;height:30px;border-radius:7px;border:none;background:#004EB9;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s;}
    .ltai-send:hover{background:#003A8C;}
    .ltai-send:disabled{background:#e5e9f0;cursor:not-allowed;}
    .ltai-disc{font-size:11px;color:#adb0bb;margin-top:7px;text-align:center;}
    .ltai-disc a{color:#004EB9;text-decoration:none;}
    .ltai-disc a:hover{text-decoration:underline;}
  `;

  /* ─── Render helpers ────────────────────────────────────────────────── */
  function renderIntro() {
    convEl.innerHTML = `
      <div class="ltai-intro">
        <div class="ltai-intro-icon">✦</div>
        <h2>Studio AI</h2>
        <p>Ask about club app adoption, part-time vs. full-time activation, or Navigator ticket deflection.</p>
        <div class="ltai-chips">
          ${PROMPTS.map(p => `<button class="ltai-chip" data-p="${esc(p)}">${esc(p)}</button>`).join('')}
        </div>
      </div>`;
    convEl.querySelectorAll('.ltai-chip').forEach(b => b.addEventListener('click', () => send(b.dataset.p)));
  }

  function renderMsgs() {
    if (messages.length === 0) { renderIntro(); return; }

    convEl.innerHTML = messages.map(m => {
      if (m.role === 'user') {
        return `<div class="ltai-msg ltai-msg--user"><div class="ltai-bubble ltai-bubble--user">${esc(m.text)}</div></div>`;
      }
      const bullets = m.bullets?.length
        ? `<ul>${m.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : '';
      const chart = m.chart && CHARTS[m.chart]
        ? `<div class="ltai-chart">${CHARTS[m.chart]()}</div>` : '';
      const follows = m.followUps?.length
        ? `<div class="ltai-follow">${m.followUps.map(f => `<button class="ltai-follow-chip" data-p="${esc(f)}">${esc(f)}</button>`).join('')}</div>` : '';
      return `
        <div class="ltai-msg ltai-msg--ai">
          <div class="ltai-bubble ltai-bubble--ai">
            ${esc(m.text)}${bullets}${chart}
          </div>
          <div class="ltai-fb">
            <button class="ltai-fb-btn" data-action="up">👍</button>
            <button class="ltai-fb-btn" data-action="down">👎</button>
            <button class="ltai-fb-btn" data-action="copy" data-text="${esc(m.text)}">📋</button>
          </div>
          ${follows}
        </div>`;
    }).join('');

    convEl.querySelectorAll('.ltai-follow-chip').forEach(b => b.addEventListener('click', () => send(b.dataset.p)));
    convEl.querySelectorAll('[data-action="copy"]').forEach(b => b.addEventListener('click', () => {
      navigator.clipboard?.writeText(b.dataset.text);
      b.textContent = '✓';
      setTimeout(() => { b.textContent = '📋'; }, 1500);
    }));
    convEl.scrollTop = convEl.scrollHeight;
  }

  function showTyping() {
    const d = document.createElement('div');
    d.id = 'ltai-typing-msg';
    d.className = 'ltai-msg ltai-msg--ai';
    d.innerHTML = `<div class="ltai-typing"><div class="ltai-dot"></div><div class="ltai-dot"></div><div class="ltai-dot"></div></div>`;
    convEl.appendChild(d);
    convEl.scrollTop = convEl.scrollHeight;
  }

  function hideTyping() {
    document.getElementById('ltai-typing-msg')?.remove();
  }

  /* ─── Send ──────────────────────────────────────────────────────────── */
  function send(text) {
    if (!text?.trim()) return;
    text = text.trim();
    messages.push({ role: 'user', text });
    renderMsgs();
    if (inputEl) { inputEl.value = ''; inputEl.style.height = 'auto'; }
    showTyping();
    convEl.scrollTop = convEl.scrollHeight;

    // Scripted "thinking" delay only — no network call, no LLM, no API key.
    setTimeout(() => {
      const r = getCannedAnswer(text);
      hideTyping();
      messages.push({ role: 'ai', text: r.text, bullets: r.bullets, followUps: r.followUps, chart: r.chart });
      renderMsgs();
    }, 550 + Math.random() * 300);
  }

  /* ─── Panel open / close / new ──────────────────────────────────────── */
  function openPanel()  { isOpen = true;  document.getElementById(PANEL_ID)?.classList.add('open');    setTimeout(() => inputEl?.focus(), 300); }
  function closePanel() { isOpen = false; document.getElementById(PANEL_ID)?.classList.remove('open'); }

  function updateContextLabel() {
    const lbl = document.getElementById('ltai-ctx-label');
    if (!lbl) return;
    const page = getCurrentPage();
    lbl.textContent = 'Context · ' + (page.charAt(0).toUpperCase() + page.slice(1));
  }

  function resetConversation() {
    messages = [];
    if (convEl) renderMsgs();
    if (inputEl) { inputEl.value = ''; inputEl.style.height = 'auto'; }
    updateContextLabel();
  }

  /* ─── Build DOM ─────────────────────────────────────────────────────── */
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
      <div class="ltai-hd">
        <div class="ltai-hd-title">
          <span class="spark">✦</span> Studio AI
        </div>
        <div class="ltai-hd-btns">
          <button class="ltai-ic" id="ltai-hist" title="History">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M13 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7V3zm-1 5v5l4 2.4-1 1.7-5-3V8h2z"/></svg>
          </button>
          <button class="ltai-ic" id="ltai-new" title="New conversation">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          </button>
          <button class="ltai-ic" id="ltai-close" title="Close">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>
      </div>
      <div class="ltai-chat-sub">New Chat</div>
      <div class="ltai-conv" id="ltai-conv"></div>
      <div class="ltai-ft">
        <div class="ltai-ctx">
          <div class="ltai-ctx-label" id="ltai-ctx-label">Context · ${getCurrentPage().charAt(0).toUpperCase() + getCurrentPage().slice(1)}</div>
          <div class="ltai-input-row">
            <button class="ltai-plus" title="Add context">+</button>
            <textarea class="ltai-input" id="ltai-input" placeholder="Ask about adoption, activation, or Navigator…" rows="1"></textarea>
            <button class="ltai-send" id="ltai-send" title="Send">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
          </div>
        </div>
        <div class="ltai-disc">Scripted demo answers for the Life Time Studio. Not a live AI service.</div>
      </div>`;

    document.body.appendChild(panel);

    convEl  = document.getElementById('ltai-conv');
    inputEl = document.getElementById('ltai-input');

    renderMsgs();

    document.getElementById('ltai-close').addEventListener('click', closePanel);
    document.getElementById('ltai-new').addEventListener('click', resetConversation);
    document.getElementById('ltai-send').addEventListener('click', () => send(inputEl.value));
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
    btn.innerHTML = `<span class="ltai-spark">✦</span> Studio AI`;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      isOpen ? closePanel() : openPanel();
    });
    right.insertBefore(btn, right.firstChild);
  }

  /* ─── Init + SPA nav ────────────────────────────────────────────────── */
  function init() {
    injectButton();
    if (!document.getElementById(PANEL_ID)) buildPanel();
  }

  // Retry until the React header has rendered, then wire up once
  let attempts = 0;
  function tryInit() {
    if (document.querySelector('.ds-studio-header__tier-two') && location.pathname.includes('/studio')) {
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
      if (location.pathname.includes('/studio')) {
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
      if (location.pathname.includes('/studio') && !document.getElementById(BTN_ID)) {
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
