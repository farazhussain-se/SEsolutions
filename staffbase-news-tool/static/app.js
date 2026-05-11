// Staffbase News Demo Tool — frontend wizard
//
// State is held in `S` and the `creds` object. Steps unlock as the user
// progresses (S.scanResult must exist before Step 3, S.plan before Step 4).

const PRESETS    = window.__PRESETS__ || [];
const INDUSTRIES = window.__INDUSTRIES__ || {};

const S = {
  step:        1,
  scanResult:  null,   // { channels, posts, summary }
  plan:        null,   // { post_changes, channel_changes }
  config:      null,   // { demo_date, industry, account_name, span_days, rename_channels }
  applyResult: null,
};

const creds = {
  base:  localStorage.getItem("sb_news_base")  || (PRESETS[0]?.base || ""),
  token: localStorage.getItem("sb_news_token") || "",
};

// ── Boot ──────────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  // Step 1 inputs
  document.getElementById("connect-base").value  = creds.base;
  document.getElementById("connect-token").value = creds.token;
  // Settings panel
  document.getElementById("sp-base").value  = creds.base;
  document.getElementById("sp-token").value = creds.token;
  // Topbar
  refreshTopbar();
  // Presets
  renderPresets("preset-list",     applyPresetToConnect);
  renderPresets("sp-preset-list",  applyPresetToSettings);
  // Industries dropdown
  const sel = document.getElementById("cfg-industry");
  Object.entries(INDUSTRIES).forEach(([key, info]) => {
    const o = document.createElement("option");
    o.value = key; o.textContent = info.label;
    sel.appendChild(o);
  });
  // Default demo date = today
  document.getElementById("cfg-demo-date").value = new Date().toISOString().slice(0, 10);
});

// ── Helpers ───────────────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }
function show(id, on=true) { $(id).style.display = on ? "" : "none"; }
function setLoading(on, text="Working…") {
  $("loading-text").textContent = text;
  $("loading-overlay").classList.toggle("open", on);
}
function togglePwd(id, btn) {
  const i = $(id);
  i.type = i.type === "password" ? "text" : "password";
  btn.textContent = i.type === "password" ? "👁" : "🙈";
}
function refreshTopbar() {
  try {
    const host = new URL(creds.base).hostname;
    $("topbar-instance").textContent = host;
  } catch { $("topbar-instance").textContent = "(no instance)"; }
}
function setConnDot(state) {
  const dot = $("conn-dot");
  dot.classList.remove("ok","bad");
  if (state === "ok")  dot.classList.add("ok");
  if (state === "bad") dot.classList.add("bad");
}

async function api(path, opts={}) {
  const headers = {
    "Content-Type": "application/json",
    "X-SB-Base":  creds.base,
    "X-SB-Token": creds.token,
    ...(opts.headers || {}),
  };
  const r = await fetch(path, { ...opts, headers });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) {
    throw new Error(j.error || `${r.status} ${r.statusText}`);
  }
  return j;
}

// ── Step navigation ───────────────────────────────────────────────────────
function canGoTo(n) {
  if (n <= 1) return true;
  if (n === 2) return !!creds.token && !!creds.base;
  if (n === 3) return !!S.scanResult;
  if (n === 4) return !!S.plan;
  return false;
}
function goToStep(n) {
  if (!canGoTo(n)) return;
  for (let i = 1; i <= 4; i++) {
    $("panel-" + i).classList.toggle("active", i === n);
    const nav = $("nav-" + i);
    nav.classList.toggle("active", i === n);
    nav.classList.toggle("done",   i < n);
    nav.classList.toggle("locked", !canGoTo(i));
  }
  S.step = n;
  if (n === 4) renderApplyConfirm();
}

// ── Presets ───────────────────────────────────────────────────────────────
function renderPresets(containerId, onClick) {
  const c = $(containerId);
  c.innerHTML = "";
  PRESETS.forEach(p => {
    const div = document.createElement("div");
    div.className = "preset-item";
    div.innerHTML = `<span class="preset-name">${p.label}</span><span class="preset-sub">${p.sub}</span>`;
    div.onclick = () => onClick(p);
    c.appendChild(div);
  });
}
function applyPresetToConnect(p) {
  $("connect-base").value = p.base;
  // leave token field as-is so the user can paste
  $("connect-token").focus();
}
function applyPresetToSettings(p) {
  $("sp-base").value = p.base;
  $("sp-token").focus();
}

// ── Step 1: Connect ───────────────────────────────────────────────────────
async function testConnect() {
  const base  = $("connect-base").value.trim();
  const token = $("connect-token").value.trim();
  if (!base || !token) return setResult("connect-result", "Need both base URL and token", false);
  setLoading(true, "Testing connection…");
  try {
    await fetch("/api/connect", {
      method: "POST",
      headers: { "Content-Type":"application/json", "X-SB-Base": base, "X-SB-Token": token },
    }).then(r => r.json()).then(j => {
      if (!j.ok) throw new Error(j.error || "Connection failed");
    });
    setResult("connect-result", "✓ Connected", true);
    setConnDot("ok");
  } catch (e) {
    setResult("connect-result", "✗ " + e.message, false);
    setConnDot("bad");
  } finally { setLoading(false); }
}

async function saveAndScan() {
  const base  = $("connect-base").value.trim();
  const token = $("connect-token").value.trim();
  if (!base || !token) return setResult("connect-result", "Need both base URL and token", false);
  creds.base  = base;
  creds.token = token;
  localStorage.setItem("sb_news_base",  base);
  localStorage.setItem("sb_news_token", token);
  refreshTopbar();
  await runScan();
}

async function runScan() {
  setLoading(true, "Pulling channels and posts…");
  try {
    const j = await api("/api/scan", { method: "POST" });
    S.scanResult = { channels: j.channels, posts: j.posts, summary: j.summary };
    renderScan();
    setConnDot("ok");
    goToStep(2);
  } catch (e) {
    setResult("connect-result", "✗ " + e.message, false);
    setConnDot("bad");
  } finally { setLoading(false); }
}

function rescan() { runScan(); }

function setResult(id, msg, ok) {
  const el = $(id);
  el.textContent = msg;
  el.classList.remove("ok","bad");
  el.classList.add(ok ? "ok" : "bad");
}

// ── Step 2: Scan rendering ────────────────────────────────────────────────
function renderScan() {
  const { channels, posts, summary } = S.scanResult;
  const stats = $("scan-stats");
  stats.innerHTML = `
    <div class="stat-card"><div class="stat-num">${summary.channel_count}</div><div class="stat-label">Channels</div></div>
    <div class="stat-card"><div class="stat-num">${summary.post_count}</div><div class="stat-label">Posts</div></div>
    <div class="stat-card"><div class="stat-num">${summary.published_count}</div><div class="stat-label">Published (will respread)</div></div>
  `;

  const cl = $("channel-list");
  $("ch-count").textContent = `(${channels.length})`;
  cl.innerHTML = channels.length
    ? channels.map(c => `<div class="channel-row"><span>${escape(c.title)}</span><span class="badge">${c.post_count} posts</span></div>`).join("")
    : `<div class="empty-state">No channels visible to this token.</div>`;

  const pl = $("post-list");
  $("post-count").textContent = `(showing ${Math.min(posts.length, 50)} of ${posts.length})`;
  pl.innerHTML = posts.length
    ? posts.slice(0, 50).map(p => `
        <div class="post-row">
          <div class="post-title">${escape(p.title)}</div>
          <div class="post-meta">
            <span class="channel-tag">${escape(p.channel || "")}</span>
            <span>${p.published ? new Date(p.published).toLocaleDateString() : "(unpublished)"}</span>
          </div>
        </div>`).join("")
    : `<div class="empty-state">No posts found.</div>`;
}

// ── Step 3: Configure & plan ──────────────────────────────────────────────
async function buildPlan() {
  const demo_date    = $("cfg-demo-date").value;
  const industry     = $("cfg-industry").value;
  const account_name = $("cfg-account").value.trim();
  const span_days    = parseInt($("cfg-span-days").value, 10) || 90;
  const rename       = $("cfg-rename").checked;
  if (!demo_date) return alert("Please pick a demo date.");

  S.config = { demo_date, industry, account_name, span_days, rename_channels: rename };

  setLoading(true, "Computing date spread…");
  try {
    const j = await api("/api/plan", {
      method: "POST",
      body: JSON.stringify({
        posts:            S.scanResult.posts,
        channels:         S.scanResult.channels,
        demo_date,
        industry,
        account_name,
        span_days,
        rename_channels: rename,
      }),
    });
    S.plan = { post_changes: j.post_changes, channel_changes: j.channel_changes };
    renderPlanPreview();
    show("plan-preview", true);
    // Update sidebar to show step 4 unlocked
    $("nav-4").classList.remove("locked");
  } catch (e) {
    alert("Plan failed: " + e.message);
  } finally { setLoading(false); }
}

function renderPlanPreview() {
  const { post_changes, channel_changes } = S.plan;
  $("plan-post-count").textContent = `${post_changes.length} posts`;
  $("plan-ch-count").textContent   = `${channel_changes.filter(c => !c.skip).length} renames`;

  $("plan-posts").innerHTML = post_changes.length
    ? post_changes.map(p => `
        <div class="plan-row">
          <div class="row-title">${escape(p.title)}</div>
          <div class="row-change">
            <span class="old">${fmt(p.old)}</span>
            <span class="arrow">→</span>
            <span class="new">${fmt(p.new)}</span>
          </div>
        </div>`).join("")
    : `<div class="empty-state">No published posts to respread.</div>`;

  $("plan-channels").innerHTML = channel_changes.length
    ? channel_changes.map(c => c.skip
        ? `<div class="plan-row skipped"><div class="channel-name">${escape(c.old_title)}</div><div class="row-change">(unchanged — no template)</div></div>`
        : `<div class="plan-row">
             <div class="channel-name">${escape(c.new_title)}</div>
             <div class="channel-old">was: ${escape(c.old_title)}</div>
           </div>`).join("")
    : `<div class="empty-state">No channels to rename.</div>`;
}

// ── Step 4: Apply ─────────────────────────────────────────────────────────
function renderApplyConfirm() {
  if (!S.plan) return;
  const renamed = S.plan.channel_changes.filter(c => !c.skip).length;
  $("confirm-card").innerHTML = `
    <h3>Ready to apply</h3>
    <ul>
      <li><span>Posts to update</span> <strong>${S.plan.post_changes.length}</strong></li>
      <li><span>Channels to rename</span> <strong>${renamed}</strong></li>
      <li><span>Demo date</span> <strong>${S.config.demo_date}</strong></li>
      <li><span>Industry</span> <strong>${INDUSTRIES[S.config.industry]?.label || S.config.industry}</strong></li>
    </ul>
    <div class="warn">⚠ Each post is PUT individually. A snapshot is saved first so you can roll back from the Snapshots panel.</div>
  `;
}

async function apply() {
  setLoading(true, "Applying changes…");
  try {
    const j = await api("/api/apply", {
      method: "POST",
      body: JSON.stringify(S.plan),
    });
    S.applyResult = j.results;
    renderApplyResults();
  } catch (e) {
    alert("Apply failed: " + e.message);
  } finally { setLoading(false); }
}

function renderApplyResults() {
  const r = S.applyResult;
  show("apply-confirm", false);
  show("apply-results", true);
  $("apply-results").innerHTML = `
    <div class="results-card">
      <h2 class="section-title" style="margin-top:0">Done</h2>
      <div class="results-summary">
        <div class="results-stat"><div class="num ok">${r.posts_updated}</div><div class="lbl">Posts updated</div></div>
        <div class="results-stat"><div class="num ${r.posts_failed?'bad':'ok'}">${r.posts_failed}</div><div class="lbl">Posts failed</div></div>
        <div class="results-stat"><div class="num ok">${r.channels_updated}</div><div class="lbl">Channels updated</div></div>
        <div class="results-stat"><div class="num ${r.channels_failed?'bad':'ok'}">${r.channels_failed}</div><div class="lbl">Channels failed</div></div>
      </div>
      ${r.errors && r.errors.length ? `<div class="error-list"><pre>${escape(r.errors.join("\n"))}</pre></div>` : ""}
      <div class="action-row" style="margin-top:1rem">
        <button class="btn btn-outline" onclick="resetApp()">↺ New Run</button>
        <button class="btn btn-outline" onclick="openSnapshots()">🗂 Snapshots</button>
        <button class="btn btn-danger" onclick="rollbackLatest('${r.snapshot_id}')">↩ Roll Back This Run</button>
      </div>
    </div>
  `;
}

async function rollbackLatest(sid) {
  if (!confirm("Roll back all changes from this run?")) return;
  setLoading(true, "Restoring snapshot…");
  try {
    const j = await api(`/api/snapshots/${sid}/restore`, { method: "POST" });
    alert(`Restored: ${j.results.posts_restored} posts, ${j.results.channels_restored} channels.`);
  } catch (e) {
    alert("Restore failed: " + e.message);
  } finally { setLoading(false); }
}

function resetApp() {
  S.scanResult = S.plan = S.config = S.applyResult = null;
  show("apply-confirm", true);
  show("apply-results", false);
  show("plan-preview", false);
  goToStep(1);
}

// ── Settings panel ────────────────────────────────────────────────────────
function openSettings()  { $("settings-overlay").classList.add("open"); $("settings-panel").classList.add("open"); }
function closeSettings() { $("settings-overlay").classList.remove("open"); $("settings-panel").classList.remove("open"); }
async function testSettings() {
  const base  = $("sp-base").value.trim();
  const token = $("sp-token").value.trim();
  if (!base || !token) return setResult("sp-conn-result", "Need both base URL and token", false);
  setLoading(true, "Testing…");
  try {
    await fetch("/api/connect", {
      method: "POST",
      headers: { "Content-Type":"application/json", "X-SB-Base": base, "X-SB-Token": token },
    }).then(r => r.json()).then(j => { if (!j.ok) throw new Error(j.error); });
    setResult("sp-conn-result", "✓ Connected", true);
  } catch (e) {
    setResult("sp-conn-result", "✗ " + e.message, false);
  } finally { setLoading(false); }
}
function saveSettings() {
  const base  = $("sp-base").value.trim();
  const token = $("sp-token").value.trim();
  creds.base  = base;
  creds.token = token;
  localStorage.setItem("sb_news_base",  base);
  localStorage.setItem("sb_news_token", token);
  $("connect-base").value  = base;
  $("connect-token").value = token;
  refreshTopbar();
  closeSettings();
}

// ── Snapshots panel ───────────────────────────────────────────────────────
async function openSnapshots() {
  $("snapshots-overlay").classList.add("open");
  $("snapshots-panel").classList.add("open");
  $("snapshots-list").innerHTML = `<div class="empty-state">Loading…</div>`;
  try {
    const j = await api("/api/snapshots");
    $("snapshots-list").innerHTML = j.snapshots.length
      ? j.snapshots.map(s => `
          <div class="snapshot-row">
            <div class="snapshot-meta">
              <strong>${s.id}</strong>
              <small>${new Date(s.created).toLocaleString()} · ${s.post_count} posts · ${s.channel_count} channels</small>
            </div>
            <button class="btn btn-outline" onclick="restoreSnapshot('${s.id}')">Restore</button>
          </div>`).join("")
      : `<div class="empty-state">No snapshots yet.</div>`;
  } catch (e) {
    $("snapshots-list").innerHTML = `<div class="empty-state">Error: ${escape(e.message)}</div>`;
  }
}
function closeSnapshots() { $("snapshots-overlay").classList.remove("open"); $("snapshots-panel").classList.remove("open"); }
async function restoreSnapshot(sid) {
  if (!confirm(`Restore snapshot ${sid}?`)) return;
  setLoading(true, "Restoring…");
  try {
    const j = await api(`/api/snapshots/${sid}/restore`, { method: "POST" });
    alert(`Restored: ${j.results.posts_restored} posts, ${j.results.channels_restored} channels.`);
  } catch (e) {
    alert("Restore failed: " + e.message);
  } finally { setLoading(false); }
}

// ── Misc ──────────────────────────────────────────────────────────────────
function escape(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function fmt(iso) {
  if (!iso) return "(none)";
  try {
    const d = new Date(iso);
    return d.toISOString().slice(0,10) + " " + d.toISOString().slice(11,16);
  } catch { return iso; }
}
