/*!
 * Copyright 2026, Staffbase SE and contributors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// DEV: this is the React "mount point" — it renders the static HTML/CSS from
// dashboard.html.txt/dashboard.css.txt into the DOM once, then hands off to
// initDashboard() (dashboard-logic.ts) to actually wire it up. It re-runs
// that handoff (via the useEffect below) whenever apitoken or demoMode
// change, and uses a `key` on the inner div to force a full DOM remount each
// time — otherwise dashboard-logic.ts's querySelector-based event listeners
// would double up on stale markup instead of attaching fresh ones.
//
// PM: React itself barely does anything in this widget — it's really just
// the on-ramp Staffbase requires. The actual dashboard is built with plain
// DOM APIs in dashboard-logic.ts, not React components, which is why that
// file (not this one) is where "what does the widget do" actually lives.
import React, { ReactElement, useEffect, useRef } from "react";
import { WidgetApi } from "@staffbase/widget-sdk";

import dashboardCss from "./dashboard.css.txt";
import dashboardHtml from "./dashboard.html.txt";
import { initDashboard } from "./dashboard-logic";

export interface ManagerHubWidgetProps {
  widgetApi: WidgetApi;
  apitoken?: string;
  /** Studio boolean config. Custom-element attributes arrive as strings, so
   * this can be a real boolean (dev harness) or "true"/"false" (production). */
  demomode?: boolean | string;
  contentLanguage?: string;
}

/** Demo mode defaults ON so a freshly-installed widget is never empty. Only
 * an explicit "false" (or real boolean false) turns it off. */
function resolveDemoMode(demomode?: boolean | string): boolean {
  if (demomode === undefined || demomode === null || demomode === "") return true;
  return String(demomode) !== "false";
}

export const ManagerHubWidget = ({ widgetApi, apitoken, demomode }: ManagerHubWidgetProps): ReactElement => {
  const containerRef = useRef<HTMLDivElement>(null);
  const demoMode = resolveDemoMode(demomode);

  useEffect(() => {
    if (!containerRef.current || !widgetApi) return;
    // The branch's own base URL is available straight from the SDK — no
    // manual "which instance" config needed, only the token itself.
    const branch = widgetApi.getBranchInformation();
    const branchBase = (branch?.webUrl || "").replace(/\/$/, "") + "/api";
    initDashboard({
      container: containerRef.current,
      widgetApi,
      branchBase,
      apiToken: (apitoken || "").trim(),
      demoMode,
    });
    // Re-runs if apitoken or demoMode changes (e.g. Studio config updated) —
    // the `key` below forces a fresh DOM tree each time so initDashboard never
    // wires duplicate event listeners onto stale markup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apitoken, demoMode]);

  return (
    <div>
      <style>{dashboardCss}</style>
      <div
        key={`${apitoken || "no-token"}:${demoMode ? "demo" : "live"}`}
        ref={containerRef}
        dangerouslySetInnerHTML={{ __html: dashboardHtml }}
      />
    </div>
  );
};
