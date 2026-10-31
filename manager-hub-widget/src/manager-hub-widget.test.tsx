import React from "react";
import { screen, render, waitFor, within } from "@testing-library/react";

import { ManagerHubWidget } from "./manager-hub-widget";
import apiMock from "../dev/widget-api-mock";

describe("ManagerHubWidget", () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = jest.fn().mockRejectedValue(new Error("no token configured in tests"));
  });

  it("renders the dashboard shell and pulls the signed-in user via widgetApi", async () => {
    render(<ManagerHubWidget widgetApi={apiMock} contentLanguage="en_US" />);

    expect(screen.getByText("MANAGER HUB")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByText(/Lucy Liu/).length).toBeGreaterThan(0);
    });
  });

  it("falls back to baseline entries when no API token is configured, without labeling them as demo data in the data views", async () => {
    const { container } = render(<ManagerHubWidget widgetApi={apiMock} contentLanguage="en_US" />);

    await waitFor(() => {
      expect(screen.getAllByText(/Jamie Cole/).length).toBeGreaterThan(0);
    });
    // The Team Readiness data lists (where baseline entries render) must not
    // label those entries as demo/sample. "Demo mode" as a Setup-panel concept
    // is fine — it just can't leak into the actual data rows.
    const progressView = container.querySelector("#view-progress") as HTMLElement;
    expect(within(progressView).queryByText(/demo/i)).not.toBeInTheDocument();
  });

  it("passes demo mode through to the dashboard without throwing when it is disabled", async () => {
    render(<ManagerHubWidget widgetApi={apiMock} contentLanguage="en_US" demomode="false" />);

    // Shell still renders; with no token and demo off the data lists are empty
    // rather than showing baseline sample rows.
    expect(screen.getByText("MANAGER HUB")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Live API data only/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Jamie Cole/)).not.toBeInTheDocument();
  });

  it("shows per-task-group completion in the Task Groups sub-tab", async () => {
    const { container } = render(<ManagerHubWidget widgetApi={apiMock} contentLanguage="en_US" />);

    // With no token the baseline groups render, so the manager still sees the
    // shape of the view rather than an empty panel.
    await waitFor(() => {
      expect(container.querySelector("#taskGroupsList")!.textContent).toContain("Daily Pool Deck Opening");
    });
    const groups = container.querySelector("#taskGroupsList") as HTMLElement;
    expect(groups.querySelectorAll(".tg-row").length).toBeGreaterThan(1);
    // Completion is stated per group, not per person.
    expect(groups.textContent).toMatch(/\d+ of \d+ complete/);
    expect(container.querySelector("#taskGroupsMeta")!.textContent).toMatch(/group.*open.*past due/);
  });

  it("disables both reminder actions when no API token is configured", async () => {
    const { container } = render(<ManagerHubWidget widgetApi={apiMock} contentLanguage="en_US" />);

    await waitFor(() => {
      expect(container.querySelectorAll(".tg-remind").length).toBeGreaterThan(0);
    });
    // Reminders go out over the branch API, so without a token every entry
    // point must be inert rather than silently failing on click.
    container.querySelectorAll<HTMLButtonElement>(".tg-remind").forEach((b) => {
      expect(b.disabled).toBe(true);
    });
    expect(container.querySelector<HTMLButtonElement>("#sendGroupRemindersBtn")!.disabled).toBe(true);
  });

  it("reaches the Task Groups view through the Team Readiness sub-tabs", async () => {
    const { container } = render(<ManagerHubWidget widgetApi={apiMock} contentLanguage="en_US" />);
    await waitFor(() => {
      expect(container.querySelector('[data-subtab="groups"]')).toBeInTheDocument();
    });
    const btn = container.querySelector<HTMLButtonElement>('[data-subtab="groups"]')!;
    btn.click();
    expect(btn.classList.contains("active")).toBe(true);
    const view = container.querySelector('[data-subview="groups"]') as HTMLElement;
    expect(view.classList.contains("active")).toBe(true);
    // and the per-person view yields
    expect(container.querySelector('[data-subview="tasks"]')!.classList.contains("active")).toBe(false);
  });
});
