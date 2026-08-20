import React from "react";
import { screen, render, waitFor } from "@testing-library/react";

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

  it("falls back to baseline entries when no API token is configured, without labeling them as demo data", async () => {
    render(<ManagerHubWidget widgetApi={apiMock} contentLanguage="en_US" />);

    await waitFor(() => {
      expect(screen.getAllByText(/Jamie Cole/).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText(/demo/i)).not.toBeInTheDocument();
  });
});
