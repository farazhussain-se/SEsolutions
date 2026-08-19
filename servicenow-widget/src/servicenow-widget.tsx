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
import { WidgetApi } from "widget-sdk";

import css from "./legacy-inbox-style.txt";
import markup from "./legacy-inbox-markup.txt";
import legacyScript from "./legacy-inbox-script.txt";

export interface ServiceNowWidgetProps {
  contentLanguage: string;
  widgetApi: WidgetApi;
}

/**
 * This widget's list/filter/sort/translation UI is a legacy vanilla-JS
 * single-page app (ported from the standalone ServiceNow demo widget). Rather
 * than re-implement ~700 lines of DOM logic in React (and risk subtly
 * breaking its i18n, filtering, and dropdown behavior), it's mounted as-is
 * and evaluated once the markup is in the DOM. `getRequestedByName` is the
 * only integration point with the real widget-sdk: the legacy script calls
 * it when a ticket is submitted, so newly created tickets are tagged with
 * the actual logged-in user instead of staying anonymous.
 *
 * Known limitation carried over from the original: the script looks elements
 * up by fixed DOM ids (`document.getElementById('listContainer')`, etc.), so
 * only one instance of this widget per page is supported — same constraint
 * the original static widget had.
 */
export const ServiceNowWidget = ({ widgetApi }: ServiceNowWidgetProps): ReactElement => {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    let requesterName: string | undefined;
    widgetApi
      .getUserInformation()
      .then((user) => {
        requesterName = [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined;
      })
      .catch(() => {
        requesterName = undefined;
      });

    const getRequestedByName = (): string | undefined => requesterName;

    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const runLegacyWidget = new Function("getRequestedByName", legacyScript);
    runLegacyWidget(getRequestedByName);
  }, [widgetApi]);

  return (
    <div>
      <style>{css}</style>
      <div ref={containerRef} dangerouslySetInnerHTML={{ __html: markup }} />
    </div>
  );
};
