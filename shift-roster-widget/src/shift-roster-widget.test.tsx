import React from "react";
import { screen, render } from "@testing-library/react";

import { ShiftRosterWidget } from "./shift-roster-widget";
import apiMock from "../dev/widget-api-mock";

describe("ShiftRosterWidget", () => {
  it("should render the widget with the current user's shifts", async () => {
    render(<ShiftRosterWidget contentLanguage="en_US" widgetApi={apiMock} />);

    expect(await screen.findByText(/Hi, Lucy/)).toBeInTheDocument();
    expect(screen.getByText("This Week's Shifts")).toBeInTheDocument();
    expect(screen.getByText("Request a Shift Change")).toBeInTheDocument();
  });
});
