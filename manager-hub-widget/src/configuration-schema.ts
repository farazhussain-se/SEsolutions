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
 * schema used for generation of the configuration dialog
 * see https://rjsf-team.github.io/react-jsonschema-form/docs/ for documentation
 */
export const configurationSchema: JSONSchema7 = {
  properties: {
    backendBase: {
      type: "string",
      title: "Backend URL",
      default: "http://localhost:5050",
    },
    backendSecret: {
      type: "string",
      title: "Backend shared secret",
    },
  },
};

/**
 * schema to add more customization to the form's look and feel
 * @see https://rjsf-team.github.io/react-jsonschema-form/docs/api-reference/uiSchema
 */
export const uiSchema: UiSchema = {
  backendBase: {
    "ui:help": "URL of the local backend that holds the real API credentials (see server/ in the repo). Point this at a tunnel URL if the widget is hosted somewhere that can't reach localhost.",
  },
  backendSecret: {
    "ui:widget": "password",
    "ui:help": "Must match BACKEND_SHARED_SECRET in server/.env — only required once the backend is reachable from outside localhost (e.g. behind a tunnel).",
  },
};
