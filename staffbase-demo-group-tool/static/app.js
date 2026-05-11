/* ── Defaults ─────────────────────────────────────────────────────────────── */
const DEFAULTS = {
  base:  "https://faraz-test.staffbase.com/api",
  token: "NjlmZDYzOTIzZjdiODkxNmFlMjUxMDM1OnNFO0hLe1lofmF3VFFuJDdvN30xV2ZDRkR+Jk42Z3RrU11RW291JmlGKSllSEpydDkuTk1DOSFjeTJtQzFDN1U=",
};

/* ── State ────────────────────────────────────────────────────────────────── */
// Single source of truth for the whole app.  Updated as the user progresses
// through the 4-step flow; resetApp() clears all keys except creds.
const S = {
  step:         1,            // current step (1–4)
  brief:        null,         // result from POST /api/analyze (company, industry, template…)
  research:     null,         // result from POST /api/research (spread, tailored_groups, org_type…)
  profiles:     null,         // result from POST /api/search  {comms:[], corporate:[], frontline:[]}
  cloneUsers:   [],           // unused directly — fetched inside buildPlanGrid for display
  groups:       [],           // all groups from GET /api/groups, used in plan grid
  deployResult: null,         // result from POST /api/deploy, rendered in Step 4
  groupOverrides: null,       // user-edited group names: {newGroups:{comms,corporate,frontline}, tailored:[[name,desc],...]}
  creds:        loadCreds(),  // {base, token} loaded from localStorage on boot
};

/* ── Credentials helpers ─────────────────────────────────────────────────── */
function loadCreds() {
  try {
    const saved = JSON.parse(localStorage.getItem("sb_creds") || "{}");
    return {
      base:  saved.base  || DEFAULTS.base,
      token: saved.token || DEFAULTS.token,
    };
  } catch { return { ...DEFAULTS }; }
}

function saveCreds(base, token) {
  S.creds = { base, token };
  localStorage.setItem("sb_creds", JSON.stringify({ base, token }));

  // Save to named instances list
  const instances = JSON.parse(localStorage.getItem("sb_instances") || "[]");
  const hostname  = base.replace(/^https?:\/\//, "").split("/")[0];
  if (!instances.find(i => i.base === base)) {
    instances.unshift({ base, hostname, savedAt: new Date().toISOString() });
    localStorage.setItem("sb_instances", JSON.stringify(instances.slice(0, 10)));
  }
}

// Wrapper around fetch() that injects Staffbase credentials into every request.
// The Flask backend reads X-SB-Base / X-SB-Token headers via get_creds() so
// the same server can route to different demo instances without a session.
function apiFetch(path, opts = {}) {
  const headers = {
    ...(opts.headers || {}),
    "X-SB-Base":  S.creds.base,
    "X-SB-Token": S.creds.token,
  };
  return fetch(path, { ...opts, headers });
}

/* ── Settings Panel ──────────────────────────────────────────────────────── */
// The settings panel stores up to 10 past instances in localStorage ("sb_instances")
// so the user can switch between demo environments without re-entering tokens.
function openSettings() {
  document.getElementById("sp-base").value  = S.creds.base;
  document.getElementById("sp-token").value = S.creds.token;
  document.getElementById("settings-overlay").classList.add("show");
  document.getElementById("settings-panel").classList.add("open");
  renderSavedInstances();
  document.getElementById("conn-result").classList.remove("show");
}

function closeSettings() {
  document.getElementById("settings-overlay").classList.remove("show");
  document.getElementById("settings-panel").classList.remove("open");
}

function toggleTokenVis() {
  const inp = document.getElementById("sp-token");
  const btn = document.getElementById("token-vis-btn");
  if (inp.type === "password") { inp.type = "text";     btn.textContent = "🙈"; }
  else                         { inp.type = "password"; btn.textContent = "👁";  }
}

async function testConnection() {
  const base  = document.getElementById("sp-base").value.trim().replace(/\/$/, "");
  const token = document.getElementById("sp-token").value.trim();
  if (!base || !token) { showConnResult(false, "Fill in both fields first."); return; }

  const el = document.getElementById("conn-result");
  el.className = "conn-result show"; el.textContent = "Testing…";

  try {
    const res  = await fetch("/api/ping", {
      method: "GET",
      headers: { "X-SB-Base": base, "X-SB-Token": token },
    });
    const data = await res.json();
    if (data.ok) {
      showConnResult(true, `✅ Connected — ${data.msg}`);
    } else {
      showConnResult(false, `❌ Failed — ${data.msg}`);
    }
  } catch (e) {
    showConnResult(false, `❌ ${e.message}`);
  }
}

function showConnResult(ok, msg) {
  const el = document.getElementById("conn-result");
  el.className = `conn-result show ${ok ? "ok" : "error"}`;
  el.textContent = msg;
}

function saveSettings() {
  const base  = document.getElementById("sp-base").value.trim().replace(/\/$/, "");
  const token = document.getElementById("sp-token").value.trim();
  if (!base || !token) { alert("Both fields are required."); return; }

  saveCreds(base, token);

  const hostname = base.replace(/^https?:\/\//, "").split("/")[0];
  document.getElementById("topbar-instance").textContent = hostname;

  closeSettings();
  checkConnection(true); // re-check dot
}

function applyPreset(name) {
  if (name === "faraz-test") {
    document.getElementById("sp-base").value  = DEFAULTS.base;
    document.getElementById("sp-token").value = DEFAULTS.token;
  }
}

function renderSavedInstances() {
  const instances = JSON.parse(localStorage.getItem("sb_instances") || "[]");
  const container = document.getElementById("sp-saved-instances");
  if (!instances.length) { container.innerHTML = ""; return; }
  container.innerHTML = `<h4>Saved Instances</h4>` + instances.map(inst => `
    <div class="preset-item" onclick='loadInstance(${JSON.stringify(inst)})'>
      <span class="preset-name">${inst.hostname}</span>
      <span class="preset-sub">${inst.savedAt ? inst.savedAt.split("T")[0] : ""}</span>
    </div>`).join("");
}

function loadInstance(inst) {
  document.getElementById("sp-base").value  = inst.base;
  document.getElementById("sp-token").value = S.creds.token; // keep current token unless they change it
}

/* ── Connection dot ──────────────────────────────────────────────────────── */
// Calls GET /api/ping (which hits Staffbase GET /users) and colours the dot:
// green = connected, red = failed/unauthorized, pulsing = checking.
async function checkConnection(updateTopbar = false) {
  const dot = document.getElementById("conn-dot");
  dot.className = "conn-dot checking";
  try {
    const res  = await apiFetch("/api/ping");
    const data = await res.json();
    dot.className = data.ok ? "conn-dot connected" : "conn-dot disconnected";
    dot.title     = data.ok ? `Connected: ${data.msg}` : `Disconnected: ${data.msg}`;
    if (updateTopbar && data.instance) {
      document.getElementById("topbar-instance").textContent = data.instance;
    }
  } catch {
    dot.className = "conn-dot disconnected";
    dot.title     = "Connection failed";
  }
}

/* ── Step navigation ─────────────────────────────────────────────────────── */
function canGoTo(n) { return n <= S.step; }

function goToStep(n) {
  document.querySelectorAll(".step-panel").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".step-item").forEach((el, i) => {
    el.classList.toggle("active", i + 1 === n);
    el.classList.toggle("done",   i + 1 < n);
  });
  document.getElementById(`panel-${n}`).classList.add("active");
  S.step = n;
  window.scrollTo(0, 0);
}

/* ── Loading helpers ─────────────────────────────────────────────────────── */
function showLoading(msg) {
  document.getElementById("loading-text").textContent = msg || "Working…";
  document.getElementById("loading-overlay").classList.add("show");
}
function hideLoading() {
  document.getElementById("loading-overlay").classList.remove("show");
}

/* ── File upload ─────────────────────────────────────────────────────────── */
function handleFileUpload(input) {
  const file = input.files[0];
  if (file) document.getElementById("upload-filename").textContent = file.name;
}

/* ── Step 1: Analyze brief ───────────────────────────────────────────────── */
// Three-phase flow on submit:
//   Phase 1 — POST /api/analyze: parse brief, detect company/industry/personas → S.brief
//   Phase 2 — If personas found in brief, pre-populate People columns immediately
//              so the user can skip straight to Configure without searching.
//   Phase 3 — kickoffResearch() fires POST /api/research in the background
//              to populate the Company Intelligence card (non-blocking).
async function analyzeBrief() {
  const fileInput = document.getElementById("file-input");
  const text      = document.getElementById("brief-text").value.trim();
  if (!text && !fileInput.files.length) { alert("Please paste a brief or upload a file."); return; }

  showLoading("Analyzing brief…");
  try {
    let res;
    // Send as multipart if a file was uploaded, otherwise send as JSON
    if (fileInput.files.length) {
      const fd = new FormData();
      fd.append("file", fileInput.files[0]);
      res = await apiFetch("/api/analyze", { method: "POST", body: fd });
    } else {
      res = await apiFetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
    }
    S.brief = await res.json();
    if (S.brief.error) throw new Error(S.brief.error);

    // No confident company match — ask the user instead of guessing
    if (S.brief.needs_company) {
      hideLoading();
      const entered = await promptForCompany(S.brief.industry_label);
      if (!entered) return;       // user cancelled — abort the flow
      // Re-call /api/analyze with the user-supplied name
      showLoading("Analyzing brief…");
      const retry = await apiFetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, manual_company: entered }),
      });
      S.brief = await retry.json();
      if (S.brief.error) throw new Error(S.brief.error);
    }

    document.getElementById("topbar-meta").textContent = `${S.brief.company}  ·  ${S.brief.industry_label}`;
    document.getElementById("sidebar-info").innerHTML  = `<strong>${S.brief.company}</strong><br>${S.brief.industry_label}`;

    const t = S.brief.template;
    document.getElementById("comms-title").textContent     = t.comms_title;
    document.getElementById("corporate-title").textContent = t.corporate_title;
    document.getElementById("frontline-title").textContent = t.frontline_title;

    goToStep(2);
    renderAnalysisCard();

    // Helper: tag every persona with selected=true by default so the checkbox UI works
    const _markSelectable = (arr) => (arr || []).map(p => ({ ...p, selected: p.selected !== false }));

    // If the brief explicitly names personas, pre-populate the columns immediately
    // so the user can skip straight to Configure without searching.
    if (S.brief.detected_personas && S.brief.detected_personas.length > 0) {
      S.profiles = { comms: [], corporate: [], frontline: [] };
      for (const p of S.brief.detected_personas) {
        const rt = p.role_type || "corporate";
        if (S.profiles[rt]) S.profiles[rt].push({ ...p, selected: true });
      }
      renderProfileColumns();
      document.getElementById("to-configure-btn").style.display = "";
      buildPlanGrid();
      // Update search button to reflect personas already loaded
      const btn = document.getElementById("search-btn");
      btn.textContent = "🔄 Re-Search LinkedIn";
    }

    kickoffResearch(); // non-blocking background research
  } catch (e) {
    alert("Analysis failed: " + e.message);
  } finally {
    hideLoading();
  }
}

function renderAnalysisCard() {
  const b = S.brief;
  // Prefer the researched overview once /api/research has populated S.research.description.
  // Falls back to the brief-extracted sentence (or a researching… placeholder) before then.
  const researched = S.research && S.research.description;
  let descHtml;
  if (researched) {
    descHtml = `<div class="ac-desc"><span class="ac-desc-badge">Researched</span> ${researched}</div>`;
  } else if (S.research) {
    descHtml = `<div class="ac-desc">${b.description || ""}</div>`;
  } else {
    descHtml = `<div class="ac-desc ac-desc-loading">Researching ${b.company}…</div>`;
  }
  document.getElementById("analysis-card").innerHTML = `
    <div class="ac-row">
      <div class="ac-item">
        <label>Company</label>
        <span class="ac-company-edit" id="ac-company" contenteditable="true"
              spellcheck="false" onblur="onCompanyEdited(this)"
              onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">${b.company}</span>
      </div>
      <div class="ac-item"><label>Industry</label><span>${b.industry_label}</span></div>
    </div>
    ${descHtml}`;
  document.getElementById("analysis-card").classList.add("show");
  document.getElementById("analysis-pill").innerHTML = `<span>📋</span> ${b.company} · ${b.industry_label}`;
}

// Lightweight modal — built dynamically so we don't need to touch index.html.
// Resolves to the trimmed value the user entered, or null if they cancelled.
function promptForCompany(industryLabel) {
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "settings-overlay show";
    overlay.style.zIndex = "300";
    const panel = document.createElement("div");
    panel.className = "company-prompt";
    panel.innerHTML = `
      <h3>Which company is this brief for?</h3>
      <p>The brief didn't include a clear company name. Industry detected: <strong>${industryLabel || "Unknown"}</strong>.</p>
      <input type="text" id="cp-input" placeholder="e.g. Stryker" autocomplete="off">
      <div class="cp-actions">
        <button class="btn btn-outline" id="cp-cancel">Cancel</button>
        <button class="btn btn-primary" id="cp-ok">Use this name</button>
      </div>`;
    document.body.appendChild(overlay);
    document.body.appendChild(panel);
    const input = panel.querySelector("#cp-input");
    input.focus();
    const cleanup = (val) => {
      overlay.remove(); panel.remove();
      resolve(val);
    };
    panel.querySelector("#cp-ok").onclick     = () => cleanup(input.value.trim() || null);
    panel.querySelector("#cp-cancel").onclick = () => cleanup(null);
    overlay.onclick                           = () => cleanup(null);
    input.onkeydown = (e) => {
      if (e.key === "Enter") cleanup(input.value.trim() || null);
      if (e.key === "Escape") cleanup(null);
    };
  });
}

// Inline edit on the company name in the analysis card. Re-runs research
// against the new name so the description, lexicon, and group plan all update.
function onCompanyEdited(el) {
  const newName = (el.textContent || "").trim();
  if (!newName || !S.brief || newName === S.brief.company) {
    el.textContent = S.brief?.company || "";
    return;
  }
  S.brief.company = newName;
  document.getElementById("topbar-meta").textContent = `${newName}  ·  ${S.brief.industry_label}`;
  document.getElementById("sidebar-info").innerHTML  = `<strong>${newName}</strong><br>${S.brief.industry_label}`;
  S.research = null;          // invalidate stale research
  S.groupOverrides = null;    // and any group-name overrides keyed off old company
  renderAnalysisCard();
  kickoffResearch();          // re-runs /api/research with the new name
}

/* ── Company Research ────────────────────────────────────────────────────── */
// Fires POST /api/research in the background immediately after analyze completes.
// Shows a skeleton loader in the intel card while waiting; updates it on response.
// S.research is also read by searchLinkedIn() (for spread) and deploy() (for tailored_groups).
async function kickoffResearch() {
  const intel = document.getElementById("intel-card");
  if (intel) { intel.style.display = ""; intel.innerHTML = intelSkeleton(); }
  try {
    const text = document.getElementById("brief-text").value.trim();
    const res  = await apiFetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company: S.brief.company, industry: S.brief.industry, brief: text }),
    });
    S.research = await res.json();
    renderAnalysisCard();   // refresh the description with researched overview
    renderIntelligenceCard();
    updateColumnCounts();   // update "N people" labels in the three column headers
    // Plan grid may have been built earlier (when brief personas pre-populated)
    // with the IND_GROUP_NAMES fallback. Re-render now that real tailored_groups
    // are available — buildPlanGrid skips the refresh if user has edited names.
    if (document.getElementById("plan-grid")?.innerHTML?.trim()) buildPlanGrid();
  } catch (e) {
    if (intel) intel.style.display = "none";
  }
}

function intelSkeleton() {
  return `<div class="intel-loading">Researching ${S.brief.company} workforce…</div>`;
}

function renderIntelligenceCard() {
  const card = document.getElementById("intel-card");
  if (!card || !S.research) return;

  const r      = S.research;
  const spread = r.spread || { comms: 3, corporate: 6, frontline: 6 };
  const total  = spread.comms + spread.corporate + spread.frontline;
  // Convert absolute counts to percentages for the colour-coded spread bar.
  // pFront gets the remainder to avoid off-by-one from rounding.
  const pComms = Math.round((spread.comms / total) * 100);
  const pCorp  = Math.round((spread.corporate / total) * 100);
  const pFront = 100 - pComms - pCorp;

  const orgType = r.org_type || {};
  const badge   = orgType.badge || "mixed";
  const wfLabel = orgType.workforce_type || "Mixed Workforce";
  const orgLabel= orgType.label || "";
  const empText = r.total_employees
    ? `${Number(r.total_employees).toLocaleString()} employees`
    : "Employee count estimated";

  const locHtml  = (r.locations || []).map(l => `<span class="intel-fact">📍 ${l}</span>`).join("");
  const deptHtml = (r.departments || []).slice(0, 3).map(d => `<span class="intel-fact">${d}</span>`).join("");

  card.innerHTML = `
    <div class="intel-header">
      <span class="org-badge ${badge}">${wfLabel}</span>
      <span class="intel-org-label">${orgLabel}</span>
      <span class="intel-emp">${empText}</span>
    </div>
    <div class="spread-bar">
      <div class="spread-seg comms"     style="width:${pComms}%" title="Comms: ${spread.comms}"></div>
      <div class="spread-seg corporate" style="width:${pCorp}%"  title="Corporate: ${spread.corporate}"></div>
      <div class="spread-seg frontline" style="width:${pFront}%" title="Frontline: ${spread.frontline}"></div>
    </div>
    <div class="spread-labels">
      <span><span class="spread-dot" style="background:#0891b2"></span>Comms <strong>${spread.comms}</strong></span>
      <span><span class="spread-dot" style="background:#7c3aed"></span>Corporate <strong>${spread.corporate}</strong></span>
      <span><span class="spread-dot" style="background:#059669"></span>Frontline <strong>${spread.frontline}</strong></span>
      <span class="spread-ratio">${Math.round(r.frontline_ratio * 100)}% deskless</span>
    </div>
    ${locHtml || deptHtml ? `<div class="intel-facts">${locHtml}${deptHtml}</div>` : ""}`;
  card.style.display = "";
}

function updateColumnCounts() {
  const spread = S.research && S.research.spread;
  if (!spread) return;
  const small = {
    comms:     document.querySelector("#col-comms .category-header small"),
    corporate: document.querySelector("#col-corporate .category-header small"),
    frontline: document.querySelector("#col-frontline .category-header small"),
  };
  if (small.comms)     small.comms.textContent     = `${spread.comms} people`;
  if (small.corporate) small.corporate.textContent = `${spread.corporate} people`;
  if (small.frontline) small.frontline.textContent = `${spread.frontline} people`;
}

/* ── Step 2: People search ───────────────────────────────────────────────── */
// Calls POST /api/search on the Flask backend, which in turn runs 4-tier DuckDuckGo
// searches (LinkedIn → news → web → careers) for each role column.
// Passes S.research.spread so each column gets the right profile count.
async function searchLinkedIn() {
  if (!S.brief) return;
  const btn = document.getElementById("search-btn");
  btn.disabled = true;
  btn.textContent = "⏳ Searching…";

  ["comms","corporate","frontline"].forEach(rt => {
    document.getElementById(`list-${rt}`).innerHTML =
      "<div class='searching-state'>🔍 Searching across LinkedIn, news & web…</div>";
  });

  try {
    const res = await apiFetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company:  S.brief.company,
        industry: S.brief.industry,
        spread:   S.research && S.research.spread,
      }),
    });
    const fresh = await res.json();
    if (fresh.error) throw new Error(fresh.error);

    // Merge: brief-extracted personas (source === "brief") take priority.
    // Search results are appended only if they don't duplicate by full name.
    const briefBefore = S.profiles || { comms: [], corporate: [], frontline: [] };
    const merged = { comms: [], corporate: [], frontline: [] };
    for (const rt of ["comms", "corporate", "frontline"]) {
      const briefOnes = (briefBefore[rt] || []).filter(p => p.source === "brief");
      const seen = new Set(briefOnes.map(p => `${p.firstName}|${p.lastName}`.toLowerCase()));
      const newOnes = (fresh[rt] || []).filter(p => {
        const k = `${p.firstName}|${p.lastName}`.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      merged[rt] = [...briefOnes, ...newOnes].map(p => ({ ...p, selected: p.selected !== false }));
    }
    S.profiles = merged;
    renderProfileColumns();
    document.getElementById("to-configure-btn").style.display = "";
    buildPlanGrid();
  } catch (e) {
    ["comms","corporate","frontline"].forEach(rt => {
      document.getElementById(`list-${rt}`).innerHTML =
        `<div class='empty-state'>Search failed: ${e.message}</div>`;
    });
  } finally {
    btn.disabled = false;
    btn.textContent = "🔄 Re-Search";
  }
}

// Source badge config — "brief" = persona pulled directly from the brief text
const SOURCE_LABELS = {
  linkedin:  { cls: "src-linkedin",  txt: "LI"    },
  web:       { cls: "src-web",       txt: "Web"   },
  generated: { cls: "src-generated", txt: "Gen"   },
  brief:     { cls: "src-brief",     txt: "Brief" },
};

function renderProfileColumns() {
  ["comms","corporate","frontline"].forEach(rt => {
    const list     = document.getElementById(`list-${rt}`);
    const profiles = S.profiles[rt] || [];
    if (!profiles.length) {
      list.innerHTML = "<div class='empty-state'>No results — try re-searching</div>";
      return;
    }
    list.innerHTML = profiles.map((p, i) => {
      const initials = (p.firstName[0] || "") + (p.lastName[0] || "");
      const src      = SOURCE_LABELS[p.source] || SOURCE_LABELS.generated;
      const linkHtml = p.url ? `<a class="profile-link" href="${p.url}" target="_blank">View ↗</a>` : "";
      const sel      = p.selected !== false;
      return `<div class="profile-card ${sel ? "" : "deselected"}" onclick="togglePersona('${rt}', ${i})">
        <input type="checkbox" class="persona-check" ${sel ? "checked" : ""} onclick="event.stopPropagation(); togglePersona('${rt}', ${i})">
        <div class="profile-avatar ${rt}">${initials}</div>
        <div style="flex:1;min-width:0">
          <div class="profile-name">${p.firstName} ${p.lastName}</div>
          <div class="profile-position">${p.position || ""}</div>
          ${linkHtml}
        </div>
        <span class="source-badge ${src.cls}" title="Source: ${p.source || 'unknown'}">${src.txt}</span>
      </div>`;
    }).join("");
  });
}

function togglePersona(rt, idx) {
  if (!S.profiles?.[rt]?.[idx]) return;
  S.profiles[rt][idx].selected = S.profiles[rt][idx].selected === false;
  renderProfileColumns();
  buildPlanGrid();
}

function updateNewGroupName(key, value) {
  if (!S.groupOverrides) S.groupOverrides = { newGroups: {}, tailored: null, newGroupsEdited: true, tailoredEdited: false };
  if (!S.groupOverrides.newGroups) S.groupOverrides.newGroups = {};
  S.groupOverrides.newGroups[key] = (value || "").trim();
  S.groupOverrides.newGroupsEdited = true;
}

function updateTailoredName(idx, value) {
  if (!S.groupOverrides?.tailored) return;
  const desc = S.groupOverrides.tailored[idx]?.[1] || "";
  S.groupOverrides.tailored[idx] = [(value || "").trim(), desc];
  S.groupOverrides.tailoredEdited = true;
}

// User-edited rename target (server-computed pairs path). Keyed by existing
// group id so the deploy can apply edits to the right Staffbase group.
function updateRenameOverride(existingId, value) {
  if (!S.renameOverrides) S.renameOverrides = {};
  S.renameOverrides[existingId] = (value || "").trim();
  S.renameOverridesEdited = true;
}

/* ── Step 3: Plan grid ───────────────────────────────────────────────────── */
// IND_GROUP_NAMES mirrors the "groups" arrays in app.py INDUSTRIES dict.
// Used as a client-side fallback when S.research.tailored_groups is not yet available
// (e.g. if research completed before the plan grid rendered).
const IND_GROUP_NAMES = {
  healthcare:    ["Patient Safety & Quality","Clinical Updates","HR & Employee Wellbeing","Shift Notifications","Employee Recognition","Leadership Forum","Community & Volunteering","Training & Development"],
  manufacturing: ["Safety First","Production Updates","Quality & Compliance","Shift Bulletin","Employee Recognition","Training & Compliance","Environment & Sustainability","HR & Benefits"],
  retail:        ["Store Operations","Customer Experience","Sales & Promotions","Schedule & Shift","Employee Recognition","Product & Training","Community & Social","HR & Benefits"],
  finance:       ["Compliance & Regulatory","Client Services","Operations Bulletin","Team Recognition","Training & Certification","HR & Wellbeing","Leadership Forum","Innovation & Technology"],
  technology:    ["Engineering Updates","Product & Roadmap","Customer & GTM","Innovation Hub","Team Recognition","Learning & Development","All-Hands Community","HR & Benefits"],
  logistics:     ["Route & Schedule Updates","Safety & Compliance","Fleet & Operations","Driver & Field Recognition","HR & Benefits","Training Hub","Community Board","Leadership Updates"],
  energy:        ["Safety First","Operations Updates","Regulatory & Compliance","Shift Bulletin","Employee Recognition","Training & Certification","Sustainability Initiative","HR & Benefits"],
  hospitality:   ["Service Excellence","F&B Updates","Guest Experience","Shift & Scheduling","Staff Recognition","Training Hub","Events & Activities","HR & Benefits"],
  other:         ["Company Updates","Operations Bulletin","HR & Wellbeing","Team Recognition","Training & Development","Leadership Forum","Community & Culture","Innovation & Ideas"],
};

const GROUP_SCORE = {
  "fantasy football":4,"travelbase":4,"feature:":4,"industry:":4,
  "marketplace":3,"thank you":3,"store employees":3,"office /hq":3,
  "town hall attendee":2,"company values":2
};

// ── Theme classification (mirrors _GROUP_THEME_RULES in app.py) ────────────
// Used to match tailored group names to existing groups in the plan-grid
// preview by what each group is actually about, not by index position.
const GROUP_THEME_RULES = [
  ["training",     ["training","learning","development","certification","education","onboarding"]],
  ["quality",      ["quality","audit","compliance","regulatory"]],
  ["innovation",   ["innovation","engineering","r&d","product","roadmap","tech","innovation hub","engineering updates","ideas"]],
  ["clinical",     ["clinical","patient","nursing","bedside"]],
  ["customer",     ["customer","client","guest","service excellence","f&b","marketplace"]],
  ["recognition",  ["recognition","award","kudos","thank you","thanks","shout"]],
  ["leadership",   ["leadership","forum","town hall","all-hands","executive","all hands","town hall attendee","company values"]],
  ["community",    ["community","volunteer","sustainability","social","culture","values","events","diversity","equity","inclusion","dei","fantasy football","travelbase","company news"]],
  ["hr",           [" hr ","hr &","benefits","wellbeing","wellness","people ops"]],
  ["safety",       ["safety","ehs"]],
  ["frontline",    ["blue-collar","non-desk","deskless","non desk","store employees"]],
  ["production",   ["production","operations bulletin","manufacturing","fleet & operations"]],
  ["operations",   ["shift","bulletin","schedule","route","operations","office /hq","office/hq"]],
  ["driver",       ["driver","field"]],
];
const RELATED_THEMES = {
  production:["frontline","operations","safety"], frontline:["production","operations"],
  operations:["production","frontline","driver"], safety:["quality","production"],
  quality:["safety","operations"], innovation:["customer","operations"],
  customer:["innovation","community"], training:["hr","leadership"],
  recognition:["community","hr","leadership"], leadership:["recognition","community"],
  community:["recognition","leadership","hr"], hr:["community","training"],
  clinical:["quality","operations"], driver:["frontline","operations"],
};

function themeOf(name) {
  const n = " " + (name || "").toLowerCase() + " ";
  for (const [theme, kws] of GROUP_THEME_RULES) {
    for (const kw of kws) {
      if (kw.includes(" ") || kw.includes("&")) {
        if (n.includes(kw)) return theme;
      } else {
        const re = new RegExp("\\b" + kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b");
        if (re.test(n)) return theme;
      }
    }
  }
  return "general";
}

function themeScore(t1, t2) {
  if (t1 === t2 && t1 !== "general") return 3;
  if ((RELATED_THEMES[t1] || []).includes(t2)) return 1;
  return 0;
}

// Pair tailored names to existing groups by theme. Returns parallel array of
// {existing, name, desc, t_idx} in plan-grid order. Mirrors match_tailored_to_existing
// in app.py so preview reflects the actual deploy outcome.
function matchTailoredToExisting(tailored, existing) {
  const tThemes = tailored.map((t, i) => ({ theme: themeOf(t[0]), i, name: t[0], desc: t[1] || "" }));
  const eThemes = existing.map((g, j) => ({ theme: themeOf(g.name), j, g }));
  const scored = [];
  for (const t of tThemes) for (const e of eThemes) {
    const s = themeScore(t.theme, e.theme);
    if (s > 0) scored.push({ s, t, e });
  }
  scored.sort((a, b) => (b.s - a.s) || (a.e.j - b.e.j));
  const usedT = new Set(), usedE = new Set();
  const pairs = [];
  for (const { t, e } of scored) {
    if (usedT.has(t.i) || usedE.has(e.j)) continue;
    usedT.add(t.i); usedE.add(e.j);
    pairs.push({ existing: e.g, name: t.name, desc: t.desc, t_idx: t.i });
  }
  // Fallback: positional pairing for anything still unmatched
  const leftoverT = tThemes.filter(t => !usedT.has(t.i));
  const leftoverE = eThemes.filter(e => !usedE.has(e.j));
  for (let k = 0; k < Math.min(leftoverT.length, leftoverE.length); k++) {
    pairs.push({ existing: leftoverE[k].g, name: leftoverT[k].name, desc: leftoverT[k].desc, t_idx: leftoverT[k].i });
  }
  pairs.sort((a, b) => existing.indexOf(a.existing) - existing.indexOf(b.existing));
  return pairs;
}

// Builds the 3-section deployment plan card:
//   Section 1 — "Users to Update": profiles from S.profiles mapped to clone users
//   Section 2 — "New Groups (3)": company-branded groups that will be created
//   Section 3 — "Groups to Rename (8)": existing groups paired with tailored
//                 names by theme (matches what /api/deploy will actually do).
// Fetches /api/plan-rename for the authoritative server-computed pairs once
// research is available; falls back to /api/groups + IND_GROUP_NAMES otherwise.
async function buildPlanGrid() {
  try {
    const gr = await apiFetch("/api/groups");
    S.groups = (await gr.json()).groups || [];
  } catch { S.groups = []; }

  // If research has produced lexicon/locations/depts, ask the server for the
  // exact theme-preserving rename pairs the deploy will use.
  S.renamePairs = null;
  if (S.research) {
    try {
      const pr = await apiFetch("/api/plan-rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company:     S.brief.company,
          industry:    S.brief.industry,
          locations:   S.research.locations   || [],
          departments: S.research.departments || [],
          lexicon:     S.research.lexicon     || [],
        }),
      });
      const data = await pr.json();
      if (Array.isArray(data.pairs)) S.renamePairs = data.pairs;
    } catch { /* fall through to client-side preview */ }
  }

  const pfRaw = S.profiles || {};
  // Plan grid (and deploy) only consider personas the user has kept selected
  const pf = {
    comms:     (pfRaw.comms     || []).filter(p => p.selected !== false),
    corporate: (pfRaw.corporate || []).filter(p => p.selected !== false),
    frontline: (pfRaw.frontline || []).filter(p => p.selected !== false),
  };
  const t  = S.brief.template;
  const allP = [...pf.comms, ...pf.corporate, ...pf.frontline];

  const usersHtml = allP.slice(0, 14).map(p => {
    const rt  = (pf.comms||[]).includes(p) ? "comms" : (pf.corporate||[]).includes(p) ? "corporate" : "frontline";
    const lbl = {comms:"Comms",corporate:"Corporate",frontline:"Frontline"}[rt];
    const src = SOURCE_LABELS[p.source] || SOURCE_LABELS.generated;
    return `<div class="plan-row">
      <span>${p.firstName} ${p.lastName}</span>
      <span style="color:var(--gray-400);font-size:.73rem;flex:1;padding:0 .4rem">${p.position||""}</span>
      <span class="badge badge-${rt}">${lbl}</span>
      <span class="source-badge ${src.cls}">${src.txt}</span>
    </div>`;
  }).join("");

  const shortCo = S.brief.company.split(" ").slice(0, 2).join(" ");

  // Initialise/refresh group-name overrides so edits persist across plan re-renders.
  // The `…Edited` flags let us re-pull from server research without clobbering
  // any names the user has manually changed.
  if (!S.groupOverrides) {
    S.groupOverrides = { newGroups: null, tailored: null, newGroupsEdited: false, tailoredEdited: false };
  }
  if (!S.groupOverrides.newGroups || !S.groupOverrides.newGroupsEdited) {
    S.groupOverrides.newGroups = {
      comms:     `${shortCo} — ${t.comms_title}`,
      corporate: `${shortCo} — ${t.corporate_title}`,
      frontline: `${shortCo} — ${t.frontline_title}`,
    };
  }

  const ng = S.groupOverrides.newGroups;
  const newGrpsHtml = [
    {key:"comms",     val:ng.comms,     badge:"comms",     lbl:"Comms"},
    {key:"corporate", val:ng.corporate, badge:"corporate", lbl:"Corporate"},
    {key:"frontline", val:ng.frontline, badge:"frontline", lbl:"Frontline"},
  ].map(g => `<div class="plan-row">
    <input class="group-name-input" type="text" value="${g.val.replace(/"/g, '&quot;')}"
           onchange="updateNewGroupName('${g.key}', this.value)" title="Edit name (will be created)">
    <span class="badge badge-${g.badge}">${g.lbl}</span>
    <span class="badge badge-new">New</span>
  </div>`).join("");

  // Score and sort groups by GROUP_SCORE — highest-scoring groups are the most
  // demo-unfriendly and should be renamed first (mirrors pick_groups_to_refresh in app.py).
  const scored = S.groups.map(g => {
    const n = g.name.toLowerCase();
    const s = Object.entries(GROUP_SCORE).reduce((a,[k,v]) => a + (n.includes(k)?v:0), 0);
    return {...g, _score: s};
  }).sort((a,b) => b._score - a._score).slice(0,8);

  // Initialise (or refresh) the tailored override list. If research has arrived
  // since the last build, prefer its names — unless the user has edited any
  // input, in which case keep their values.
  if (!S.groupOverrides.tailoredEdited) {
    if (S.research && S.research.tailored_groups) {
      S.groupOverrides.tailored = S.research.tailored_groups.map(g => [g[0], g[1] || ""]);
    } else if (!S.groupOverrides.tailored) {
      const fallback = IND_GROUP_NAMES[S.brief.industry] || IND_GROUP_NAMES.other;
      S.groupOverrides.tailored = fallback.map(n => [n, ""]);
    }
  }

  // Prefer the server's authoritative pairs (computed by tailor_existing_groups
  // — same code path as deploy). Falls back to client-side theme matching when
  // research hasn't returned yet.
  let renameHtml;
  if (S.renamePairs && S.renamePairs.length) {
    if (!S.renameOverrides || !S.renameOverridesEdited) S.renameOverrides = {};
    renameHtml = S.renamePairs.map(p => {
      const current = S.renameOverrides[p.id] != null ? S.renameOverrides[p.id] : p.new;
      return `<div class="plan-row">
        <span class="old" title="theme: ${p.old_theme}">${p.old}</span>
        <span class="arrow">→</span>
        <input class="group-name-input new-name" type="text"
               value="${current.replace(/"/g,'&quot;')}"
               onchange="updateRenameOverride('${p.id}', this.value)"
               title="theme: ${p.new_theme} — edit if you want to change">
        <span class="badge badge-rename">Rename</span>
      </div>`;
    }).join("");
  } else {
    // Pre-research preview: fall back to JS-side matching against IND_GROUP_NAMES
    const tailored  = S.groupOverrides.tailored;
    const matches   = matchTailoredToExisting(tailored, scored);
    renameHtml = matches.map(m => `<div class="plan-row">
      <span class="old">${m.existing.name}</span>
      <span class="arrow">→</span>
      <input class="group-name-input new-name" type="text"
             value="${(m.name || m.existing.name).replace(/"/g,'&quot;')}"
             onchange="updateTailoredName(${m.t_idx}, this.value)" title="Edit rename target">
      <span class="badge badge-rename">Rename</span>
    </div>`).join("");
  }

  document.getElementById("plan-grid").innerHTML = `
    <div class="plan-card">
      <h3>👥 Users to Update (${allP.length})</h3>
      <div style="font-size:.71rem;color:var(--gray-400);margin-bottom:.6rem">
        <span class="source-badge src-linkedin">LI</span> Real from LinkedIn &nbsp;
        <span class="source-badge src-web">Web</span> Real from Web &nbsp;
        <span class="source-badge src-generated">Gen</span> Position-accurate generated
      </div>
      ${usersHtml || "<div class='empty-state'>No profiles found</div>"}
    </div>
    <div class="plan-card">
      <h3>✨ New Groups (3)</h3>
      ${newGrpsHtml}
    </div>
    <div class="plan-card full-width">
      <h3>🔄 Groups to Rename (8 of ${S.groups.length} existing)</h3>
      ${renameHtml}
    </div>`;
}

/* ── Step 4: Deploy ──────────────────────────────────────────────────────── */
// Calls POST /api/deploy with the full payload needed for a 6-step Staffbase deploy:
//   company + industry        → used for group naming and template selection
//   profiles {comms/corp/fl}  → mapped to clone users on the backend
//   tailored_groups           → location/brand-prefixed group names from research;
//                               null = backend uses industry template defaults
async function deploy() {
  const btn = document.getElementById("deploy-btn");
  btn.disabled = true;
  showLoading("Deploying to Staffbase…");
  try {
    const assignManagers = !!document.getElementById("assign-managers-toggle")?.checked;
    // Filter out unselected personas before sending
    const pfRaw = S.profiles || {};
    const profilesToDeploy = {
      comms:     (pfRaw.comms     || []).filter(p => p.selected !== false),
      corporate: (pfRaw.corporate || []).filter(p => p.selected !== false),
      frontline: (pfRaw.frontline || []).filter(p => p.selected !== false),
    };
    const res = await apiFetch("/api/deploy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company:          S.brief.company,
        industry:         S.brief.industry,
        profiles:         profilesToDeploy,
        // Send research-derived signals so the deploy can run tailor_existing_groups
        // — the server-side rename engine — instead of the simpler positional path.
        locations:        (S.research && S.research.locations)   || [],
        departments:      (S.research && S.research.departments) || [],
        lexicon:          (S.research && S.research.lexicon)     || [],
        rename_overrides: S.renameOverrides || {},
        // Legacy: still send old-style overrides for the pre-research fallback
        tailored_groups:  S.groupOverrides?.tailored || (S.research && S.research.tailored_groups),
        new_group_names:  S.groupOverrides?.newGroups || null,
        assign_managers:  assignManagers,
      }),
    });
    S.deployResult = await res.json();
    goToStep(4);
    renderResults();
  } catch (e) {
    alert("Deploy failed: " + e.message);
    btn.disabled = false;
  } finally {
    hideLoading();
  }
}

// Renders Step 4 results from S.deployResult (returned by POST /api/deploy).
// Shows: summary hero metrics, updated users list (with source badges),
// new + renamed groups, and the raw per-operation deploy log.
function renderResults() {
  const r = S.deployResult;
  if (!r) return;

  // Compute headline metrics for the hero banner
  const usersUpdated  = Object.keys(r.updated_users  || {}).length;
  const groupsCreated = Object.values(r.new_groups    || {}).filter(g => g.status === "created").length;
  const groupsRenamed = (r.refreshed_groups || []).filter(g => g.ok).length;
  const logOk         = (r.log || []).filter(l => l.status === "ok").length;

  const usersHtml = Object.values(r.updated_users || {}).map(u => {
    const lbl = {comms:"Comms",corporate:"Corporate",frontline:"Frontline"}[u.role_type] || u.role_type;
    const src  = SOURCE_LABELS[u.source] || SOURCE_LABELS.generated;
    return `<div class="log-entry">
      <div class="log-dot ok"></div>
      <span class="log-msg"><strong>${u.name}</strong> — ${u.position}
        <span class="badge badge-${u.role_type}" style="margin-left:.35rem">${lbl}</span>
        <span class="source-badge ${src.cls}" style="margin-left:.2rem">${src.txt}</span>
      </span>
    </div>`;
  }).join("");

  const newGrpHtml = Object.entries(r.new_groups || {}).map(([rt, g]) => {
    const lbl = {comms:"Comms",corporate:"Corporate",frontline:"Frontline"}[rt]||rt;
    return `<div class="log-entry">
      <div class="log-dot ok"></div>
      <span class="log-msg"><strong>${g.name}</strong>
        <span class="badge badge-${rt}" style="margin-left:.35rem">${lbl}</span>
        <span class="badge badge-new" style="margin-left:.2rem">${g.status==="created"?"Created":"Exists"}</span>
      </span>
    </div>`;
  }).join("");

  const renHtml = (r.refreshed_groups || []).map(g => `
    <div class="log-entry">
      <div class="log-dot ${g.ok?"ok":"error"}"></div>
      <span class="log-msg"><span style="color:var(--gray-400);text-decoration:line-through">${g.old}</span> → <strong>${g.new}</strong></span>
    </div>`).join("");

  const logHtml = (r.log || []).map(l => `
    <div class="log-entry">
      <div class="log-dot ${l.status}"></div>
      <span class="log-msg">${l.msg}</span>
    </div>`).join("");

  // Manager hierarchy card (only shown if assignments were made)
  const mgrEntries = Object.entries(r.manager_assignments || {});
  const mgrHtml = mgrEntries.map(([uid, m]) => {
    const userName = (r.updated_users[uid] || {}).name || uid;
    return `<div class="log-entry">
      <div class="log-dot ok"></div>
      <span class="log-msg"><strong>${userName}</strong> → reports to <em>${m.manager_name || m.manager_id}</em></span>
    </div>`;
  }).join("");
  const mgrCard = mgrEntries.length ? `
    <div class="results-card">
      <h3>🏢 Manager Hierarchy</h3>${mgrHtml}
    </div>` : "";

  document.getElementById("results-container").innerHTML = `
    <div class="results-hero">
      <h2>✅ ${r.company} — Demo Configured</h2>
      <p>${r.industry_label} · ${S.creds.base.replace(/^https?:\/\//,"").split("/")[0]}</p>
      <div class="results-metrics">
        <div><span class="metric-val">${usersUpdated}</span><span class="metric-lbl">Users Updated</span></div>
        <div><span class="metric-val">${groupsCreated}</span><span class="metric-lbl">Groups Created</span></div>
        <div><span class="metric-val">${groupsRenamed}</span><span class="metric-lbl">Groups Renamed</span></div>
        <div><span class="metric-val">${logOk}/${(r.log||[]).length}</span><span class="metric-lbl">Steps OK</span></div>
      </div>
    </div>
    <div class="results-grid">
      <div class="results-card">
        <h3>👥 Updated Users</h3>
        ${usersHtml || "<div class='empty-state'>None</div>"}
      </div>
      <div class="results-card">
        <h3>✨ New Groups</h3>${newGrpHtml}
        ${renHtml ? `<h3 style="margin-top:1rem">🔄 Renamed</h3>${renHtml}` : ""}
      </div>
    </div>
    ${mgrCard}
    <div class="results-card" style="background:white;border:1px solid var(--gray-200);border-radius:var(--radius);padding:1rem 1.25rem;margin-top:1rem">
      <h3>📋 Deploy Log</h3>${logHtml}
    </div>`;

  // Show rollback + hierarchy buttons
  const rb = document.getElementById("rollback-btn");
  if (rb) rb.style.display = r.snapshot ? "" : "none";
  const eh = document.getElementById("edit-hierarchy-btn");
  if (eh) eh.style.display = Object.keys(r.updated_users || {}).length ? "" : "none";
}

/* ── Hierarchy editor (Step 4) ───────────────────────────────────────────── */
function openHierarchyEditor() {
  const r = S.deployResult;
  if (!r || !r.updated_users) return;

  const users = Object.entries(r.updated_users); // [[uid, info], ...]
  const current = r.manager_assignments || {};   // {uid: {manager_id, manager_name}}

  // Build dropdown HTML — rows ordered by role_type (corporate first, then comms, frontline)
  const order = { corporate: 0, comms: 1, frontline: 2 };
  users.sort(([,a],[,b]) => (order[a.role_type] ?? 9) - (order[b.role_type] ?? 9));

  const optsFor = (selfUid) => {
    const opts = [`<option value="">— No manager (root) —</option>`];
    for (const [uid, info] of users) {
      if (uid === selfUid) continue;       // can't manage yourself
      const sel = current[selfUid]?.manager_id === uid ? "selected" : "";
      opts.push(`<option value="${uid}" ${sel}>${info.name} — ${info.position || ""}</option>`);
    }
    return opts.join("");
  };

  document.getElementById("hierarchy-list").innerHTML = users.map(([uid, info]) => {
    const lbl = {comms:"Comms",corporate:"Corporate",frontline:"Frontline"}[info.role_type] || info.role_type;
    return `<div class="hierarchy-row">
      <div class="hr-user">
        <strong>${info.name}</strong>
        <small>${info.position || ""}</small>
        <span class="badge badge-${info.role_type}" style="margin-left:.35rem">${lbl}</span>
      </div>
      <span class="hr-arrow">reports to</span>
      <select class="hr-select" data-uid="${uid}">${optsFor(uid)}</select>
    </div>`;
  }).join("");

  document.getElementById("hierarchy-overlay").classList.add("show");
  document.getElementById("hierarchy-panel").classList.add("open");
}

function closeHierarchyEditor() {
  document.getElementById("hierarchy-overlay").classList.remove("show");
  document.getElementById("hierarchy-panel").classList.remove("open");
}

async function applyHierarchyEdits() {
  const selects = document.querySelectorAll("#hierarchy-list .hr-select");
  const assignments = {};
  selects.forEach(s => { assignments[s.dataset.uid] = s.value || null; });

  showLoading("Updating hierarchy…");
  try {
    const res = await apiFetch("/api/update-managers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Update failed");

    // Reflect changes into S.deployResult so the results card stays in sync
    S.deployResult.manager_assignments = {};
    for (const [uid, mgr] of Object.entries(assignments)) {
      if (!mgr) continue;
      const mgrInfo = S.deployResult.updated_users[mgr] || {};
      S.deployResult.manager_assignments[uid] = { manager_id: mgr, manager_name: mgrInfo.name || mgr };
    }
    renderResults();
    closeHierarchyEditor();
    alert(`Updated ${data.ok_count}/${data.total} manager assignments.`);
  } catch (e) {
    alert("Update failed: " + e.message);
  } finally {
    hideLoading();
  }
}

/* ── Rollback / snapshots ────────────────────────────────────────────────── */
async function rollbackDeploy() {
  const snap = S.deployResult && S.deployResult.snapshot;
  if (!snap) return alert("No snapshot available for this deploy.");
  if (!confirm("Roll back this deploy?\n\nThis will restore user fields, rename groups back, and delete the new groups created during this deploy.")) return;
  showLoading("Rolling back…");
  try {
    const res = await apiFetch("/api/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot: snap }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Reset failed");
    alert(`Rolled back: ${(data.log || []).filter(l => l.status === "ok").length} operations OK`);
    document.getElementById("rollback-btn").style.display = "none";
  } catch (e) {
    alert("Rollback failed: " + e.message);
  } finally {
    hideLoading();
  }
}

async function openSnapshots() {
  const overlay = document.getElementById("snapshots-overlay");
  const panel   = document.getElementById("snapshots-panel");
  const list    = document.getElementById("snapshots-list");
  overlay.classList.add("show");
  panel.classList.add("open");
  list.innerHTML = "<div class='empty-state'>Loading…</div>";
  try {
    const res  = await apiFetch("/api/snapshots");
    const data = await res.json();
    const snaps = data.snapshots || [];
    if (!snaps.length) {
      list.innerHTML = "<div class='empty-state'>No snapshots yet for this instance.</div>";
      return;
    }
    list.innerHTML = snaps.map(s => `
      <div class="preset-item" style="display:flex;align-items:center;justify-content:space-between;gap:.75rem">
        <div>
          <div class="preset-name">${s.company || "(unnamed)"} <small style="color:var(--gray-400)">${(s.timestamp || "").slice(0,19).replace("T"," ")}</small></div>
          <div class="preset-sub">${s.user_count} users · ${s.group_count} groups · ${s.new_group_ids.length} new groups to delete</div>
        </div>
        <button class="btn btn-outline" onclick="restoreSnapshot('${s.filename}')">Restore</button>
      </div>`).join("");
  } catch (e) {
    list.innerHTML = `<div class='empty-state'>Error: ${e.message}</div>`;
  }
}

function closeSnapshots() {
  document.getElementById("snapshots-overlay").classList.remove("show");
  document.getElementById("snapshots-panel").classList.remove("open");
}

async function restoreSnapshot(filename) {
  if (!confirm(`Restore from snapshot ${filename}?\n\nThis will overwrite the instance with the snapshotted state.`)) return;
  showLoading("Restoring snapshot…");
  try {
    const res = await apiFetch("/api/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot: filename }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Restore failed");
    alert(`Restored from ${filename}: ${(data.log || []).filter(l => l.status === "ok").length} operations OK`);
    closeSnapshots();
  } catch (e) {
    alert("Restore failed: " + e.message);
  } finally {
    hideLoading();
  }
}

/* ── Reset ───────────────────────────────────────────────────────────────── */
function resetApp() {
  S.step = 1; S.brief = null; S.research = null; S.profiles = null; S.deployResult = null;
  S.groupOverrides = null;
  S.renamePairs = null;
  S.renameOverrides = null;
  S.renameOverridesEdited = false;
  const intel = document.getElementById("intel-card");
  if (intel) { intel.style.display = "none"; intel.innerHTML = ""; }
  document.getElementById("brief-text").value    = "";
  document.getElementById("upload-filename").textContent = "";
  document.getElementById("file-input").value    = "";
  document.getElementById("topbar-meta").textContent = "";
  document.getElementById("sidebar-info").textContent = "";
  document.getElementById("analysis-card").classList.remove("show");
  document.getElementById("analysis-pill").innerHTML = "";
  document.getElementById("to-configure-btn").style.display = "none";
  document.getElementById("deploy-btn").disabled = false;
  const mgrToggle = document.getElementById("assign-managers-toggle");
  if (mgrToggle) mgrToggle.checked = false;
  const rb = document.getElementById("rollback-btn");
  if (rb) rb.style.display = "none";
  const eh = document.getElementById("edit-hierarchy-btn");
  if (eh) eh.style.display = "none";
  ["comms","corporate","frontline"].forEach(rt => {
    document.getElementById(`list-${rt}`).innerHTML =
      "<div class='empty-state'>Click Search to find people</div>";
  });
  goToStep(1);
}

/* ── Boot ────────────────────────────────────────────────────────────────── */
// Runs once on page load: applies saved credentials to the topbar and fires
// GET /api/ping to colour the connection dot.
(function init() {
  const hostname = S.creds.base.replace(/^https?:\/\//, "").split("/")[0];
  document.getElementById("topbar-instance").textContent = hostname;
  checkConnection(true);
})();
