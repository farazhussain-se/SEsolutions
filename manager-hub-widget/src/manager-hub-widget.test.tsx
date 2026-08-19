import React from "react";
import { screen, render, waitFor } from "@testing-library/react";

import { ManagerHubWidget } from "./manager-hub-widget";
import apiMock from "../dev/widget-api-mock";

describe("ManagerHubWidget", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockRejectedValue(new Error("no backend in tests"));
  });

  it("renders the dashboard shell and pulls the signed-in user via widgetApi", async () => {
    render(<ManagerHubWidget widgetApi={apiMock} contentLanguage="en_US" />);

    expect(screen.getByText("MANAGER HUB")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByText(/Lucy Liu/).length).toBeGreaterThan(0);
    });
  });

  it("falls back to demo data when the backend is unreachable", async () => {
    render(<ManagerHubWidget widgetApi={apiMock} contentLanguage="en_US" />);

    await waitFor(() => {
      expect(screen.getAllByText("Demo Data").length).toBeGreaterThan(0);
    });
  });
});
