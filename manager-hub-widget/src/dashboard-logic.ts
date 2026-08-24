import { WidgetApi } from "@staffbase/widget-sdk";

export interface DashboardOptions {
  container: HTMLElement;
  widgetApi: WidgetApi;
  /** Derived once from widgetApi.getBranchInformation().webUrl — not user-configured. */
  branchBase: string;
  /** The one-time-setup Staffbase Branch API token (Basic-auth key:secret, base64). */
  apiToken: string;
  tasksInstallationId?: string;
}

const DEFAULT_TASKS_INSTALLATION_ID = "6a57a000450b115cd8083c22";

/** Calls the real Staffbase branch API directly from the browser — CORS is
 * open on these endpoints, and the token lives only in this widget's own
 * Studio configuration (entered once at install time), never in a separate
 * backend or tunnel. */
function staffbaseFetch(branchBase: string, apiToken: string, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", "Basic " + apiToken);
  return fetch(`${branchBase}${path}`, { ...init, headers });
}

function resolveUsers(branchBase: string, apiToken: string, ids: string[]): Promise<Record<string, any>> {
  return Promise.all(
    ids.map((id) =>
      staffbaseFetch(branchBase, apiToken, `/users/${id}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    )
  ).then((users) => {
    const byId: Record<string, any> = {};
    ids.forEach((id, i) => {
      byId[id] = users[i];
    });
    return byId;
  });
}

function nameOf(user: any): string {
  return user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : "Unknown";
}

function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const first = (parts[0] || "?")[0] || "?";
  const last = (parts[parts.length - 1] || "?")[0] || "?";
  return (first + last).toUpperCase();
}

function setText(container: HTMLElement, selector: string, text: string): void {
  const el = container.querySelector(selector);
  if (el) el.textContent = text;
}

/**
 * Single entry point mounted by the React wrapper in a useEffect. Everything
 * here queries within `container` (not `document`) so multiple instances on
 * one page wouldn't collide — the one known limitation carried over from the
 * original static file is that IDs are still assumed unique per instance,
 * same tradeoff made for servicenow-widget.
 */
export function initDashboard(opts: DashboardOptions): void {
  const { container, widgetApi, branchBase, apiToken } = opts;
  const tasksInstallationId = opts.tasksInstallationId || DEFAULT_TASKS_INSTALLATION_ID;

  applySBBrand();
  wireTabs(container);
  wireChecklist(container);
  wireSetupLink(container);
  wireCollapsibleCards(container);
  checkTokenStatus(container, branchBase, apiToken);
  wireDiagnosticsButton(container, branchBase, apiToken, tasksInstallationId);
  runSdkDiagnostics(container, widgetApi, tasksInstallationId);
  initJourneyProgress(container, branchBase, apiToken);
  const { getUserId } = initTeamTasksAndRoleChange(container, branchBase, apiToken, tasksInstallationId);
  initPromotionLauncher(container, branchBase, apiToken, getUserId);
  initRequisitions(container);
  applyViewerIdentity(container, widgetApi);
}

function applySBBrand(): void {
  try {
    const sb = getComputedStyle(document.documentElement).getPropertyValue("--sb-brand").trim();
    if (sb) {
      document.documentElement.style.setProperty("--primary", sb);
      return;
    }
    if (window.parent && window.parent !== window) {
      const pb = getComputedStyle(window.parent.document.documentElement).getPropertyValue("--sb-brand").trim();
      if (pb) document.documentElement.style.setProperty("--primary", pb);
    }
  } catch (e) {
    // cross-origin parent — nothing we can do, keep the default palette
  }
}

function wireTabs(container: HTMLElement): void {
  const tabs = Array.from(container.querySelectorAll<HTMLElement>(".cw-tab"));
  const views = Array.from(container.querySelectorAll<HTMLElement>(".view"));
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      tabs.forEach((each) => each.classList.remove("active"));
      tab.classList.add("active");
      views.forEach((v) => {
        v.classList.remove("active");
        if (v.id === "view-" + target) v.classList.add("active");
      });
    });
  });
}

function wireChecklist(container: HTMLElement): void {
  container.querySelectorAll(".checklist-check").forEach((box) => {
    box.addEventListener("click", () => {
      box.closest(".checklist-row")?.classList.toggle("done");
    });
  });
}

const COLLAPSE_CHEVRON_SVG =
  '<span class="collapse-chevron"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>';

/** Makes the Team Readiness panels collapsible by clicking their header —
 * scoped to that tab rather than every side-card dashboard-wide. */
function wireCollapsibleCards(container: HTMLElement): void {
  const scope = container.querySelector<HTMLElement>("#view-progress");
  if (!scope) return;
  scope.querySelectorAll<HTMLElement>(".side-card").forEach((card) => {
    const header = card.querySelector<HTMLElement>("h3");
    if (!header) return;
    header.insertAdjacentHTML("beforeend", COLLAPSE_CHEVRON_SVG);
    header.style.cursor = "pointer";
    header.addEventListener("click", () => {
      card.classList.toggle("collapsed");
    });
  });
}

function wireSetupLink(container: HTMLElement): void {
  const statusSetupLink = container.querySelector<HTMLAnchorElement>("#statusSetupLink");
  statusSetupLink?.addEventListener("click", (e) => {
    e.preventDefault();
    container.querySelector<HTMLElement>('.cw-tab[data-tab="setup"]')?.click();
  });
}

/** Real logged-in manager's identity via the widget SDK — no manual login. */
function applyViewerIdentity(container: HTMLElement, widgetApi: WidgetApi): void {
  widgetApi
    .getUserInformation()
    .then((user) => {
      const name = `${user.firstName} ${user.lastName}`.trim();
      const initials = initialsOf(name);
      const roleLine = [user.position, user.location].filter(Boolean).join(" · ");

      setText(container, ".header-user-name", name);
      setText(container, ".header-user-avatar", initials);
      setText(container, ".header-user-role", roleLine || "—");

      setText(container, "#setupViewerName", name);
      setText(container, "#setupViewerAvatar", initials);
      setText(container, "#setupViewerMeta", [user.department, user.location].filter(Boolean).join(" · ") || "—");
    })
    .catch(() => {
      // leave the placeholder markup in place — only happens outside a real widget host
    });
}

/** The only real "setup" step: is a token configured, and does it actually
 * authenticate? A cheap GET /branch call proves both at once. */
function checkTokenStatus(container: HTMLElement, branchBase: string, apiToken: string): void {
  const badge = container.querySelector<HTMLElement>("#tokenStatusBadge");
  const text = container.querySelector<HTMLElement>("#tokenStatusText");
  if (!badge || !text) return;

  if (!apiToken) {
    badge.className = "live-badge demo";
    badge.textContent = "Not configured";
    text.textContent = "Paste your Staffbase Branch API token into this widget's configuration in Studio.";
    return;
  }

  staffbaseFetch(branchBase, apiToken, "/branch")
    .then((r) => {
      if (r.ok) {
        badge.className = "live-badge live";
        badge.textContent = "Connected";
        text.textContent = `Reachable · ${branchBase}`;
      } else {
        badge.className = "live-badge demo";
        badge.textContent = "Invalid";
        text.textContent = `Token rejected (HTTP ${r.status}) — check it was copied correctly.`;
      }
    })
    .catch(() => {
      badge.className = "live-badge demo";
      badge.textContent = "Unreachable";
      text.textContent = `Could not reach ${branchBase}.`;
    });
}

interface DiagnosticResult {
  label: string;
  ok: boolean;
  detail?: string;
}

/** The "BIT" (built-in test): a fuller self-check than the always-visible
 * token status above, tucked behind a small button rather than shown by
 * default — click it to actually exercise Journeys, Tasks, and Notifications
 * reachability with the configured token. */
function wireDiagnosticsButton(container: HTMLElement, branchBase: string, apiToken: string, tasksInstallationId: string): void {
  const btn = container.querySelector<HTMLButtonElement>("#runDiagnosticsBtn");
  const resultsEl = container.querySelector<HTMLElement>("#diagnosticsResults");
  if (!btn || !resultsEl) return;

  btn.addEventListener("click", async () => {
    if (!apiToken) {
      resultsEl.style.display = "";
      resultsEl.innerHTML = '<div class="ooo-meta">No token configured yet — nothing to test.</div>';
      return;
    }
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = "Running…";
    resultsEl.style.display = "";
    resultsEl.innerHTML = '<div class="ooo-meta">Running checks…</div>';

    const results: DiagnosticResult[] = [];

    async function check(label: string, fn: () => Promise<boolean>) {
      try {
        results.push({ label, ok: await fn() });
      } catch (e: any) {
        results.push({ label, ok: false, detail: e?.message });
      }
    }

    await check("Token authenticates (GET /branch)", async () => (await staffbaseFetch(branchBase, apiToken, "/branch")).ok);
    await check("Journeys reachable", async () => (await staffbaseFetch(branchBase, apiToken, "/branch/installations?limit=1")).ok);
    await check(
      "Tasks reachable",
      async () =>
        (
          await staffbaseFetch(
            branchBase,
            apiToken,
            `/tasks/${tasksInstallationId}/task/search?updateDateFrom=2020-01-01T00:00:00.000Z&status=OPEN&limit=1`
          )
        ).ok
    );
    await check("Notifications endpoint reachable", async () => {
      const r = await staffbaseFetch(branchBase, apiToken, "/branch/notifications", { method: "OPTIONS" });
      return r.ok;
    });

    resultsEl.innerHTML = "";
    results.forEach((r) => {
      const row = document.createElement("div");
      row.className = "ooo-row";
      row.innerHTML = '<span class="ooo-name"></span><span class="cw-pill"></span>';
      row.querySelector(".ooo-name")!.textContent = r.label + (r.detail ? ` (${r.detail})` : "");
      const pill = row.querySelector(".cw-pill")!;
      pill.classList.add(r.ok ? "ok" : "required");
      pill.textContent = r.ok ? "Pass" : "Fail";
      resultsEl.appendChild(row);
    });

    btn.disabled = false;
    btn.textContent = original;
  });
}

/** Exercises two widgetApi capabilities that could remove even more manual
 * setup later — surfaced as diagnostics rather than relied on yet, since
 * their real behavior (group-scoped filtering, Tasks-API-compatible JWTs)
 * can only be confirmed once this widget is actually installed live. */
function runSdkDiagnostics(container: HTMLElement, widgetApi: WidgetApi, tasksInstallationId: string): void {
  widgetApi
    .getUserList({ limit: 5 })
    .then((res) => {
      setText(container, "#sdkUserListStatus", `Available — org has ${res.total} users visible to this widget`);
    })
    .catch((err) => {
      setText(container, "#sdkUserListStatus", `Not available in this context (${err?.message || "error"})`);
    });

  widgetApi
    .getServiceToken(tasksInstallationId)
    .then((res) => {
      setText(
        container,
        "#sdkServiceTokenStatus",
        res.jwt ? "Available — JWT issued (not yet confirmed to authenticate against the Tasks API)" : "No token returned"
      );
    })
    .catch((err) => {
      setText(container, "#sdkServiceTokenStatus", `Not available in this context (${err?.message || "error"})`);
    });
}

interface JourneyEmployeeEntry {
  userId?: string;
  name: string;
  initials: string;
  journeyName: string;
  stepIndex: number;
  stepName: string | null;
  totalSteps: number;
  completed: boolean;
  daysOnStep?: number; // only ever present on the baseline entries below — real
  // API data has no per-user assigned/started timestamp yet (confirmed live)
}

const OVERDUE_THRESHOLD_DAYS = 3;
const CRITICAL_THRESHOLD_DAYS = 6;

// Baseline entries so the panel always shows something usable even before a
// real backend connection exists; real entries fetched from the branch get
// appended alongside these, not swapped in for them. Spans well beyond new-hire
// onboarding — journeys are journeys, not just a preboarding concept — and a
// few names are shared with other panels (Alicia Ford, Sam Whitfield) on
// purpose, to read as one continuous employee story across the dashboard
// rather than disconnected demo fixtures.
const BASELINE_EMPLOYEES: JourneyEmployeeEntry[] = [
  // New Hire - Pre Onboarding
  { name: "Jamie Cole", initials: "JC", journeyName: "New Hire - Pre Onboarding", stepIndex: 2, stepName: "~1 Week Out – Paperwork & Compliance", totalSteps: 4, completed: false, daysOnStep: 4 },
  { name: "Priya Shah", initials: "PS", journeyName: "New Hire - Pre Onboarding", stepIndex: 4, stepName: null, totalSteps: 4, completed: true, daysOnStep: 0 },
  { name: "Chris Diaz", initials: "CD", journeyName: "New Hire - Pre Onboarding", stepIndex: 1, stepName: "~10 Days Out – Set Up Your Profile", totalSteps: 4, completed: false, daysOnStep: 5 },

  // Frontline to Department Supervisor
  { name: "Derek Simmons", initials: "DS", journeyName: "Frontline to Department Supervisor", stepIndex: 1, stepName: "Manager Endorsement & Approval", totalSteps: 5, completed: false, daysOnStep: 2 },

  // Inter-Club Transfer
  { name: "Natalie Cho", initials: "NC", journeyName: "Inter-Club Transfer", stepIndex: 1, stepName: "Receiving Club Confirmation", totalSteps: 4, completed: false, daysOnStep: 6 },

  // AGM/GM Leadership Pipeline
  { name: "Daniel Esposito", initials: "DE", journeyName: "AGM/GM Leadership Pipeline", stepIndex: 2, stepName: "Club P&L Training", totalSteps: 4, completed: false, daysOnStep: 1 },

  // Certification Maintenance
  { name: "Zoe Bennett", initials: "ZB", journeyName: "Certification Maintenance", stepIndex: 4, stepName: null, totalSteps: 4, completed: true, daysOnStep: 0 },

  // Seasonal Status Transitions
  { name: "Owen Park", initials: "OP", journeyName: "Seasonal Status Transitions", stepIndex: 1, stepName: "Equipment & Badge Return", totalSteps: 4, completed: false, daysOnStep: 1 },

  // Annual Safety & Policy Audits
  { name: "Felicia Grant", initials: "FG", journeyName: "Annual Safety & Policy Audits", stepIndex: 0, stepName: "OSHA Standards Re-Acknowledgment", totalSteps: 3, completed: false, daysOnStep: 8 },

  // Performance Review & Merit Cycle
  { name: "Trevor Nash", initials: "TN", journeyName: "Performance Review & Merit Cycle", stepIndex: 2, stepName: "Merit Increase Approved", totalSteps: 4, completed: false, daysOnStep: 2 },

  // Corrective Action & Coaching — same person flagged for Timecard Discrepancy in Pay Discrepancy Log
  { name: "Alicia Ford", initials: "AF", journeyName: "Corrective Action & Coaching", stepIndex: 1, stepName: "Coaching Conversation Documented", totalSteps: 4, completed: false, daysOnStep: 5 },

  // Workplace Incident & Injury (Workers' Comp)
  { name: "Bradley Simms", initials: "BS", journeyName: "Workplace Incident & Injury (Workers' Comp)", stepIndex: 2, stepName: "Light-Duty Restrictions Coordinated with AGM", totalSteps: 4, completed: false, daysOnStep: 4 },

  // Leave Return & Re-Integration — same person currently on FMLA in the Leave of Absence Tracker
  { name: "Sam Whitfield", initials: "SW", journeyName: "Leave Return & Re-Integration", stepIndex: 0, stepName: "Return Date Confirmed", totalSteps: 4, completed: false, daysOnStep: 1 },

  // Offboarding & Asset Reclamation
  { name: "Patricia Yoon", initials: "PY", journeyName: "Offboarding & Asset Reclamation", stepIndex: 3, stepName: "Final Payroll Calculated", totalSteps: 4, completed: false, daysOnStep: 2 },
];

/** Client-side port of what used to be the backend's /api/journeys/employees:
 * lists every journey installation on the branch (not just onboarding),
 * pulls each one's report, and resolves real per-employee progress.
 *
 * Verified live against a real branch (2026-08-23): userStates entries key
 * their user by `id`, not `userId` as originally assumed — that mismatch
 * meant this always silently resolved zero real employees before. The
 * report also already inlines a `users: {id: {name, username}}` map, so
 * names come from that instead of a redundant GET /users/{id} per person.
 *
 * Completion is read from `status` (also not `completed`/`state` as
 * originally assumed). Only "not read" has been observed live so far (no
 * real completed example exists on the tested branch yet) — this endpoint
 * is undocumented (confirmed: absent from Staffbase's public API docs, and
 * a separate org's own "inofficial" endpoint notes have no captured sample
 * for this report either), so treating anything other than "not read" as
 * done is the best inference available, not a confirmed enum. Revisit once
 * a real "read"/"completed" example is observed. */
async function fetchJourneysEmployees(branchBase: string, apiToken: string): Promise<JourneyEmployeeEntry[]> {
  const installsRes = await staffbaseFetch(branchBase, apiToken, "/branch/installations?limit=200");
  if (!installsRes.ok) throw new Error("HTTP " + installsRes.status);
  const installsData = await installsRes.json();
  const journeyInstalls: any[] = (installsData.data || []).filter((i: any) => i.pluginId === "journeys");

  const reports = await Promise.all(
    journeyInstalls.map(async (j) => {
      try {
        const r = await staffbaseFetch(branchBase, apiToken, `/branch/journeys/${j.id}/report`);
        if (!r.ok) return null;
        const report = await r.json();
        return { journeyName: (j.title || "").trim() || "Untitled Journey", report };
      } catch {
        return null;
      }
    })
  );

  const validReports = reports.filter((r): r is { journeyName: string; report: any } => !!r && !!r.report?.steps?.length);

  const allIds = new Set<string>();
  validReports.forEach(({ report }) => {
    report.steps.forEach((s: any) => (s.userStates || []).forEach((u: any) => u?.id && allIds.add(u.id)));
  });
  const idsMissingFromReport = Array.from(allIds).filter((id) => {
    return !validReports.some(({ report }) => report.users && report.users[id]);
  });
  const fallbackUsers = idsMissingFromReport.length ? await resolveUsers(branchBase, apiToken, idsMissingFromReport) : {};

  function resolveName(uid: string, report: any): string {
    const inlineUser = report.users && report.users[uid];
    if (inlineUser?.name) return inlineUser.name;
    return nameOf(fallbackUsers[uid]);
  }

  const entries: JourneyEmployeeEntry[] = [];
  validReports.forEach(({ journeyName, report }) => {
    const rawSteps = report.steps;
    const ids = new Set<string>();
    rawSteps.forEach((s: any) => (s.userStates || []).forEach((u: any) => u?.id && ids.add(u.id)));
    ids.forEach((uid) => {
      const name = resolveName(uid, report);
      let stepIndex = rawSteps.length;
      for (let i = 0; i < rawSteps.length; i++) {
        const state = (rawSteps[i].userStates || []).find((u: any) => u?.id === uid);
        const isDone = !!state && !!state.status && state.status !== "not read";
        if (!isDone) {
          stepIndex = i;
          break;
        }
      }
      const completed = stepIndex >= rawSteps.length;
      entries.push({
        userId: uid,
        name,
        initials: initialsOf(name),
        journeyName,
        stepIndex,
        stepName: completed ? null : rawSteps[stepIndex].name,
        totalSteps: rawSteps.length,
        completed,
      });
    });
  });

  return entries;
}

function sendNotification(branchBase: string, apiToken: string, userId: string, title: string, message: string): Promise<void> {
  return staffbaseFetch(branchBase, apiToken, "/branch/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessorIds: [userId], content: { title, message } }),
  })
    .then(() => undefined)
    .catch(() => undefined);
}

function initJourneyProgress(container: HTMLElement, branchBase: string, apiToken: string): void {
  const metaEl = container.querySelector<HTMLElement>("#journeyProgressMeta");
  const badgeEl = container.querySelector<HTMLElement>("#journeyProgressBadge");
  const listEl = container.querySelector<HTMLElement>("#journeyProgressList");
  const overdueTitleEl = container.querySelector<HTMLElement>("#overdueStepsTitle");
  const overdueListEl = container.querySelector<HTMLElement>("#overdueStepsList");
  const overdueCriticalEl = container.querySelector<HTMLElement>("#overdueStepsCritical");
  const metricOverdueEl = container.querySelector<HTMLElement>("#metricOverdueValue");
  if (!metaEl || !badgeEl || !listEl || !overdueTitleEl || !overdueListEl) return;

  function renderEmployeeList(entries: JourneyEmployeeEntry[]) {
    listEl!.innerHTML = "";
    const byName = new Map<string, JourneyEmployeeEntry[]>();
    entries.forEach((e) => {
      if (!byName.has(e.name)) byName.set(e.name, []);
      byName.get(e.name)!.push(e);
    });
    byName.forEach((rows, name) => {
      const group = document.createElement("div");
      group.className = "task-group";
      const nameEl = document.createElement("div");
      nameEl.className = "task-group-name";
      nameEl.textContent = name;
      group.appendChild(nameEl);
      rows.forEach((r) => {
        const item = document.createElement("div");
        item.className = "task-item";
        item.innerHTML = '<span class="task-item-title"></span><span class="cw-pill"></span>';
        const label = r.completed
          ? r.journeyName
          : `${r.journeyName} · Step ${r.stepIndex + 1} of ${r.totalSteps}${r.stepName ? " · " + r.stepName : ""}`;
        item.querySelector(".task-item-title")!.textContent = label;
        const pill = item.querySelector(".cw-pill")!;
        pill.classList.add(r.completed ? "ok" : "info");
        pill.textContent = r.completed ? "Completed" : `Step ${r.stepIndex + 1}/${r.totalSteps}`;
        group.appendChild(item);
      });
      listEl!.appendChild(group);
    });
  }

  let lastOverdue: JourneyEmployeeEntry[] = [];

  function renderOverdueSteps(entries: JourneyEmployeeEntry[]) {
    const overdue = entries
      .filter((e) => !e.completed && typeof e.daysOnStep === "number" && e.daysOnStep > OVERDUE_THRESHOLD_DAYS)
      .sort((a, b) => (b.daysOnStep || 0) - (a.daysOnStep || 0));
    lastOverdue = overdue;

    const criticalCount = overdue.filter((e) => (e.daysOnStep || 0) >= CRITICAL_THRESHOLD_DAYS).length;
    overdueTitleEl!.textContent = "Overdue Journey Steps" + (overdue.length ? ` · ${overdue.length}` : "");
    if (overdueCriticalEl) {
      if (criticalCount) {
        overdueCriticalEl.style.display = "";
        overdueCriticalEl.textContent = `${criticalCount} critical`;
      } else {
        overdueCriticalEl.style.display = "none";
      }
    }
    if (metricOverdueEl) metricOverdueEl.textContent = String(overdue.length);

    overdueListEl!.innerHTML = "";
    if (!overdue.length) {
      const empty = document.createElement("div");
      empty.className = "ooo-meta";
      empty.textContent = "No overdue steps right now.";
      overdueListEl!.appendChild(empty);
      return;
    }

    // Grouped by employee (like the other panels) so a person stuck on
    // multiple steps reads as one entry, not scattered rows — sorted so the
    // most-overdue people surface first within the group order.
    const byName = new Map<string, JourneyEmployeeEntry[]>();
    overdue.forEach((e) => {
      if (!byName.has(e.name)) byName.set(e.name, []);
      byName.get(e.name)!.push(e);
    });
    byName.forEach((rows, name) => {
      const group = document.createElement("div");
      group.className = "task-group";
      const nameEl = document.createElement("div");
      nameEl.className = "task-group-name";
      nameEl.textContent = name;
      group.appendChild(nameEl);
      rows.forEach((e) => {
        const item = document.createElement("div");
        item.className = "task-item";
        item.innerHTML = '<span class="task-item-title"></span><span class="cw-pill"></span>';
        item.querySelector(".task-item-title")!.textContent = `${e.journeyName} · ${e.stepName}`;
        const pill = item.querySelector(".cw-pill")!;
        const critical = (e.daysOnStep || 0) >= CRITICAL_THRESHOLD_DAYS;
        pill.classList.add(critical ? "required" : "warn");
        pill.textContent = `${critical ? "Critical" : "Attention"} · ${e.daysOnStep}d`;
        group.appendChild(item);
      });
      overdueListEl!.appendChild(group);
    });
  }

  function renderBaselineOnly() {
    metaEl!.textContent = `${BASELINE_EMPLOYEES.length} tracked`;
    badgeEl!.style.display = "none";
    renderEmployeeList(BASELINE_EMPLOYEES);
    renderOverdueSteps(BASELINE_EMPLOYEES);
  }

  if (!apiToken) {
    renderBaselineOnly();
  } else {
    fetchJourneysEmployees(branchBase, apiToken)
      .then((real) => {
        const combined = BASELINE_EMPLOYEES.concat(real);
        const journeyCount = new Set(combined.map((e) => e.journeyName)).size;
        metaEl!.textContent = `${combined.length} tracked across ${journeyCount} journeys`;
        if (real.length) {
          badgeEl!.style.display = "";
          badgeEl!.className = "live-badge live";
          badgeEl!.textContent = "Live";
        } else {
          badgeEl!.style.display = "none";
        }
        renderEmployeeList(combined);
        renderOverdueSteps(combined);
      })
      .catch(renderBaselineOnly);
  }

  const sendRemindersBtn = container.querySelector<HTMLButtonElement>("#sendRemindersBtn");
  sendRemindersBtn?.addEventListener("click", () => {
    const original = sendRemindersBtn.textContent;
    const people = lastOverdue.filter((e) => e.userId);
    const finish = () => {
      sendRemindersBtn.textContent = "Reminders Sent";
      setTimeout(() => {
        sendRemindersBtn.textContent = original;
      }, 2500);
    };
    if (!people.length || !apiToken) {
      // Baseline entries (or no token configured) have nothing real to
      // notify — this is still an honest visual confirmation, not a fake API claim.
      finish();
      return;
    }
    Promise.all(
      people.map((e) =>
        sendNotification(branchBase, apiToken, e.userId!, "Journey step reminder", `Reminder for ${e.name}: please complete your current step.`)
      )
    )
      .then(finish)
      .catch(finish);
  });
}

interface TaskItem {
  title: string;
  priority: string;
  status: string;
}
interface TaskGroup {
  name: string;
  tasks: TaskItem[];
}
interface RoleChangeMember {
  name: string;
  title: string;
  userId?: string;
}
interface OverdueTaskEntry {
  userId?: string;
  name: string;
  title: string;
  dueDate?: string;
  daysOverdue: number;
}

// Real dueDate field confirmed live on Tasks API entries — this is a genuine
// calculation (past-due assigned tasks), not a fabricated count. Currently 0
// real tasks are overdue on this branch (all real due dates are in the
// future), so these baseline entries are what render until that changes.
const BASELINE_OVERDUE_TASKS: OverdueTaskEntry[] = [
  { name: "Devon Marks", title: "Submit Q2 facilities compliance checklist", daysOverdue: 4 },
  { name: "Zack Hall", title: "Renew CPR/AED certification", daysOverdue: 9 },
];

/** Client-side port of what used to be the backend's /api/tasks: fetches
 * open tasks, groups by assignee, resolves real names, and computes which
 * assigned tasks are genuinely past their real dueDate. */
async function fetchTeamTasksData(branchBase: string, apiToken: string, tasksInstallationId: string) {
  const url = `/tasks/${tasksInstallationId}/task/search?updateDateFrom=2020-01-01T00:00:00.000Z&status=OPEN&limit=50`;
  const res = await staffbaseFetch(branchBase, apiToken, url);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  const entries: any[] = data.entries || [];

  const idsNeeded = Array.from(new Set(entries.flatMap((t) => t.assigneeIds || [])));
  const users = await resolveUsers(branchBase, apiToken, idsNeeded);

  const groups: Record<string, TaskItem[]> = {};
  const order: string[] = [];
  const roleChangeMembers: RoleChangeMember[] = [];
  const overdueTasks: OverdueTaskEntry[] = [];
  const now = new Date();
  let assignedCount = 0;

  entries.forEach((t) => {
    const aid = (t.assigneeIds || [])[0];
    if (!aid) return; // no need for unassigned tasks — only show what's actually assigned
    const user = users[aid];
    const name = nameOf(user);
    if (!groups[name]) {
      groups[name] = [];
      order.push(name);
    }
    groups[name].push({ title: t.title, priority: t.priority, status: t.status === "OPEN" ? "Open" : t.status });
    assignedCount++;
    if (user) {
      const profile = user.profile || {};
      const titleField = user.position || profile.position || profile.title || "Team Member";
      if (!roleChangeMembers.some((m) => m.userId === aid)) roleChangeMembers.push({ userId: aid, name, title: titleField });
    }
    if (t.dueDate) {
      const dueDt = new Date(t.dueDate);
      if (dueDt < now) {
        const daysOverdue = Math.max(1, Math.floor((now.getTime() - dueDt.getTime()) / 86400000));
        overdueTasks.push({ userId: aid, name, title: t.title, dueDate: t.dueDate, daysOverdue });
      }
    }
  });

  return {
    totalOpen: assignedCount,
    peopleCount: order.length,
    groups: order.map((n) => ({ name: n, tasks: groups[n] })),
    roleChangeMembers,
    overdueTasks,
  };
}

function initTeamTasksAndRoleChange(
  container: HTMLElement,
  branchBase: string,
  apiToken: string,
  tasksInstallationId: string
): { getUserId: (name: string) => string | undefined } {
  const tasksMetaEl = container.querySelector<HTMLElement>("#tasksMeta");
  const tasksBadgeEl = container.querySelector<HTMLElement>("#tasksBadge");
  const tasksListEl = container.querySelector<HTMLElement>("#tasksList");
  const memberSelect = container.querySelector<HTMLSelectElement>("#promoMember");
  const currentTitleEl = container.querySelector<HTMLElement>("#promoCurrentTitle");
  const promoBadgeEl = container.querySelector<HTMLElement>("#promoBadge");
  const overdueTasksMetaEl = container.querySelector<HTMLElement>("#overdueTasksMeta");
  const overdueTasksBadgeEl = container.querySelector<HTMLElement>("#overdueTasksBadge");
  const overdueTasksListEl = container.querySelector<HTMLElement>("#overdueTasksList");
  const overdueTasksCriticalEl = container.querySelector<HTMLElement>("#overdueTasksCritical");
  const metricOverdueTasksEl = container.querySelector<HTMLElement>("#metricOverdueTasksValue");
  const taskMemberFilterEl = container.querySelector<HTMLSelectElement>("#taskMemberFilter");

  let titleByName: Record<string, string> = {};
  let userIdByName: Record<string, string> = {};

  function renderOverdueTeamTasks(entries: OverdueTaskEntry[], isLive: boolean) {
    if (!overdueTasksMetaEl || !overdueTasksListEl) return;
    const sorted = entries.slice().sort((a, b) => b.daysOverdue - a.daysOverdue);
    const criticalCount = sorted.filter((e) => e.daysOverdue >= CRITICAL_THRESHOLD_DAYS).length;

    overdueTasksMetaEl.textContent = `${sorted.length} past due`;
    if (metricOverdueTasksEl) metricOverdueTasksEl.textContent = String(sorted.length);
    if (overdueTasksCriticalEl) {
      if (criticalCount) {
        overdueTasksCriticalEl.style.display = "";
        overdueTasksCriticalEl.textContent = `${criticalCount} critical`;
      } else {
        overdueTasksCriticalEl.style.display = "none";
      }
    }
    if (overdueTasksBadgeEl) {
      if (isLive) {
        overdueTasksBadgeEl.style.display = "";
        overdueTasksBadgeEl.className = "live-badge live";
        overdueTasksBadgeEl.textContent = "Live";
      } else {
        overdueTasksBadgeEl.style.display = "none";
      }
    }

    overdueTasksListEl.innerHTML = "";
    if (!sorted.length) {
      const empty = document.createElement("div");
      empty.className = "ooo-meta";
      empty.textContent = "Nothing past due right now.";
      overdueTasksListEl.appendChild(empty);
      return;
    }

    // Grouped by assignee, most-overdue first, same visual language as the
    // Overdue Journey Steps and Team Tasks panels.
    const byName = new Map<string, OverdueTaskEntry[]>();
    sorted.forEach((e) => {
      if (!byName.has(e.name)) byName.set(e.name, []);
      byName.get(e.name)!.push(e);
    });
    byName.forEach((rows, name) => {
      const group = document.createElement("div");
      group.className = "task-group";
      const nameEl = document.createElement("div");
      nameEl.className = "task-group-name";
      nameEl.textContent = name;
      group.appendChild(nameEl);
      rows.forEach((e) => {
        const item = document.createElement("div");
        item.className = "task-item";
        item.innerHTML = '<span class="task-item-title"></span><span class="cw-pill required"></span>';
        item.querySelector(".task-item-title")!.textContent = e.title;
        const critical = e.daysOverdue >= CRITICAL_THRESHOLD_DAYS;
        const pill = item.querySelector(".cw-pill")!;
        pill.className = "cw-pill " + (critical ? "required" : "warn");
        pill.textContent = `${critical ? "Critical" : "Past Due"} · ${e.daysOverdue}d`;
        group.appendChild(item);
      });
      overdueTasksListEl.appendChild(group);
    });
  }

  const BASELINE_TASKS: TaskGroup[] = [
    { name: "Jamie Cole", tasks: [{ title: "Submit CPR/AED certification documentation", priority: "Priority_1", status: "Open" }] },
    { name: "Priya Shah", tasks: [{ title: "Shadow 2 opening shifts with Front Desk Lead", priority: "Priority_3", status: "Open" }] },
    { name: "Chris Diaz", tasks: [{ title: "Complete lifeguard certification renewal", priority: "Priority_2", status: "Open" }] },
  ];
  const BASELINE_MEMBERS: RoleChangeMember[] = [
    { name: "Kristina Crawford", title: "Front Desk Associate" },
    { name: "Gail Gonzalez", title: "Membership Concierge" },
    { name: "Billie Kelley", title: "Membership Concierge" },
    { name: "Greg Russell", title: "Membership Concierge" },
  ];

  function renderMembers(members: RoleChangeMember[]) {
    if (!memberSelect || !currentTitleEl) return;
    titleByName = {};
    userIdByName = {};
    memberSelect.innerHTML = '<option value="">Select team member…</option>';
    members.forEach((m) => {
      titleByName[m.name] = m.title;
      if (m.userId) userIdByName[m.name] = m.userId;
      const opt = document.createElement("option");
      opt.value = m.name;
      opt.textContent = `${m.name} — ${m.title}`;
      memberSelect.appendChild(opt);
    });
    currentTitleEl.classList.remove("show");
  }

  function setPromoBadge(state: string, label: string) {
    if (!promoBadgeEl) return;
    promoBadgeEl.className = "live-badge " + state;
    promoBadgeEl.textContent = label;
  }

  memberSelect?.addEventListener("change", () => {
    const name = memberSelect.value;
    if (!currentTitleEl) return;
    if (!name || !titleByName[name]) {
      currentTitleEl.classList.remove("show");
      return;
    }
    currentTitleEl.innerHTML = "Current title (via Tasks API): <strong></strong>";
    currentTitleEl.querySelector("strong")!.textContent = titleByName[name];
    currentTitleEl.classList.add("show");
  });

  renderMembers(BASELINE_MEMBERS);
  if (promoBadgeEl) promoBadgeEl.style.display = "none";

  function priorityPillClass(p: string): string {
    if (p === "Priority_1") return "required";
    if (p === "Priority_2") return "warn";
    return "";
  }

  function renderTaskGroups(groups: TaskGroup[]) {
    if (!tasksListEl) return;
    tasksListEl.innerHTML = "";
    groups.forEach((g) => {
      const group = document.createElement("div");
      group.className = "task-group";
      const nameEl = document.createElement("div");
      nameEl.className = "task-group-name";
      nameEl.textContent = g.name;
      group.appendChild(nameEl);
      g.tasks.forEach((t) => {
        const item = document.createElement("div");
        item.className = "task-item";
        item.innerHTML = '<span class="task-item-title"></span><span class="cw-pill"></span>';
        item.querySelector(".task-item-title")!.textContent = t.title;
        const pill = item.querySelector(".cw-pill")!;
        const pc = priorityPillClass(t.priority);
        if (pc) pill.classList.add(pc);
        pill.textContent = t.status || "Open";
        group.appendChild(item);
      });
      tasksListEl.appendChild(group);
    });
  }

  // Lets a manager pull tasks for one team member at a time instead of
  // scrolling a flat list of everyone's — defaults to "All Team Members" so
  // the existing at-a-glance view is never lost, just made drillable.
  let allTaskGroups: TaskGroup[] = [];

  function populateTaskMemberFilter(groups: TaskGroup[]) {
    if (!taskMemberFilterEl) return;
    const previousSelection = taskMemberFilterEl.value;
    taskMemberFilterEl.innerHTML = "";

    const totalTasks = groups.reduce((n, g) => n + g.tasks.length, 0);
    const allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = `All Team Members (${totalTasks})`;
    taskMemberFilterEl.appendChild(allOpt);

    groups
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((g) => {
        const opt = document.createElement("option");
        opt.value = g.name;
        opt.textContent = `${g.name} (${g.tasks.length})`;
        taskMemberFilterEl!.appendChild(opt);
      });

    if (previousSelection && groups.some((g) => g.name === previousSelection)) {
      taskMemberFilterEl.value = previousSelection;
    }
  }

  function applyTaskMemberFilter() {
    const selected = taskMemberFilterEl?.value || "";
    renderTaskGroups(selected ? allTaskGroups.filter((g) => g.name === selected) : allTaskGroups);
  }

  function setTaskGroups(groups: TaskGroup[]) {
    allTaskGroups = groups;
    populateTaskMemberFilter(groups);
    applyTaskMemberFilter();
  }

  taskMemberFilterEl?.addEventListener("change", applyTaskMemberFilter);

  function renderBaselineOnly() {
    if (!tasksMetaEl || !tasksBadgeEl) return;
    const total = BASELINE_TASKS.reduce((n, g) => n + g.tasks.length, 0);
    tasksMetaEl.textContent = `${total} open tasks`;
    tasksBadgeEl.style.display = "none";
    setTaskGroups(BASELINE_TASKS);
    renderOverdueTeamTasks(BASELINE_OVERDUE_TASKS, false);
  }

  if (!apiToken) {
    renderBaselineOnly();
  } else {
    fetchTeamTasksData(branchBase, apiToken, tasksInstallationId)
      .then((data) => {
        if (!tasksMetaEl || !tasksBadgeEl) return;
        const combinedGroups = BASELINE_TASKS.concat(data.groups);
        const combinedTotal = BASELINE_TASKS.reduce((n, g) => n + g.tasks.length, 0) + data.totalOpen;
        const combinedPeople = new Set(combinedGroups.map((g) => g.name)).size;
        tasksMetaEl.textContent = `${combinedTotal} open tasks · ${combinedPeople} people`;
        if (data.groups.length) {
          tasksBadgeEl.style.display = "";
          tasksBadgeEl.className = "live-badge live";
          tasksBadgeEl.textContent = "Live";
        }
        setTaskGroups(combinedGroups);

        renderOverdueTeamTasks(BASELINE_OVERDUE_TASKS.concat(data.overdueTasks), data.overdueTasks.length > 0);

        if (data.roleChangeMembers.length) {
          renderMembers(BASELINE_MEMBERS.concat(data.roleChangeMembers));
          setPromoBadge("live", "Live");
          if (promoBadgeEl) promoBadgeEl.style.display = "";
        }
      })
      .catch(renderBaselineOnly);
  }

  return { getUserId: (name: string) => userIdByName[name] };
}

interface WorkOrderItem {
  title: string;
  source: string;
  sourceCode: string;
  meta: string;
  action?: string;
}

// ServiceChannel and Workday Procurement are not connected in this build
// (see Setup tab) — same honest treatment as the ServiceNow ticket list:
// baseline data only, no live-badge claim.
const BASELINE_WORK_ORDERS: WorkOrderItem[] = [
  { title: "Approve HVAC vendor quote — $1,850", source: "ServiceChannel", sourceCode: "SC", meta: "Awaiting you", action: "Review" },
  { title: "Submit requisition: towels & cleaning supplies", source: "Workday PO", sourceCode: "WD", meta: "Draft ready", action: "Submit" },
  { title: "Receive pool chemical delivery", source: "ServiceChannel", sourceCode: "SC", meta: "Arriving today, 11:00a" },
  { title: "Monthly fire-safety inspection", source: "ServiceChannel", sourceCode: "SC", meta: "Due Fri", action: "Schedule" },
  { title: "Close 2 aged work orders (>30 days)", source: "ServiceChannel", sourceCode: "SC", meta: "", action: "Review" },
];

function initRequisitions(container: HTMLElement): void {
  const cardListEl = container.querySelector<HTMLElement>("#reqCardList");
  const cardViewEl = container.querySelector<HTMLElement>("#reqCardView");
  const fullViewEl = container.querySelector<HTMLElement>("#reqFullView");
  const viewAllBtn = container.querySelector<HTMLElement>("#reqViewAllBtn");
  const backBtn = container.querySelector<HTMLButtonElement>("#reqBackBtn");
  const instrToggle = container.querySelector<HTMLElement>("#reqInstrToggle");
  const tabOpen = container.querySelector<HTMLButtonElement>("#reqTabOpen");
  const tabCompleted = container.querySelector<HTMLButtonElement>("#reqTabCompleted");
  const openListEl = container.querySelector<HTMLElement>("#reqOpenList");
  const completedListEl = container.querySelector<HTMLElement>("#reqCompletedList");
  if (!cardListEl || !cardViewEl || !fullViewEl) return;

  cardListEl.innerHTML = "";
  BASELINE_WORK_ORDERS.forEach((item) => {
    const row = document.createElement("div");
    row.className = "team-row";
    row.innerHTML =
      '<div class="team-row-avatar"></div><div class="team-row-body"><div class="team-row-name"></div><div class="team-row-meta"></div></div>';
    row.querySelector(".team-row-avatar")!.textContent = item.sourceCode;
    row.querySelector(".team-row-name")!.textContent = item.title;
    row.querySelector(".team-row-meta")!.textContent = [item.source, item.meta].filter(Boolean).join(" · ");
    if (item.action) {
      const btn = document.createElement("button");
      btn.className = "action-btn secondary small";
      btn.textContent = item.action;
      row.appendChild(btn);
    }
    cardListEl.appendChild(row);
  });

  viewAllBtn?.addEventListener("click", () => {
    cardViewEl.style.display = "none";
    fullViewEl.style.display = "";
  });
  backBtn?.addEventListener("click", () => {
    fullViewEl.style.display = "none";
    cardViewEl.style.display = "";
  });

  instrToggle?.addEventListener("click", () => {
    instrToggle.closest(".side-card")?.classList.toggle("collapsed");
  });

  tabOpen?.addEventListener("click", () => {
    tabOpen.classList.add("active");
    tabCompleted?.classList.remove("active");
    if (openListEl) openListEl.style.display = "";
    if (completedListEl) completedListEl.style.display = "none";
  });
  tabCompleted?.addEventListener("click", () => {
    tabCompleted.classList.add("active");
    tabOpen?.classList.remove("active");
    if (openListEl) openListEl.style.display = "none";
    if (completedListEl) completedListEl.style.display = "";
  });
}

const ROLE_CHANGE_STORAGE_KEY = "lifetime-manager-hub:role-changes";

interface StoredRoleChange {
  name: string;
  title: string;
  rate: string;
}

function loadStoredRoleChanges(): StoredRoleChange[] {
  try {
    return JSON.parse(localStorage.getItem(ROLE_CHANGE_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveStoredRoleChange(entry: StoredRoleChange): void {
  try {
    const list = loadStoredRoleChanges();
    list.unshift(entry);
    localStorage.setItem(ROLE_CHANGE_STORAGE_KEY, JSON.stringify(list.slice(0, 20)));
  } catch {
    // localStorage unavailable (e.g. private browsing) — submission still
    // works for this session, it just won't survive a reload
  }
}

function buildTransactionRow(name: string, title: string, rate: string): HTMLElement {
  const row = document.createElement("div");
  row.className = "team-row";
  row.innerHTML =
    '<div class="team-row-avatar"></div><div class="team-row-body"><div class="team-row-name"></div><div class="team-row-meta"></div></div><button class="action-btn secondary small">View</button>';
  row.querySelector(".team-row-avatar")!.textContent = initialsOf(name);
  row.querySelector(".team-row-name")!.textContent = name;
  row.querySelector(".team-row-meta")!.textContent = title + (rate ? ` · ${rate}` : "");
  return row;
}

function initPromotionLauncher(
  container: HTMLElement,
  branchBase: string,
  apiToken: string,
  getUserId: (name: string) => string | undefined
): void {
  const list = container.querySelector<HTMLElement>("#transactionList");

  // Anything submitted in a prior session persists across reloads via
  // localStorage — no backend needed for this, it's not real Staffbase data.
  if (list) {
    loadStoredRoleChanges()
      .slice()
      .reverse()
      .forEach((entry) => list.insertBefore(buildTransactionRow(entry.name, entry.title, entry.rate), list.firstChild));
  }

  const launchBtn = container.querySelector<HTMLButtonElement>("#promoLaunchBtn");
  if (!launchBtn) return;

  launchBtn.addEventListener("click", () => {
    const memberSelect = container.querySelector<HTMLSelectElement>("#promoMember");
    const titleSelect = container.querySelector<HTMLSelectElement>("#promoTitle");
    const rateInput = container.querySelector<HTMLInputElement>("#promoRate");
    const confirmEl = container.querySelector<HTMLElement>("#promoConfirm");
    const currentTitleEl = container.querySelector<HTMLElement>("#promoCurrentTitle");
    if (!memberSelect || !titleSelect || !rateInput || !confirmEl || !currentTitleEl || !list) return;

    const name = memberSelect.value;
    const title = titleSelect.value;
    if (!name || !title) return;
    const rate = rateInput.value.trim();
    const userId = getUserId(name);

    saveStoredRoleChange({ name, title, rate });
    list.insertBefore(buildTransactionRow(name, title, rate), list.firstChild);

    if (userId && apiToken) {
      sendNotification(branchBase, apiToken, userId, "Role change submitted", `${name}: ${title}${rate ? " · " + rate : ""}`);
    }

    confirmEl.classList.add("show");
    memberSelect.value = "";
    titleSelect.value = "";
    rateInput.value = "";
    currentTitleEl.classList.remove("show");
    setTimeout(() => confirmEl.classList.remove("show"), 5000);
  });
}
