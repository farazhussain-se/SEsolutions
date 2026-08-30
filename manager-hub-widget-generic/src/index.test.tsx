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

import { screen } from "@testing-library/dom";

import "../dev/bootstrap";

describe("Widget test", () => {
  beforeAll(() => {
    global.fetch = jest.fn().mockRejectedValue(new Error("no backend in tests"));
    document.body.innerHTML = `
        <div id="preview"></div>
        <div id="config"></div>
        `;
  });

  it("should render the widget and pull the real signed-in user via widgetApi", async () => {
    const widget = document.createElement("manager-hub-widget");
    await import("./index");
    document.body.appendChild(widget);

    expect(await screen.findByText("MANAGER HUB")).toBeInTheDocument();
    expect((await screen.findAllByText(/Lucy Liu/)).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Manager Hub Widget')).toBeInTheDocument();
  });
});
