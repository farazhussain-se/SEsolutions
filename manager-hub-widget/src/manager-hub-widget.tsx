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
  backendBase?: string;
  backendSecret?: string;
  contentLanguage?: string;
}

const DEFAULT_BACKEND_BASE = "http://localhost:5050";

export const ManagerHubWidget = ({ widgetApi, backendBase, backendSecret }: ManagerHubWidgetProps): ReactElement => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !widgetApi) return;
    initDashboard({
      container: containerRef.current,
      widgetApi,
      backendBase: backendBase || DEFAULT_BACKEND_BASE,
      backendSecret,
    });
    // Intentionally runs once per mount — the dashboard wires its own event
    // listeners and does its own fetching internally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <style>{dashboardCss}</style>
      <div ref={containerRef} dangerouslySetInnerHTML={{ __html: dashboardHtml }} />
    </div>
  );
};
