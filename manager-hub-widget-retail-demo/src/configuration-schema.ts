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

import { UiSchema } from "@rjsf/utils";
import { JSONSchema7 } from "json-schema";

/**
 * DEV: this is the ONLY installer-facing config for this widget — it drives
 * Studio's "Configure widget" dialog (via RJSF: @rjsf/mui + this JSON Schema
 * + the uiSchema below) and, at runtime, becomes the `apitoken`/`demomode`
 * HTML attributes on the widget's custom element (see index.tsx's
 * `widgetAttributes` array — property names here MUST match those exactly,
 * all-lowercase, or Studio's saved values silently never reach the widget).
 *
 * PM: a Staffbase Branch API token (Basic-auth key:secret, base64-encoded —
 * the same kind of token created once in Studio's API Access settings).
 * CORS is open on Staffbase branch APIs, so the widget calls
 * Journeys/Tasks/Notifications directly with this token — no separate
 * backend to stand up or reconfigure after install. Pasting this one value
 * in, plus deciding whether "Demo mode" (sample data blending) is on, is the
 * entire setup process for this widget.
 */
export const configurationSchema: JSONSchema7 = {
  properties: {
    apitoken: {
      type: "string",
      title: "Staffbase API Token",
    },
    demomode: {
      type: "boolean",
      title: "Demo mode",
      default: true,
    },
  },
};

export const uiSchema: UiSchema = {
  apitoken: {
    "ui:widget": "password",
    "ui:help": "One-time setup — paste the Branch API token here when installing this widget. The branch URL itself is detected automatically via the widget SDK.",
  },
  demomode: {
    "ui:help":
      "On: blends built-in sample team members, tasks, journeys and requisitions with whatever is live from the API, so every panel is populated and every workflow (reminders, filters, role changes) is demoable even on a fresh branch. Off: shows only real data returned by the API.",
  },
};
