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
});
