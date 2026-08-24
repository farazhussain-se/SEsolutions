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

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

import { DocusignHandbookWidget } from "./docusign-handbook-widget";
import apiMock from "../dev/widget-api-mock";

beforeEach(() => {
  window.localStorage.clear();
});

describe("DocusignHandbookWidget", () => {
  it("renders the envelope view and resolves the signer from the widget API", async () => {
    render(<DocusignHandbookWidget contentLanguage="en_US" widgetApi={apiMock} />);

    expect(screen.getByText("Employee Handbook 2026 — Signature Required")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Lucy Liu")).toBeInTheDocument());
  });

  it("requires confirming the handbook was read before continuing", async () => {
    render(<DocusignHandbookWidget contentLanguage="en_US" widgetApi={apiMock} />);
    await waitFor(() => expect(screen.getByText("Lucy Liu")).toBeInTheDocument());

    window.alert = jest.fn();
    fireEvent.click(screen.getByText("CONTINUE"));
    expect(window.alert).toHaveBeenCalled();
    expect(screen.getByText("Employee Handbook 2026 — Signature Required")).toBeInTheDocument();
  });

  it("walks through sign -> adopt -> finish and pulls the name from the profile, not free text", async () => {
    render(<DocusignHandbookWidget contentLanguage="en_US" widgetApi={apiMock} />);
    await waitFor(() => expect(screen.getByText("Lucy Liu")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("I have read and reviewed the Employee Handbook."));
    fireEvent.click(screen.getByText("CONTINUE"));

    fireEvent.click(await screen.findByText("SIGN HERE"));
    expect(screen.getAllByText("Lucy Liu").length).toBeGreaterThan(0);

    fireEvent.click(
      screen.getByLabelText(
        /I agree that the signature and initials will be the electronic representation/,
      ),
    );
    fireEvent.click(screen.getByText("ADOPT AND SIGN"));

    fireEvent.click(await screen.findByText("FINISH"));
    expect(await screen.findByText("You've completed this document.")).toBeInTheDocument();
  });
});
