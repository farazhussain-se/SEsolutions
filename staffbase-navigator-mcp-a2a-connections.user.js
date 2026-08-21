// ==UserScript==
// @name         Staffbase Navigator – MCP & A2A Connections (Mock)
// @namespace    staffbase.navigator.mock
// @version      1.0.0
// @description  Mocks upcoming "Integrations" settings for the Staffbase Navigator: connect it to MCP servers (as a client) or to other agents via A2A. Full click-through setup incl. authentication (API key, Bearer, OAuth 2.0 with simulated consent flow), permissions, and a connection test.
// @author       You
// @match        *://*.staffbase.rocks/studio/content/ai-assistant*
// @match        *://*.staffbase.com/studio/content/ai-assistant*
// @match        https://lifetime-inc.staffbase.rocks/studio/content/ai-assistant*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  /* --------------------------------------------------------------------- *
   *  State (seeded with existing connections so both the "connected"       *
   *  state and the "add" flow are visible)                                 *
   * --------------------------------------------------------------------- */
  const store = {
    connections: [
      {
        id: uid(),
        type: 'mcp',
        name: 'Atlassian (Jira & Confluence)',
        description: 'Lets Navigator search and reference Jira issues and Confluence pages.',
        url: 'https://mcp.atlassian.com/v1/sse',
        transport: 'sse',
        auth: { method: 'oauth2_auth_code', connected: true, account: 'faraz.hussain@staffbase.com' },
        permissions: { allowTools: true, approval: 'readonly', allowResources: true },
        toolsCount: 12,
        status: 'connected',
        enabled: true,
      },
      {
        id: uid(),
        type: 'a2a',
        name: 'Workday Sana',
        description: 'Delegates HR and workforce-related tasks to Workday\'s AI agent.',
        agentCardUrl: 'https://us.agent.workday.com',
        endpointUrl: 'https://us.agent.workday.com',
        auth: { method: 'oauth2_client_creds', connected: true, account: null },
        permissions: { allowDelegation: true, approval: 'each' },
        status: 'connected',
        enabled: true,
      },
    ],
  };

  const CALLBACK_URL = location.origin + '/studio/oauth/callback';

  /* --------------------------------------------------------------------- *
   *  Utilities                                                            *
   * --------------------------------------------------------------------- */
  function uid() { return 'c_' + Math.random().toString(36).slice(2, 10); }
  function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function esc(s) { return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  const AUTH_LABEL = {
    none: 'No authentication',
    apikey: 'API key',
    bearer: 'Bearer token',
    oauth2_auth_code: 'OAuth 2.0 (Authorization Code)',
    oauth2_client_creds: 'OAuth 2.0 (Client Credentials)',
  };

  const MOCK_TOOLS = {
    mcp: ['search_content', 'get_document', 'create_ticket', 'list_projects', 'get_user_profile', 'summarize_page'],
    a2a: [],
  };

  /* --------------------------------------------------------------------- *
   *  Styles                                                               *
   * --------------------------------------------------------------------- */
  const CSS = `
  .sbx-accent { --sbx-primary:#4f46e5; --sbx-primary-weak:#eef0fe; --sbx-border:#e4e6ef;
                --sbx-text:#1c1f2a; --sbx-muted:#6b7180; --sbx-surface:#fff; --sbx-base:#f6f7fb;
                --sbx-green:#158a4a; --sbx-green-bg:#e6f6ec; --sbx-amber:#9a6b00; --sbx-amber-bg:#fdf3dd;
                --sbx-red:#c0362c; }
  .sbx-list { display:flex; flex-direction:column; gap:8px; }
  .sbx-row { display:flex; align-items:center; gap:16px; padding:12px 12px; border:1px solid var(--sbx-border);
             border-radius:12px; background:var(--sbx-surface); }
  .sbx-row:hover { background:#fafbff; }
  .sbx-badge-type { flex:none; width:40px; height:40px; border-radius:10px; display:grid; place-items:center;
                    font-size:11px; font-weight:700; letter-spacing:.02em; }
  .sbx-badge-type.mcp { background:#eef0fe; color:#4f46e5; }
  .sbx-badge-type.a2a { background:#e7f6f1; color:#0f8f6b; }
  .sbx-row-main { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
  .sbx-row-title { font-size:14px; font-weight:600; color:var(--sbx-text); display:flex; align-items:center; gap:8px; }
  .sbx-row-sub { font-size:12px; color:var(--sbx-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .sbx-chips { display:flex; gap:6px; flex-wrap:wrap; margin-top:2px; }
  .sbx-chip { font-size:11px; padding:2px 8px; border-radius:999px; background:var(--sbx-base); color:var(--sbx-muted); border:1px solid var(--sbx-border); }
  .sbx-status { font-size:11px; font-weight:600; padding:3px 9px; border-radius:999px; display:inline-flex; align-items:center; gap:5px; }
  .sbx-status.connected { background:var(--sbx-green-bg); color:var(--sbx-green); }
  .sbx-status.disconnected { background:var(--sbx-base); color:var(--sbx-muted); }
  .sbx-status.error { background:#fdeceb; color:var(--sbx-red); }
  .sbx-dot { width:6px; height:6px; border-radius:50%; background:currentColor; }
  .sbx-row-actions { display:flex; gap:2px; }
  .sbx-iconbtn { border:none; background:none; cursor:pointer; width:30px; height:30px; border-radius:8px; color:var(--sbx-muted);
                 display:grid; place-items:center; font-size:14px; }
  .sbx-iconbtn:hover { background:var(--sbx-base); color:var(--sbx-text); }
  .sbx-iconbtn.danger:hover { background:#fdeceb; color:var(--sbx-red); }

  /* modal */
  .sbx-overlay { position:fixed; inset:0; background:rgba(20,22,34,.45); z-index:2147483000;
                 display:flex; align-items:center; justify-content:center; padding:24px; }
  .sbx-modal { width:640px; max-width:100%; max-height:90vh; background:var(--sbx-surface); border-radius:16px;
               display:flex; flex-direction:column; overflow:hidden; box-shadow:0 24px 60px rgba(10,12,30,.35);
               font-family:inherit; color:var(--sbx-text); }
  .sbx-modal-head { padding:20px 24px 0; }
  .sbx-modal-title { font-size:18px; font-weight:700; }
  .sbx-modal-sub { font-size:12px; color:var(--sbx-muted); margin-top:2px; }
  .sbx-close { position:absolute; top:16px; right:16px; border:none; background:none; font-size:20px; cursor:pointer;
               color:var(--sbx-muted); width:32px; height:32px; border-radius:8px; }
  .sbx-close:hover { background:var(--sbx-base); }
  .sbx-steps { display:flex; gap:6px; padding:16px 24px 4px; }
  .sbx-step { flex:1; height:4px; border-radius:999px; background:var(--sbx-border); }
  .sbx-step.done { background:var(--sbx-primary); }
  .sbx-step.active { background:var(--sbx-primary); opacity:.5; }
  .sbx-step-label { padding:0 24px; font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:var(--sbx-muted); font-weight:600; }
  .sbx-body { padding:14px 24px 24px; overflow-y:auto; }
  .sbx-foot { padding:16px 24px; border-top:1px solid var(--sbx-border); display:flex; justify-content:space-between; gap:12px; background:#fbfbfe; }

  /* form */
  .sbx-field { display:flex; flex-direction:column; gap:6px; margin-bottom:16px; }
  .sbx-label { font-size:13px; font-weight:600; color:var(--sbx-text); }
  .sbx-req { color:var(--sbx-primary); font-weight:600; margin-left:4px; font-size:12px; }
  .sbx-help { font-size:12px; color:var(--sbx-muted); }
  .sbx-input, .sbx-select, .sbx-textarea {
    width:100%; box-sizing:border-box; border:1px solid var(--sbx-border); border-radius:10px; padding:9px 12px;
    font-size:14px; color:var(--sbx-text); background:var(--sbx-surface); font-family:inherit; }
  .sbx-textarea { resize:vertical; min-height:64px; }
  .sbx-input:focus, .sbx-select:focus, .sbx-textarea:focus { outline:none; border-color:var(--sbx-primary); box-shadow:0 0 0 3px rgba(79,70,229,.15); }
  .sbx-input.invalid { border-color:var(--sbx-red); }
  .sbx-err { font-size:12px; color:var(--sbx-red); }
  .sbx-inputwrap { position:relative; }
  .sbx-reveal { position:absolute; right:8px; top:50%; transform:translateY(-50%); border:none; background:none; cursor:pointer;
                color:var(--sbx-muted); font-size:12px; padding:4px 6px; border-radius:6px; }
  .sbx-reveal:hover { background:var(--sbx-base); }

  /* selectable cards */
  .sbx-choices { display:flex; flex-direction:column; gap:12px; }
  .sbx-choice { border:1.5px solid var(--sbx-border); border-radius:12px; padding:16px; cursor:pointer; display:flex; gap:14px; align-items:flex-start; }
  .sbx-choice:hover { border-color:#c9ccdd; }
  .sbx-choice.sel { border-color:var(--sbx-primary); background:var(--sbx-primary-weak); }
  .sbx-choice-ic { flex:none; width:40px; height:40px; border-radius:10px; display:grid; place-items:center; font-weight:700; font-size:12px; }
  .sbx-choice h4 { margin:0 0 4px; font-size:14px; }
  .sbx-choice p { margin:0; font-size:12.5px; color:var(--sbx-muted); line-height:1.45; }

  /* radios / switches */
  .sbx-radio { display:flex; gap:10px; padding:11px 12px; border:1px solid var(--sbx-border); border-radius:10px; cursor:pointer; align-items:flex-start; }
  .sbx-radio.sel { border-color:var(--sbx-primary); background:var(--sbx-primary-weak); }
  .sbx-radio input { margin-top:2px; accent-color:var(--sbx-primary); }
  .sbx-radio .t { font-size:13px; font-weight:600; }
  .sbx-radio .d { font-size:12px; color:var(--sbx-muted); }
  .sbx-toggle-row { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:12px 0; }
  .sbx-toggle-row + .sbx-toggle-row { border-top:1px solid var(--sbx-border); }
  .sbx-toggle-row .tt { font-size:13.5px; font-weight:600; }
  .sbx-toggle-row .td { font-size:12px; color:var(--sbx-muted); }
  .sbx-switch { position:relative; width:38px; height:22px; flex:none; }
  .sbx-switch input { opacity:0; width:0; height:0; }
  .sbx-track { position:absolute; inset:0; background:#c9ccdd; border-radius:999px; transition:.15s; cursor:pointer; }
  .sbx-track:before { content:''; position:absolute; width:16px; height:16px; left:3px; top:3px; background:#fff; border-radius:50%; transition:.15s; box-shadow:0 1px 2px rgba(0,0,0,.2); }
  .sbx-switch input:checked + .sbx-track { background:var(--sbx-primary); }
  .sbx-switch input:checked + .sbx-track:before { transform:translateX(16px); }

  .sbx-banner { display:flex; gap:10px; padding:12px 14px; border-radius:10px; font-size:12.5px; line-height:1.45; align-items:flex-start; }
  .sbx-banner.info { background:#eef2ff; color:#3730a3; }
  .sbx-banner.ok { background:var(--sbx-green-bg); color:var(--sbx-green); }
  .sbx-banner.warn { background:var(--sbx-amber-bg); color:var(--sbx-amber); }

  .sbx-review { display:flex; flex-direction:column; gap:0; border:1px solid var(--sbx-border); border-radius:12px; overflow:hidden; }
  .sbx-review-item { display:flex; justify-content:space-between; gap:16px; padding:11px 14px; font-size:13px; }
  .sbx-review-item + .sbx-review-item { border-top:1px solid var(--sbx-border); }
  .sbx-review-k { color:var(--sbx-muted); }
  .sbx-review-v { font-weight:600; text-align:right; word-break:break-all; }

  .sbx-btn { font-family:inherit; font-size:13.5px; font-weight:600; border-radius:10px; padding:9px 16px; cursor:pointer; border:1px solid transparent; }
  .sbx-btn.primary { background:var(--sbx-primary); color:#fff; }
  .sbx-btn.primary:hover { background:#4338ca; }
  .sbx-btn.ghost { background:transparent; color:var(--sbx-text); border-color:var(--sbx-border); }
  .sbx-btn.ghost:hover { background:var(--sbx-base); }
  .sbx-btn.subtle { background:transparent; color:var(--sbx-primary); border:none; }
  .sbx-btn:disabled { opacity:.5; cursor:not-allowed; }

  .sbx-tool { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 10px; border:1px solid var(--sbx-border); border-radius:8px; font-size:13px; }
  .sbx-tool code { font-size:12px; background:var(--sbx-base); padding:1px 6px; border-radius:5px; }
  .sbx-spin { width:16px; height:16px; border:2px solid rgba(255,255,255,.5); border-top-color:#fff; border-radius:50%; animation:sbx-rot .7s linear infinite; display:inline-block; vertical-align:middle; }
  @keyframes sbx-rot { to { transform:rotate(360deg); } }

  /* OAuth consent screen */
  .sbx-oauth { width:420px; background:#fff; border-radius:14px; overflow:hidden; box-shadow:0 24px 60px rgba(10,12,30,.4); }
  .sbx-oauth-head { padding:20px 24px; border-bottom:1px solid var(--sbx-border); display:flex; align-items:center; gap:12px; }
  .sbx-oauth-lock { width:34px; height:34px; border-radius:8px; background:#eef0fe; color:#4f46e5; display:grid; place-items:center; font-size:16px; }
  .sbx-oauth-body { padding:22px 24px; }
  .sbx-oauth-scope { display:flex; gap:10px; padding:9px 0; font-size:13px; align-items:flex-start; }
  .sbx-oauth-scope .ck { color:var(--sbx-green); font-weight:700; }
  .sbx-oauth-foot { padding:16px 24px; display:flex; gap:12px; justify-content:flex-end; border-top:1px solid var(--sbx-border); background:#fbfbfe; }
  `;

  function injectStyle() {
    if (document.getElementById('sbx-style')) return;
    const s = document.createElement('style');
    s.id = 'sbx-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* --------------------------------------------------------------------- *
   *  Card that replaces / augments the Integrations tab                    *
   * --------------------------------------------------------------------- */
  function buildCard() {
    const card = el(`
      <div id="sbx-connections-card" class="ds-card w-full max-w-[960px] px-8 py-6 sbx-accent" data-c13y-component="card">
        <div class="mb-6 flex flex-col gap-1">
          <div class="flex items-center gap-2">
            <h2 class="text-md font-semibold text-neutral-strong">Agent &amp; Tool Connections</h2>
            <span class="ds-pill ds-pill--primary ds-pill--solid px-2 py-0.5" id="sbx-count"></span>
          </div>
          <p class="text-xs text-neutral-medium">
            Connect Navigator to external <strong>MCP servers</strong> (Navigator acts as a client and can use their tools &amp; resources)
            or to other agents via the <strong>Agent-to-Agent (A2A)</strong> protocol. Each connection can require its own authentication.
          </p>
        </div>
        <div class="sbx-list" id="sbx-list"></div>
        <div style="margin-top:16px;">
          <button class="sbx-btn subtle" id="sbx-add" style="display:inline-flex;align-items:center;gap:6px;">
            <span style="font-size:16px;line-height:1;">＋</span> Add Connection
          </button>
        </div>
      </div>
    `);
    card.querySelector('#sbx-add').addEventListener('click', () => openWizard());
    return card;
  }

  function typeBadge(type) {
    return `<span class="sbx-badge-type ${type}">${type.toUpperCase()}</span>`;
  }

  function renderList() {
    const list = document.getElementById('sbx-list');
    const count = document.getElementById('sbx-count');
    if (!list) return;
    count.textContent = store.connections.length + ' active';
    list.innerHTML = '';

    if (!store.connections.length) {
      list.appendChild(el(`<div class="sbx-banner info">No connections yet. Add an MCP server or an A2A agent to extend what Navigator can do.</div>`));
      return;
    }

    store.connections.forEach(c => {
      const target = c.type === 'mcp' ? c.url : (c.agentCardUrl || c.endpointUrl);
      const statusText = c.status === 'connected' ? 'Connected' : c.status === 'error' ? 'Error' : 'Not connected';
      const chips = [];
      chips.push(`<span class="sbx-chip">${esc(AUTH_LABEL[c.auth.method])}</span>`);
      if (c.type === 'mcp' && c.toolsCount) chips.push(`<span class="sbx-chip">${c.toolsCount} tools</span>`);
      if (c.type === 'a2a') chips.push(`<span class="sbx-chip">Task delegation</span>`);
      if (c.auth.account) chips.push(`<span class="sbx-chip">${esc(c.auth.account)}</span>`);

      const row = el(`
        <div class="sbx-row" data-id="${c.id}">
          ${typeBadge(c.type)}
          <div class="sbx-row-main">
            <div class="sbx-row-title">
              ${esc(c.name)}
              <span class="sbx-status ${c.status}"><span class="sbx-dot"></span>${statusText}</span>
            </div>
            <div class="sbx-row-sub">${esc(target || '')}</div>
            <div class="sbx-chips">${chips.join('')}</div>
          </div>
          <div class="sbx-row-actions">
            <button class="sbx-iconbtn" title="Test connection" data-act="test">⟳</button>
            <button class="sbx-iconbtn" title="Edit" data-act="edit">✎</button>
            <button class="sbx-iconbtn danger" title="Remove" data-act="del">🗑</button>
          </div>
        </div>
      `);
      row.querySelector('[data-act="edit"]').addEventListener('click', () => openWizard(c));
      row.querySelector('[data-act="del"]').addEventListener('click', () => {
        store.connections = store.connections.filter(x => x.id !== c.id);
        renderList();
      });
      row.querySelector('[data-act="test"]').addEventListener('click', (e) => {
        const btn = e.currentTarget;
        btn.textContent = '…';
        setTimeout(() => {
          c.status = 'connected';
          renderList();
        }, 900);
      });
      list.appendChild(row);
    });
  }

  /* --------------------------------------------------------------------- *
   *  Wizard                                                               *
   * --------------------------------------------------------------------- */
  function newDraft() {
    return {
      id: uid(),
      type: null,
      name: '', description: '',
      url: '', transport: 'streamable_http',
      agentCardUrl: '', endpointUrl: '',
      auth: {
        method: 'oauth2_auth_code',
        apiKeyLocation: 'header', apiKeyHeader: 'Authorization', apiKeyValue: '',
        bearerToken: '',
        clientId: '', clientSecret: '', authUrl: '', tokenUrl: '', scopes: '',
        connected: false, account: null,
      },
      permissions: { allowTools: true, approval: 'readonly', allowResources: true, allowDelegation: true, enabledTools: {} },
      visibility: 'all',
      enabled: true,
      status: 'disconnected',
      toolsCount: 0,
    };
  }

  const STEPS = ['Type', 'Details', 'Authentication', 'Permissions', 'Review'];

  function openWizard(existing) {
    const draft = existing ? JSON.parse(JSON.stringify(existing)) : newDraft();
    const editing = !!existing;
    let step = editing ? 1 : 0;

    const overlay = el(`<div class="sbx-overlay sbx-accent"></div>`);
    const modal = el(`
      <div class="sbx-modal" role="dialog" aria-modal="true">
        <button class="sbx-close" title="Close">✕</button>
        <div class="sbx-modal-head">
          <div class="sbx-modal-title">${editing ? 'Edit connection' : 'Add connection'}</div>
          <div class="sbx-modal-sub" id="sbx-substep"></div>
        </div>
        <div class="sbx-steps" id="sbx-progress"></div>
        <div class="sbx-step-label" id="sbx-steplabel"></div>
        <div class="sbx-body" id="sbx-wizbody"></div>
        <div class="sbx-foot">
          <button class="sbx-btn ghost" id="sbx-back">Back</button>
          <button class="sbx-btn primary" id="sbx-next">Continue</button>
        </div>
      </div>
    `);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    modal.querySelector('.sbx-close').addEventListener('click', close);
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
    });

    const body = modal.querySelector('#sbx-wizbody');
    const backBtn = modal.querySelector('#sbx-back');
    const nextBtn = modal.querySelector('#sbx-next');

    function renderProgress() {
      const p = modal.querySelector('#sbx-progress');
      p.innerHTML = STEPS.map((_, i) => `<div class="sbx-step ${i < step ? 'done' : i === step ? 'active' : ''}"></div>`).join('');
      modal.querySelector('#sbx-steplabel').textContent = `Step ${step + 1} of ${STEPS.length}`;
      modal.querySelector('#sbx-substep').textContent = STEPS[step];
    }

    function render() {
      renderProgress();
      body.innerHTML = '';
      ({ 0: stepType, 1: stepDetails, 2: stepAuth, 3: stepPerms, 4: stepReview }[step])();
      backBtn.style.visibility = step === 0 ? 'hidden' : 'visible';
      nextBtn.textContent = step === STEPS.length - 1 ? (editing ? 'Save changes' : 'Add connection') : 'Continue';
    }

    /* ---- Step 0: type ---- */
    function stepType() {
      const wrap = el(`
        <div class="sbx-choices">
          <div class="sbx-choice ${draft.type === 'mcp' ? 'sel' : ''}" data-type="mcp">
            <div class="sbx-choice-ic" style="background:#eef0fe;color:#4f46e5;">MCP</div>
            <div><h4>MCP Server (client)</h4>
              <p>Connect Navigator to a Model Context Protocol server. Navigator becomes an MCP client and can call the server's tools and read its resources to answer employee questions.</p></div>
          </div>
          <div class="sbx-choice ${draft.type === 'a2a' ? 'sel' : ''}" data-type="a2a">
            <div class="sbx-choice-ic" style="background:#e7f6f1;color:#0f8f6b;">A2A</div>
            <div><h4>Agent-to-Agent (A2A)</h4>
              <p>Connect Navigator to another AI agent using the A2A protocol. Navigator can discover the remote agent via its Agent Card and delegate tasks or exchange messages with it.</p></div>
          </div>
        </div>
      `);
      wrap.querySelectorAll('.sbx-choice').forEach(c => c.addEventListener('click', () => {
        draft.type = c.dataset.type;
        if (draft.type === 'a2a') draft.auth.method = 'oauth2_auth_code';
        render();
      }));
      body.appendChild(wrap);
    }

    /* ---- Step 1: details ---- */
    function stepDetails() {
      if (draft.type === 'mcp') {
        body.appendChild(field('Display name', 'name', draft.name, 'text', true, 'Shown to admins in the connection list.'));
        body.appendChild(field('Description', 'description', draft.description, 'textarea', false, 'Optional. Helps Navigator decide when to use this server.'));
        body.appendChild(field('Server URL', 'url', draft.url, 'text', true, 'The MCP endpoint, e.g. https://mcp.example.com/sse'));
        body.appendChild(selectField('Transport', 'transport', draft.transport, [
          ['streamable_http', 'Streamable HTTP (recommended)'],
          ['sse', 'Server-Sent Events (SSE)'],
          ['websocket', 'WebSocket'],
        ], 'How Navigator communicates with the server.'));
      } else {
        body.appendChild(field('Agent name', 'name', draft.name, 'text', true, 'Shown to admins in the connection list.'));
        body.appendChild(field('Description', 'description', draft.description, 'textarea', false, 'Optional. What this agent is good at.'));
        body.appendChild(field('Agent Card URL', 'agentCardUrl', draft.agentCardUrl, 'text', true, 'A2A discovery document, e.g. https://agent.example.com/.well-known/agent.json'));
        body.appendChild(field('Endpoint URL (optional)', 'endpointUrl', draft.endpointUrl, 'text', false, 'Override the endpoint from the Agent Card if needed.'));
        body.appendChild(el(`<div class="sbx-banner info">Navigator will fetch the Agent Card to discover the agent's name, skills and streaming support when you test the connection.</div>`));
      }
    }

    /* ---- Step 2: authentication ---- */
    function stepAuth() {
      const methods = draft.type === 'mcp'
        ? ['none', 'apikey', 'bearer', 'oauth2_auth_code', 'oauth2_client_creds']
        : ['none', 'apikey', 'bearer', 'oauth2_auth_code', 'oauth2_client_creds'];

      const sel = el(`
        <div class="sbx-field">
          <label class="sbx-label">Authentication method<span class="sbx-req">(Required)</span></label>
          <div class="sbx-choices" id="sbx-authmethods"></div>
        </div>
      `);
      const cont = sel.querySelector('#sbx-authmethods');
      methods.forEach(m => {
        const r = el(`<div class="sbx-radio ${draft.auth.method === m ? 'sel' : ''}">
          <input type="radio" name="sbx-auth" ${draft.auth.method === m ? 'checked' : ''}>
          <div><div class="t">${AUTH_LABEL[m]}</div><div class="d">${authHint(m)}</div></div>
        </div>`);
        r.addEventListener('click', () => { draft.auth.method = m; draft.auth.connected = false; draft.auth.account = null; render(); });
        cont.appendChild(r);
      });
      body.appendChild(sel);

      const m = draft.auth.method;
      const detail = el(`<div id="sbx-authdetail"></div>`);
      body.appendChild(detail);

      if (m === 'apikey') {
        detail.appendChild(selectField('Send key in', 'apiKeyLocation', draft.auth.apiKeyLocation, [
          ['header', 'HTTP header'], ['query', 'Query parameter'],
        ], null, draft.auth));
        detail.appendChild(field(draft.auth.apiKeyLocation === 'header' ? 'Header name' : 'Parameter name',
          'apiKeyHeader', draft.auth.apiKeyHeader, 'text', true, null, draft.auth));
        detail.appendChild(field('API key', 'apiKeyValue', draft.auth.apiKeyValue, 'password', true, 'Stored encrypted. Only used server-side.', draft.auth));
      } else if (m === 'bearer') {
        detail.appendChild(field('Bearer token', 'bearerToken', draft.auth.bearerToken, 'password', true, 'Sent as: Authorization: Bearer …', draft.auth));
      } else if (m === 'oauth2_auth_code' || m === 'oauth2_client_creds') {
        detail.appendChild(field('Client ID', 'clientId', draft.auth.clientId, 'text', true, null, draft.auth));
        detail.appendChild(field('Client secret', 'clientSecret', draft.auth.clientSecret, 'password', true, null, draft.auth));
        if (m === 'oauth2_auth_code')
          detail.appendChild(field('Authorization URL', 'authUrl', draft.auth.authUrl, 'text', true, 'e.g. https://provider.com/oauth/authorize', draft.auth));
        detail.appendChild(field('Token URL', 'tokenUrl', draft.auth.tokenUrl, 'text', true, 'e.g. https://provider.com/oauth/token', draft.auth));
        detail.appendChild(field('Scopes', 'scopes', draft.auth.scopes, 'text', false, 'Space or comma separated, e.g. read:content offline_access', draft.auth));

        if (m === 'oauth2_auth_code') {
          const cb = el(`<div class="sbx-field">
            <label class="sbx-label">Redirect / Callback URL</label>
            <div class="sbx-inputwrap">
              <input class="sbx-input" readonly value="${esc(CALLBACK_URL)}">
              <button class="sbx-reveal" id="sbx-copycb">Copy</button>
            </div>
            <div class="sbx-help">Register this URL with your OAuth provider.</div>
          </div>`);
          cb.querySelector('#sbx-copycb').addEventListener('click', (e) => {
            navigator.clipboard?.writeText(CALLBACK_URL); e.target.textContent = 'Copied';
            setTimeout(() => e.target.textContent = 'Copy', 1200);
          });
          detail.appendChild(cb);
        }

        // authorize / test-token action
        const authState = el(`<div id="sbx-oauthstate"></div>`);
        detail.appendChild(authState);
        renderOAuthState(authState, m);
      } else {
        detail.appendChild(el(`<div class="sbx-banner warn">This connection will be made without authentication. Only use this for public or internally-trusted endpoints.</div>`));
      }
    }

    function renderOAuthState(container, m) {
      container.innerHTML = '';
      if (draft.auth.connected) {
        container.appendChild(el(`<div class="sbx-banner ok">✓ Authorized${draft.auth.account ? ' as <strong>' + esc(draft.auth.account) + '</strong>' : ''}. Access &amp; refresh tokens stored.</div>`));
        const dis = el(`<button class="sbx-btn ghost" style="margin-top:10px;">Revoke authorization</button>`);
        dis.addEventListener('click', () => { draft.auth.connected = false; draft.auth.account = null; renderOAuthState(container, m); });
        container.appendChild(dis);
      } else {
        const label = m === 'oauth2_auth_code' ? 'Authorize with provider' : 'Request &amp; verify token';
        const btn = el(`<button class="sbx-btn primary" style="margin-top:6px;">${label}</button>`);
        btn.addEventListener('click', () => {
          if (m === 'oauth2_auth_code') {
            runOAuthConsent(draft).then(account => {
              draft.auth.connected = true; draft.auth.account = account; renderOAuthState(container, m);
            }).catch(() => {});
          } else {
            btn.disabled = true; btn.innerHTML = '<span class="sbx-spin"></span> Requesting token…';
            setTimeout(() => { draft.auth.connected = true; renderOAuthState(container, m); }, 1100);
          }
        });
        container.appendChild(btn);
        container.appendChild(el(`<div class="sbx-help" style="margin-top:8px;">You can also finish setup and authorize later — the connection will stay in “Not connected” until then.</div>`));
      }
    }

    /* ---- Step 3: permissions ---- */
    function stepPerms() {
      if (draft.type === 'mcp') {
        body.appendChild(toggleRow('Allow tool calls', 'Let Navigator invoke this server\'s tools while answering.', draft.permissions, 'allowTools'));
        body.appendChild(toggleRow('Allow resource access', 'Let Navigator read resources (files, records) exposed by the server.', draft.permissions, 'allowResources'));

        body.appendChild(el(`<div style="margin-top:18px;"></div>`));
        body.appendChild(el(`<label class="sbx-label" style="display:block;margin-bottom:8px;">Tool approval policy</label>`));
        const opts = [
          ['each', 'Ask every time', 'Navigator requests user confirmation before each tool call.'],
          ['readonly', 'Auto-approve read-only tools', 'Read-only tools run automatically; write actions need confirmation.'],
          ['all', 'Auto-approve all tools', 'All tools run without confirmation. Use with trusted servers only.'],
        ];
        const grp = el(`<div style="display:flex;flex-direction:column;gap:8px;"></div>`);
        opts.forEach(([v, t, d]) => {
          const r = el(`<div class="sbx-radio ${draft.permissions.approval === v ? 'sel' : ''}">
            <input type="radio" name="sbx-appr" ${draft.permissions.approval === v ? 'checked' : ''}>
            <div><div class="t">${t}</div><div class="d">${d}</div></div></div>`);
          r.addEventListener('click', () => { draft.permissions.approval = v; render(); });
          grp.appendChild(r);
        });
        body.appendChild(grp);

        // discovered tools (mock) — only after a successful connection/test, else hint
        body.appendChild(el(`<div style="margin-top:18px;"></div>`));
        body.appendChild(el(`<label class="sbx-label" style="display:block;margin-bottom:8px;">Discovered tools</label>`));
        if (draft.status === 'connected') {
          const toolsWrap = el(`<div style="display:flex;flex-direction:column;gap:8px;"></div>`);
          MOCK_TOOLS.mcp.forEach(t => {
            if (!(t in draft.permissions.enabledTools)) draft.permissions.enabledTools[t] = true;
            const row = el(`<div class="sbx-tool"><div><code>${t}</code></div></div>`);
            row.appendChild(switchEl(draft.permissions.enabledTools, t));
            toolsWrap.appendChild(row);
          });
          body.appendChild(toolsWrap);
        } else {
          body.appendChild(el(`<div class="sbx-banner info">Tools are listed after a successful connection test (Review step). You can then enable or disable individual tools.</div>`));
        }
      } else {
        body.appendChild(toggleRow('Allow task delegation', 'Let Navigator send tasks/messages to this agent and use its responses.', draft.permissions, 'allowDelegation'));
        body.appendChild(el(`<div style="margin-top:18px;"></div>`));
        body.appendChild(el(`<label class="sbx-label" style="display:block;margin-bottom:8px;">Handling policy</label>`));
        const opts = [
          ['each', 'Ask every time', 'Confirm with the user before delegating to this agent.'],
          ['all', 'Auto-delegate', 'Navigator may delegate automatically when relevant.'],
        ];
        const grp = el(`<div style="display:flex;flex-direction:column;gap:8px;"></div>`);
        opts.forEach(([v, t, d]) => {
          const r = el(`<div class="sbx-radio ${draft.permissions.approval === v ? 'sel' : ''}">
            <input type="radio" name="sbx-appr2" ${draft.permissions.approval === v ? 'checked' : ''}>
            <div><div class="t">${t}</div><div class="d">${d}</div></div></div>`);
          r.addEventListener('click', () => { draft.permissions.approval = v; render(); });
          grp.appendChild(r);
        });
        body.appendChild(grp);
      }

      // visibility (shared)
      body.appendChild(el(`<div style="margin-top:18px;"></div>`));
      body.appendChild(selectField('Who can use this connection', 'visibility', draft.visibility, [
        ['all', 'All users'], ['selected', 'Selected users & groups'],
      ], 'Restrict which employees can trigger this connection through Navigator.'));
    }

    /* ---- Step 4: review ---- */
    function stepReview() {
      const target = draft.type === 'mcp' ? draft.url : (draft.agentCardUrl || draft.endpointUrl);
      const items = [
        ['Type', draft.type === 'mcp' ? 'MCP Server (client)' : 'A2A Agent'],
        ['Name', draft.name || '—'],
        [draft.type === 'mcp' ? 'Server URL' : 'Agent Card URL', target || '—'],
      ];
      if (draft.type === 'mcp') items.push(['Transport', draft.transport]);
      items.push(['Authentication', AUTH_LABEL[draft.auth.method] + (draft.auth.connected ? ' · authorized' : '')]);
      if (draft.type === 'mcp') {
        items.push(['Tool calls', draft.permissions.allowTools ? 'Allowed' : 'Blocked']);
        items.push(['Approval', { each: 'Ask every time', readonly: 'Auto read-only', all: 'Auto all' }[draft.permissions.approval] || '—']);
      } else {
        items.push(['Delegation', draft.permissions.allowDelegation ? 'Allowed' : 'Blocked']);
      }
      items.push(['Visibility', draft.visibility === 'all' ? 'All users' : 'Selected users & groups']);

      const review = el(`<div class="sbx-review">${items.map(([k, v]) =>
        `<div class="sbx-review-item"><div class="sbx-review-k">${esc(k)}</div><div class="sbx-review-v">${esc(v)}</div></div>`).join('')}</div>`);
      body.appendChild(review);

      body.appendChild(el(`<div style="margin-top:16px;"></div>`));
      const testWrap = el(`<div id="sbx-testwrap"></div>`);
      body.appendChild(testWrap);
      const testBtn = el(`<button class="sbx-btn ghost" style="width:100%;">Test connection</button>`);
      testBtn.addEventListener('click', () => {
        testBtn.disabled = true; testBtn.innerHTML = '<span class="sbx-spin" style="border-color:rgba(79,70,229,.3);border-top-color:#4f46e5;"></span> Connecting…';
        setTimeout(() => {
          draft.status = 'connected';
          if (draft.type === 'mcp') draft.toolsCount = MOCK_TOOLS.mcp.length;
          testWrap.innerHTML = '';
          if (draft.type === 'mcp') {
            testWrap.appendChild(el(`<div class="sbx-banner ok">✓ Connected. Discovered ${MOCK_TOOLS.mcp.length} tools and 3 resources. Handshake completed (protocol 2025-06-18).</div>`));
          } else {
            testWrap.appendChild(el(`<div class="sbx-banner ok">✓ Agent Card resolved. Skills: research, summarize, translate. Streaming: supported.</div>`));
          }
        }, 1200);
      });
      testWrap.appendChild(testBtn);
    }

    /* ---- generic field builders ---- */
    function field(label, key, val, type, required, help, obj) {
      const tgt = obj || draft;
      const f = el(`<div class="sbx-field">
        <label class="sbx-label">${label}${required ? '<span class="sbx-req">(Required)</span>' : ''}</label>
        <div class="sbx-inputwrap">
          ${type === 'textarea'
            ? `<textarea class="sbx-textarea"></textarea>`
            : `<input class="sbx-input" type="${type === 'password' ? 'password' : 'text'}">`}
          ${type === 'password' ? '<button class="sbx-reveal" data-reveal>Show</button>' : ''}
        </div>
        ${help ? `<div class="sbx-help">${help}</div>` : ''}
        <div class="sbx-err" style="display:none;"></div>
      </div>`);
      const input = f.querySelector('textarea, input');
      input.value = val || '';
      input.addEventListener('input', () => { tgt[key] = input.value; });
      const rev = f.querySelector('[data-reveal]');
      if (rev) rev.addEventListener('click', () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        rev.textContent = show ? 'Hide' : 'Show';
      });
      return f;
    }

    function selectField(label, key, val, options, help, obj) {
      const tgt = obj || draft;
      const f = el(`<div class="sbx-field">
        <label class="sbx-label">${label}</label>
        <select class="sbx-select">${options.map(([v, t]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${t}</option>`).join('')}</select>
        ${help ? `<div class="sbx-help">${help}</div>` : ''}
      </div>`);
      const s = f.querySelector('select');
      s.addEventListener('change', () => {
        tgt[key] = s.value;
        // some selects change downstream fields (api key location) -> re-render
        if (key === 'apiKeyLocation' || key === 'transport') render();
      });
      return f;
    }

    function toggleRow(title, desc, obj, key) {
      const r = el(`<div class="sbx-toggle-row">
        <div><div class="tt">${title}</div><div class="td">${desc}</div></div>
      </div>`);
      r.appendChild(switchEl(obj, key));
      return r;
    }

    function switchEl(obj, key) {
      const sw = el(`<label class="sbx-switch"><input type="checkbox" ${obj[key] ? 'checked' : ''}><span class="sbx-track"></span></label>`);
      sw.querySelector('input').addEventListener('change', e => { obj[key] = e.target.checked; });
      return sw;
    }

    /* ---- validation & navigation ---- */
    function validate() {
      // clear
      body.querySelectorAll('.sbx-err').forEach(e => { e.style.display = 'none'; });
      body.querySelectorAll('.sbx-input').forEach(i => i.classList.remove('invalid'));
      let ok = true;
      const fail = (input) => { ok = false; input?.classList.add('invalid'); const err = input?.closest('.sbx-field')?.querySelector('.sbx-err'); if (err) { err.textContent = 'This field is required.'; err.style.display = 'block'; } };

      if (step === 0 && !draft.type) { ok = false; }
      if (step === 1) {
        if (!draft.name.trim()) fail(body.querySelectorAll('.sbx-input')[0]);
        if (draft.type === 'mcp' && !draft.url.trim()) fail([...body.querySelectorAll('.sbx-input')].find(i => i.value === draft.url) || body.querySelectorAll('.sbx-input')[1]);
        if (draft.type === 'a2a' && !draft.agentCardUrl.trim()) fail([...body.querySelectorAll('.sbx-input')].find(i => i.value === draft.agentCardUrl));
      }
      if (step === 2) {
        const m = draft.auth.method;
        if (m === 'apikey' && !draft.auth.apiKeyValue.trim()) ok = false;
        if (m === 'bearer' && !draft.auth.bearerToken.trim()) ok = false;
        if ((m === 'oauth2_auth_code' || m === 'oauth2_client_creds')) {
          if (!draft.auth.clientId.trim() || !draft.auth.clientSecret.trim() || !draft.auth.tokenUrl.trim()) ok = false;
          if (m === 'oauth2_auth_code' && !draft.auth.authUrl.trim()) ok = false;
        }
        if (!ok) {
          body.querySelectorAll('.sbx-input').forEach(i => { if (!i.readOnly && !i.value.trim()) i.classList.add('invalid'); });
        }
      }
      return ok;
    }

    nextBtn.addEventListener('click', () => {
      if (!validate()) return;
      if (step < STEPS.length - 1) { step++; render(); return; }
      // save
      if (draft.type === 'mcp' && draft.status === 'connected') draft.toolsCount = MOCK_TOOLS.mcp.length;
      const idx = store.connections.findIndex(c => c.id === draft.id);
      if (idx >= 0) store.connections[idx] = draft; else store.connections.push(draft);
      renderList();
      close();
    });
    backBtn.addEventListener('click', () => { if (step > 0) { step--; render(); } });

    render();
  }

  /* --------------------------------------------------------------------- *
   *  Simulated OAuth consent screen                                        *
   * --------------------------------------------------------------------- */
  function runOAuthConsent(draft) {
    return new Promise((resolve, reject) => {
      let provider = 'the provider';
      try { provider = new URL(draft.auth.authUrl).hostname.replace(/^www\./, ''); } catch (e) {}
      const scopes = (draft.auth.scopes || 'read offline_access').split(/[,\s]+/).filter(Boolean);
      const overlay = el(`<div class="sbx-overlay sbx-accent" style="z-index:2147483600;"></div>`);
      const box = el(`
        <div class="sbx-oauth">
          <div class="sbx-oauth-head">
            <div class="sbx-oauth-lock">🔒</div>
            <div>
              <div style="font-size:15px;font-weight:700;">Sign in to ${esc(provider)}</div>
              <div style="font-size:12px;color:#6b7180;">Staffbase Navigator wants to access your account</div>
            </div>
          </div>
          <div class="sbx-oauth-body">
            <div style="font-size:13px;margin-bottom:10px;">This will allow <strong>Staffbase Navigator</strong> to:</div>
            ${scopes.map(s => `<div class="sbx-oauth-scope"><span class="ck">✓</span><span>${esc(scopeText(s))}</span></div>`).join('')}
            <div style="margin-top:14px;font-size:11px;color:#6b7180;">Client ID: ${esc(draft.auth.clientId || '—')} · Redirect: ${esc(CALLBACK_URL)}</div>
          </div>
          <div class="sbx-oauth-foot">
            <button class="sbx-btn ghost" data-a="cancel">Cancel</button>
            <button class="sbx-btn primary" data-a="allow">Authorize</button>
          </div>
        </div>
      `);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      box.querySelector('[data-a="cancel"]').addEventListener('click', () => { overlay.remove(); reject(); });
      box.querySelector('[data-a="allow"]').addEventListener('click', (e) => {
        const btn = e.target; btn.disabled = true; btn.innerHTML = '<span class="sbx-spin"></span> Redirecting…';
        setTimeout(() => { overlay.remove(); resolve('mika.adams@' + (provider.split('.')[0] || 'provider') + '.com'); }, 1000);
      });
    });
  }

  function scopeText(s) {
    const map = {
      'read': 'Read your content and data',
      'read:content': 'Read your content',
      'write': 'Create and update content on your behalf',
      'offline_access': 'Maintain access when you are offline (refresh tokens)',
      'profile': 'View your basic profile information',
      'email': 'View your email address',
    };
    return map[s] || 'Access: ' + s;
  }
  function authHint(m) {
    return {
      none: 'Connect without credentials (public / internally trusted only).',
      apikey: 'Send a static key in a header or query parameter.',
      bearer: 'Send a fixed Bearer token in the Authorization header.',
      oauth2_auth_code: 'User-delegated access. Includes an interactive authorize step.',
      oauth2_client_creds: 'Machine-to-machine access using client ID & secret.',
    }[m];
  }

  /* --------------------------------------------------------------------- *
   *  Mount / keep-alive against SPA re-renders                             *
   * --------------------------------------------------------------------- */
  function integrationsPanel() {
    return document.querySelector('div[role="tabpanel"][aria-labelledby*="trigger-integrations"]');
  }

  function mount() {
    const panel = integrationsPanel();
    if (!panel) return;
    if (panel.querySelector('#sbx-connections-card')) return;
    injectStyle();
    const container = panel.querySelector(':scope > div') || panel;
    const card = buildCard();
    container.insertBefore(card, container.firstChild);
    renderList();
  }

  const obs = new MutationObserver(() => { mount(); });
  obs.observe(document.body, { childList: true, subtree: true });
  // initial attempts
  let tries = 0;
  const iv = setInterval(() => { mount(); if (++tries > 40 || document.getElementById('sbx-connections-card')) clearInterval(iv); }, 250);
  mount();
})();
