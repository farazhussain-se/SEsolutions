import { WidgetApi } from "@staffbase/widget-sdk";

export interface DashboardOptions {
  container: HTMLElement;
  widgetApi: WidgetApi;
  backendBase: string;
  backendSecret?: string;
  tasksInstallationId?: string;
}

const DEFAULT_TASKS_INSTALLATION_ID = "6a57a000450b115cd8083c22";

/** Wraps fetch so every backend call carries the shared secret when one is
 * configured — required the moment the backend is reachable from outside
 * localhost (e.g. behind a tunnel); a no-op header when unset. */
function apiFetch(url: string, backendSecret: string | undefined, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (backendSecret) headers.set("X-Backend-Secret", backendSecret);
  return fetch(url, { ...init, headers });
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
  const { container, widgetApi, backendBase, backendSecret } = opts;
  const tasksInstallationId = opts.tasksInstallationId || DEFAULT_TASKS_INSTALLATION_ID;

  applySBBrand();
  wireTabs(container);
  wireChecklist(container);
  wireSetupLink(container);
  applyViewerIdentity(container, widgetApi);
  checkBackendHealth(container, backendBase, backendSecret);
  runSdkDiagnostics(container, widgetApi, tasksInstallationId);
  initJourneyTracker(container, backendBase, backendSecret);
  const { getUserId } = initTeamTasksAndRoleChange(container, backendBase, backendSecret);
  initPromotionLauncher(container, backendBase, backendSecret, getUserId);
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

/** Confirms the local backend (which holds the real API token) is reachable. */
function checkBackendHealth(container: HTMLElement, backendBase: string, backendSecret?: string): void {
  setText(container, "#backendUrlDisplay", backendBase);
  const badge = container.querySelector<HTMLElement>("#backendStatusBadge");
  const text = container.querySelector<HTMLElement>("#backendStatusText");

  apiFetch(`${backendBase}/api/health`, backendSecret)
    .then((r) => r.json())
    .then((data) => {
      if (!badge || !text) return;
      if (data.ok) {
        badge.className = "live-badge live";
        badge.textContent = "Connected";
        text.textContent = "Reachable · Staffbase branch responded";
      } else {
        badge.className = "live-badge demo";
        badge.textContent = "Unreachable";
        text.textContent = data.reason || "Backend responded but reported an error";
      }
    })
    .catch(() => {
      if (!badge || !text) return;
      badge.className = "live-badge demo";
      badge.textContent = "Unreachable";
      text.textContent = `Could not reach ${backendBase} — is the local server running?`;
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

interface JourneyStep {
  name: string;
  total: number;
  completed: number;
}
interface RosterEntry {
  name: string;
  initials: string;
  stepIndex: number;
}

function initJourneyTracker(container: HTMLElement, backendBase: string, backendSecret?: string): void {
  const journeyNameEl = container.querySelector<HTMLElement>("#journeyName");
  const journeyMetaEl = container.querySelector<HTMLElement>("#journeyMeta");
  const badgeEl = container.querySelector<HTMLElement>("#liveBadge");
  const stepsEl = container.querySelector<HTMLElement>("#journeySteps");
  const rosterEl = container.querySelector<HTMLElement>("#journeyRoster");
  if (!journeyNameEl || !journeyMetaEl || !badgeEl || !stepsEl || !rosterEl) return;

  const DEMO_STEPS: JourneyStep[] = [
    { name: "Day 0 – Welcome & Offer Acceptance", total: 6, completed: 6 },
    { name: "~10 Days Out – I-9 & Tax Forms", total: 6, completed: 5 },
    { name: "~1 Week Out – LMS Safety & Role Training", total: 6, completed: 4 },
    { name: "Final Countdown – Day 1 Readiness Check", total: 6, completed: 2 },
  ];
  const DEMO_HIRES: RosterEntry[] = [
    { name: "Jamie Cole", initials: "JC", stepIndex: 2 },
    { name: "Priya Shah", initials: "PS", stepIndex: 4 },
    { name: "Chris Diaz", initials: "CD", stepIndex: 1 },
  ];

  function setBadge(state: string, label: string) {
    badgeEl!.className = "live-badge " + state;
    badgeEl!.textContent = label;
  }

  function renderSteps(steps: JourneyStep[]) {
    stepsEl!.innerHTML = "";
    steps.forEach((s) => {
      const pct = s.total ? Math.round((s.completed / s.total) * 100) : 0;
      const row = document.createElement("div");
      row.className = "journey-step";
      row.innerHTML =
        '<div class="journey-step-row"><span class="journey-step-name"></span><span class="journey-step-count"></span></div>' +
        '<div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%;"></div></div>';
      row.querySelector(".journey-step-name")!.textContent = s.name;
      row.querySelector(".journey-step-count")!.textContent = `${s.completed} / ${s.total}`;
      stepsEl!.appendChild(row);
    });
  }

  function renderRoster(hires: RosterEntry[], stepNames: string[]) {
    rosterEl!.innerHTML = "";
    hires.forEach((h) => {
      const done = h.stepIndex >= stepNames.length;
      const label = done ? "All steps complete" : `Step ${h.stepIndex + 1} of ${stepNames.length} · ${stepNames[h.stepIndex]}`;
      const pillClass = done ? "ok" : h.stepIndex === 0 ? "warn" : "info";
      const pillText = done ? "Completed" : `Step ${h.stepIndex + 1} of ${stepNames.length}`;
      const row = document.createElement("div");
      row.className = "roster-row";
      row.innerHTML =
        '<div class="ooo-avatar"></div><div class="hire-info"><div class="hire-name"></div><div class="hire-meta"></div></div><span class="cw-pill"></span>';
      row.querySelector(".ooo-avatar")!.textContent = h.initials;
      row.querySelector(".hire-name")!.textContent = h.name;
      row.querySelector(".hire-meta")!.textContent = label;
      const pill = row.querySelector(".cw-pill")!;
      pill.classList.add(pillClass);
      pill.textContent = pillText;
      rosterEl!.appendChild(row);
    });
  }

  function renderFullyStaticDemo() {
    journeyNameEl!.textContent = "New Hire Onboarding";
    journeyMetaEl!.textContent = `${DEMO_STEPS.length} steps`;
    setBadge("demo", "Demo Data");
    renderSteps(DEMO_STEPS);
    renderRoster(DEMO_HIRES, DEMO_STEPS.map((s) => s.name));
  }

  apiFetch(`${backendBase}/api/journeys/report`, backendSecret)
    .then((r) => r.json())
    .then((data) => {
      if (data.error) throw new Error(data.error);
      journeyNameEl!.textContent = data.journeyName;
      const syncedAt = data.syncedAt ? new Date(data.syncedAt).toLocaleTimeString() : "just now";
      const isLive = data.badge === "live";
      journeyMetaEl!.textContent = isLive ? `${data.stepCount} steps · synced ${syncedAt}` : `${data.stepCount} steps`;
      setBadge(isLive ? "live" : "partial", isLive ? "Live" : "Live Steps · Sample Progress");
      renderSteps(data.steps);
      const stepNames = data.steps.map((s: JourneyStep) => s.name);
      renderRoster(data.roster && data.roster.length ? data.roster : DEMO_HIRES, stepNames);
    })
    .catch(renderFullyStaticDemo);
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

function initTeamTasksAndRoleChange(
  container: HTMLElement,
  backendBase: string,
  backendSecret?: string
): { getUserId: (name: string) => string | undefined } {
  const tasksMetaEl = container.querySelector<HTMLElement>("#tasksMeta");
  const tasksBadgeEl = container.querySelector<HTMLElement>("#tasksBadge");
  const tasksListEl = container.querySelector<HTMLElement>("#tasksList");
  const memberSelect = container.querySelector<HTMLSelectElement>("#promoMember");
  const currentTitleEl = container.querySelector<HTMLElement>("#promoCurrentTitle");
  const promoBadgeEl = container.querySelector<HTMLElement>("#promoBadge");

  let titleByName: Record<string, string> = {};
  let userIdByName: Record<string, string> = {};

  const DEMO_TASKS: TaskGroup[] = [
    { name: "Jamie Cole", tasks: [{ title: "Submit CPR/AED certification documentation", priority: "Priority_1", status: "Open" }] },
    { name: "Priya Shah", tasks: [{ title: "Shadow 2 opening shifts with Front Desk Lead", priority: "Priority_3", status: "Open" }] },
    { name: "Chris Diaz", tasks: [{ title: "Complete lifeguard certification renewal", priority: "Priority_2", status: "Open" }] },
  ];
  const DEMO_MEMBERS: RoleChangeMember[] = [
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

  renderMembers(DEMO_MEMBERS);
  setPromoBadge("demo", "Demo Data");

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

  function renderTasksFullyStaticDemo() {
    if (!tasksMetaEl || !tasksBadgeEl) return;
    const total = DEMO_TASKS.reduce((n, g) => n + g.tasks.length, 0);
    tasksMetaEl.textContent = `${total} open tasks`;
    tasksBadgeEl.className = "live-badge demo";
    tasksBadgeEl.textContent = "Demo Data";
    renderTaskGroups(DEMO_TASKS);
  }

  apiFetch(`${backendBase}/api/tasks`, backendSecret)
    .then((r) => r.json())
    .then((data) => {
      if (data.error || !data.groups) throw new Error(data.error || "no data");
      if (!tasksMetaEl || !tasksBadgeEl) return;
      tasksMetaEl.textContent = `${data.totalOpen} open tasks · ${data.peopleCount} people`;
      tasksBadgeEl.className = "live-badge live";
      tasksBadgeEl.textContent = "Live";
      renderTaskGroups(data.groups);

      if (data.roleChangeMembers && data.roleChangeMembers.length) {
        renderMembers(data.roleChangeMembers);
        setPromoBadge("live", "Live");
      }
    })
    .catch(renderTasksFullyStaticDemo);

  return { getUserId: (name: string) => userIdByName[name] };
}

function initPromotionLauncher(
  container: HTMLElement,
  backendBase: string,
  backendSecret: string | undefined,
  getUserId: (name: string) => string | undefined
): void {
  const launchBtn = container.querySelector<HTMLButtonElement>("#promoLaunchBtn");
  if (!launchBtn) return;

  launchBtn.addEventListener("click", () => {
    const memberSelect = container.querySelector<HTMLSelectElement>("#promoMember");
    const titleSelect = container.querySelector<HTMLSelectElement>("#promoTitle");
    const rateInput = container.querySelector<HTMLInputElement>("#promoRate");
    const confirmEl = container.querySelector<HTMLElement>("#promoConfirm");
    const currentTitleEl = container.querySelector<HTMLElement>("#promoCurrentTitle");
    const list = container.querySelector<HTMLElement>("#transactionList");
    if (!memberSelect || !titleSelect || !rateInput || !confirmEl || !currentTitleEl || !list) return;

    const name = memberSelect.value;
    const title = titleSelect.value;
    if (!name || !title) return;
    const rate = rateInput.value.trim();
    const userId = getUserId(name);

    function reset() {
      confirmEl!.classList.add("show");
      memberSelect!.value = "";
      titleSelect!.value = "";
      rateInput!.value = "";
      currentTitleEl!.classList.remove("show");
      setTimeout(() => confirmEl!.classList.remove("show"), 5000);
    }

    function prependRow(entryName: string, entryTitle: string, entryRate: string) {
      const row = document.createElement("div");
      row.className = "team-row";
      row.innerHTML =
        '<div class="team-row-avatar"></div><div class="team-row-body"><div class="team-row-name"></div><div class="team-row-meta"></div></div><button class="action-btn secondary small">View</button>';
      row.querySelector(".team-row-avatar")!.textContent = initialsOf(entryName);
      row.querySelector(".team-row-name")!.textContent = entryName;
      row.querySelector(".team-row-meta")!.textContent = entryTitle + (entryRate ? ` · ${entryRate}` : "");
      list!.insertBefore(row, list!.firstChild);
    }

    apiFetch(`${backendBase}/api/role-change`, backendSecret, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, title, rate, userId }),
    })
      .then((r) => r.json())
      .then((entry) => {
        prependRow(entry.name || name, entry.title || title, entry.rate || rate);
        reset();
      })
      .catch(() => {
        // backend unreachable — keep the interaction working locally, same as the fully-static demo
        prependRow(name, title, rate);
        reset();
      });
  });
}
