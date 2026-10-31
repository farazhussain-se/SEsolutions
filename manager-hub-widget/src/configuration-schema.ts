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
 * One-time setup: a Staffbase Branch API token (Basic-auth key:secret,
 * base64-encoded — the same kind of token created once in Studio's API
 * Access settings). CORS is open on Staffbase branch APIs, so the widget
 * calls Journeys/Tasks/Notifications directly with this token — no separate
 * backend to stand up or reconfigure after install.
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
    chaturl: {
      type: "string",
      title: "Chat link pattern (optional)",
    },
  },
};

export const uiSchema: UiSchema = {
  apitoken: {
    "ui:widget": "password",
    "ui:help": "One-time setup — paste the Branch API token here when installing this widget. The branch URL itself is detected automatically via the widget SDK.",
  },
  chaturl: {
    "ui:help":
      "Where the Chat button on a checklist sends you. Defaults to this branch's Life Chat app. Staffbase has no deep link to a single conversation — opening one does not change the URL — so this opens chat rather than a specific thread. A {userId} placeholder is substituted if you supply one; a full https:// URL also works.",
  },
  demomode: {
    "ui:help":
      "On: blends built-in sample team members, tasks, journeys and requisitions with whatever is live from the API, so every panel is populated and every workflow (reminders, filters, role changes) is demoable even on a fresh branch. Off: shows only real data returned by the API.",
  },
};
