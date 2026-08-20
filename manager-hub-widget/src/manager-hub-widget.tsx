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

import React, { ReactElement, useEffect, useRef } from "react";
import { WidgetApi } from "@staffbase/widget-sdk";

import dashboardCss from "./dashboard.css.txt";
import dashboardHtml from "./dashboard.html.txt";
import { initDashboard } from "./dashboard-logic";

export interface ManagerHubWidgetProps {
  widgetApi: WidgetApi;
  apitoken?: string;
  contentLanguage?: string;
}

export const ManagerHubWidget = ({ widgetApi, apitoken }: ManagerHubWidgetProps): ReactElement => {
  const containerRef = useRef<HTMLDivElement>(null);

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
      apiToken: apitoken || "",
    });
    // Re-runs if apitoken changes (e.g. Studio config updated) — the `key`
    // below forces a fresh DOM tree each time so initDashboard never wires
    // duplicate event listeners onto stale markup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apitoken]);

  return (
    <div>
      <style>{dashboardCss}</style>
      <div key={apitoken || "no-token"} ref={containerRef} dangerouslySetInnerHTML={{ __html: dashboardHtml }} />
    </div>
  );
};
