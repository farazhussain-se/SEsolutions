import React from "react";
import { screen, render } from "@testing-library/react";

import { WorkdayWidget } from "./workday-widget";
import apiMock from "../dev/widget-api-mock";

describe("WorkdayWidget", () => {
  it("should render the widget with the current user's balances", async () => {
    render(<WorkdayWidget contentLanguage="en_US" widgetApi={apiMock} />);

    expect(await screen.findByText(/Hi, Lucy/)).toBeInTheDocument();
    expect(screen.getByText("My Absences")).toBeInTheDocument();
    expect(screen.getByText("Paid Time Off")).toBeInTheDocument();
    expect(screen.getByText("New Request")).toBeInTheDocument();
  });
});
