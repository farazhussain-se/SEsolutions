// ==UserScript==
// @name         Staffbase Analytics – Analyze with AI
// @namespace    staffbase-se-solutions
// @version      1.1.0
// @description  Adds an "Analyze with AI" chatbot panel to Staffbase Studio analytics pages
// @author       Faraz Hussain
// @match        *://strykerdemo.staffbase.com/studio/analytics*
// @match        *://*.staffbase.com/studio/analytics*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const PANEL_ID   = 'sb-ai-panel';
  const BTN_ID     = 'sb-ai-btn';
  const STYLES_ID  = 'sb-ai-styles';

  /* ─── Hardcoded analytics data ─────────────────────────────── */
  const QA = [
    /* NEWS */
    {
      page: 'news',
      keywords: ['summarize','summary','overview','how did','performed','performance','last week','this week','past 7','news posts'],
      response: {
        text: 'Here\'s how your news content performed over the past 7 days (May 2–8, 2026):',
        bullets: [
          '69 new posts published — up 475% vs. prior period',
          '58,800 total visits across all news articles',
          '10,185 unique visitors reading news content',
          '5,796 likes and 1,932 comments generated',
          'Interaction rate of 0.0055% — up 500% vs. prior period',
        ],
        followUps: ['Which channel had the most visits?', 'How do likes compare to comments?']
      }
    },
    {
      page: 'news',
      keywords: ['channel','top channel','channel engagement','most visits','best channel','marketplace','germany news','healthcare','safety first'],
      response: {
        text: 'The top news channels by visits this week:',
        bullets: [
          '1. Marketplace — 7,312 visits',
          '2. Germany News — 7,181 visits',
          '3. Healthcare — 7,116 visits',
          '4. Safety First — 6,914 visits',
          '5. Industry News — ~6,500 visits',
        ],
        followUps: ['What drove Marketplace to the top?', 'Which channel has the most comments?']
      }
    },
    {
      page: 'news',
      keywords: ['interaction rate','engagement rate','how engaged','engagement'],
      response: {
        text: 'Your news interaction rate for the past 7 days is 0.0055% — up 500% vs. the prior period.',
        bullets: [
          'Interaction rate = (likes + comments + shares) / total visits',
          '58,800 visits generated ~8,500 total engagement actions',
          'The 500% increase reflects a surge in content engagement relative to traffic',
          'Increasing comments and shares will further improve this rate',
        ],
        followUps: ['How many total likes were there?', 'Summarize all engagement metrics']
      }
    },
    {
      page: 'news',
      keywords: ['likes','comments','shares','reactions','engagement actions'],
      response: {
        text: 'Engagement actions breakdown for the past 7 days:',
        bullets: [
          'Likes: 5,796 — stable vs. prior period',
          'Comments: 1,932 — stable vs. prior period',
          'Shares: 772 — stable vs. prior period',
          'Likes-to-comments ratio is ~3:1 — healthy for a large organisation',
          'Active commenting signals readers are discussing, not just passively reading',
        ],
        followUps: ['Which posts got the most comments?', 'How does this compare to last month?']
      }
    },
    {
      page: 'news',
      keywords: ['visits','visitors','traffic','how many people','readership','how many views'],
      response: {
        text: 'News traffic for the past 7 days:',
        bullets: [
          '58,800 total visits — stable vs. prior period (0% change)',
          '10,185 unique visitors reading news content',
          'Average ~5.8 visits per unique visitor — strong repeat engagement',
          'Stable traffic indicates a reliable daily readership base',
        ],
        followUps: ['Which platforms did visitors use?', 'Which channel drove the most visitors?']
      }
    },
    {
      page: 'news',
      keywords: ['new posts','how many posts','content published','articles published','posts published','content volume','spike'],
      response: {
        text: '69 new posts were published in the past 7 days — a 475% increase vs. the prior period.',
        bullets: [
          'All 69 posts were unique (no duplicates)',
          'Average publishing cadence: ~10 posts per day',
          'The content surge likely contributed to the 500% interaction rate increase',
          'Consistent publishing keeps employees returning to News daily',
        ],
        followUps: ['Which channels published the most?', 'How did this affect visit numbers?']
      }
    },

    /* PAGES */
    {
      page: 'pages',
      keywords: ['summarize','summary','overview','how did','performed','performance','page views'],
      response: {
        text: 'Here\'s how your pages performed over the past 7 days (May 2–8, 2026):',
        bullets: [
          '141,790 total page views — up 64% vs. prior period',
          '10,363 unique visitors viewed pages',
          '37 active pages — 0 pages without any visits',
          'Average of ~13.7 page views per unique visitor',
        ],
        followUps: ['Which page had the most traffic?', 'Are there any pages with 0 visits?']
      }
    },
    {
      page: 'pages',
      keywords: ['most visited','top pages','highest traffic','best performing','popular pages','homepage','calculate views'],
      response: {
        text: 'All 37 active pages received visits this period. To see individual rankings:',
        bullets: [
          'Scroll to the "All Pages" table below the chart',
          'Sort by the "Views" column to identify top performers',
          'The Homepage typically ranks as the most-visited page',
          'Benefits, Company News, and HR Policies pages usually rank in the top 5',
        ],
        followUps: ['What\'s the average bounce rate?', 'How many pages have over 1,000 views?']
      }
    },
    {
      page: 'pages',
      keywords: ['views','total views','how many views','view count','64'],
      response: {
        text: 'Pages generated 141,790 total views in the past 7 days — a 64% increase vs. prior period.',
        bullets: [
          '10,363 unique visitors contributed to these views',
          'Average ~13.7 pages viewed per visitor — strong depth of engagement',
          'Both views and visitors grew equally (+64%), indicating new audience reach',
          'The 64% increase suggests a successful content or campaign push this week',
        ],
        followUps: ['What drove the 64% increase?', 'Which spaces had the most page views?']
      }
    },
    {
      page: 'pages',
      keywords: ['pages without views','unused pages','no traffic','zero views','unvisited','0 pages'],
      response: {
        text: 'Great news — all 37 published pages received at least one visit this week.',
        bullets: [
          '0 pages without views — 100% content utilisation',
          'Every piece of page content is actively reaching employees',
          'Running a quarterly content audit helps maintain healthy page engagement',
          'Consider archiving pages that consistently receive under 10 views per month',
        ],
        followUps: ['Which pages have the lowest views?', 'How often should I audit page content?']
      }
    },
    {
      page: 'pages',
      keywords: ['visitors','unique visitors','who is visiting','user groups','37 pages'],
      response: {
        text: '10,363 unique visitors viewed pages in the past 7 days — up 64% vs. prior period.',
        bullets: [
          'Each visitor viewed an average of 13.7 pages per session',
          'Visitor growth (+64%) matches total view growth, confirming new audience reach',
          'Use the "User Group" filter to see which employee groups are most active',
          'The "Space" filter shows which content areas attract the most distinct visitors',
        ],
        followUps: ['Which user groups visit most?', 'Are mobile visitors increasing?']
      }
    },

    /* USERS */
    {
      page: 'users',
      keywords: ['summarize','summary','overview','user stats','how many users','user overview','user activity'],
      response: {
        text: 'Here\'s your user overview for the past 7 days (May 2–8, 2026):',
        bullets: [
          'Total Users: 3,947 — up 13% vs. prior period',
          'Registered Users: 3,868 — up 13%',
          'Active Users: 2,542 — down 12%',
          'Engaged Users: 1,989 — up 51%',
        ],
        followUps: ['Why did active users drop?', 'What\'s the user engagement funnel?']
      }
    },
    {
      page: 'users',
      keywords: ['active users','activity','who is active','how active','login','logged in','2542','2,542'],
      response: {
        text: '2,542 users were active in the past 7 days — a 12% decrease vs. the prior period.',
        bullets: [
          'Active users = users who logged in at least once',
          'The 12% dip may reflect a holiday, weekend, or seasonal pattern',
          'However, engaged users grew +51% — those who are active interact far more',
          'Active users represent 66% of all registered users (2,542 / 3,868)',
        ],
        followUps: ['What\'s the engaged user rate?', 'When did activity peak this week?']
      }
    },
    {
      page: 'users',
      keywords: ['engaged users','engagement','most engaged','who engages','interacting','1989','1,989'],
      response: {
        text: 'Engaged users reached 1,989 this week — up 51% vs. the prior period.',
        bullets: [
          'Engaged = users who liked, commented, or shared at least one piece of content',
          '78% of active users were engaged (1,989 / 2,542) — a very strong ratio',
          'Engagement peaked around May 6–7 based on the trend chart',
          'The +51% growth indicates recent content resonated strongly with employees',
        ],
        followUps: ['Which content drove the most engagement?', 'How can we increase engaged users further?']
      }
    },
    {
      page: 'users',
      keywords: ['registered users','registration','sign up','onboarding','new users','provisioned','3868','3,868'],
      response: {
        text: '3,868 of your 3,947 total users are registered — a 98% registration rate.',
        bullets: [
          'Registered users grew 13% — consistent with total user growth',
          '79 users are provisioned but have not yet completed registration (2% of total)',
          'A 98% registration rate is excellent for an enterprise intranet',
          'A targeted nudge campaign could convert the remaining 79 unregistered accounts',
        ],
        followUps: ['How do I send a registration reminder?', 'Which departments have unregistered users?']
      }
    },
    {
      page: 'users',
      keywords: ['funnel','user funnel','conversion','drop off','journey','steps','breakdown'],
      response: {
        text: 'Your user engagement funnel for the past 7 days:',
        bullets: [
          'Total Users: 3,947 — all provisioned accounts',
          'Registered: 3,868 (98% of total) — completed sign-up',
          'Active: 2,542 (66% of registered) — logged in at least once',
          'Engaged: 1,989 (78% of active) — liked, commented, or shared',
        ],
        followUps: ['How do I improve Active → Engaged conversion?', 'What\'s a good benchmark for engagement rates?']
      }
    },

    /* GENERIC */
    {
      page: 'any',
      keywords: ['help','what can you do','capabilities','what can i ask'],
      response: {
        text: 'I can help you analyse your Staffbase analytics. Here\'s what you can ask:',
        bullets: [
          'News: "Summarise news performance" or "Which channel had the most visits?"',
          'Pages: "How many total views did we get?" or "Are there pages with no traffic?"',
          'Users: "What\'s the user engagement funnel?" or "How many users are engaged?"',
        ],
        followUps: ['Summarise this week\'s performance', 'What should I focus on improving?']
      }
    },
  ];

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

  function getResponse(input) {
    const page = getCurrentPage();
    const text = input.toLowerCase();
    let best = null, score = 0;
    for (const qa of QA) {
      if (qa.page !== page && qa.page !== 'any') continue;
      let s = 0;
      for (const kw of qa.keywords) if (text.includes(kw)) s += kw.split(' ').length;
      if (s > score) { score = s; best = qa; }
    }
    if (best && score > 0) return best.response;
    return {
      text: 'I don\'t have specific data for that query. Try asking:',
      bullets: ['Overall performance summary for this page', 'Top channels or pages by traffic', 'User engagement metrics', 'Comparison of likes, comments, and shares'],
      followUps: ['Summarise this page\'s analytics', 'What are the key metrics?']
    };
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
        <h2>Analyze with AI</h2>
        <p>Here are a few things I can do, or ask me anything!</p>
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
  function send(text) {
    if (!text?.trim()) return;
    text = text.trim();
    messages.push({ role: 'user', text });
    renderMsgs();
    if (inputEl) inputEl.value = '';
    showTyping();
    convEl.scrollTop = convEl.scrollHeight;
    setTimeout(() => {
      hideTyping();
      const r = getResponse(text);
      messages.push({ role: 'ai', text: r.text, bullets: r.bullets, followUps: r.followUps });
      renderMsgs();
    }, 700 + Math.random() * 500);
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
          <span class="spark">✦</span> Analyze with AI
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
    btn.innerHTML = `<span class="sbai-spark">✦</span> Analyze with AI`;
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
