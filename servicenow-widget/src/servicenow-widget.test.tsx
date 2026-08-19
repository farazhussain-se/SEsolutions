import React from "react";
import { screen, render } from "@testing-library/react";

import { ServiceNowWidget } from "./servicenow-widget";
import apiMock from "../dev/widget-api-mock";

describe("ServiceNowWidget", () => {
  it("should render the ticket inbox and attribute new tickets to the current user", async () => {
    render(<ServiceNowWidget contentLanguage="en-US" widgetApi={apiMock} />);

    expect(screen.getByText("ServiceNow")).toBeInTheDocument();
    expect(screen.getAllByText("My Items").length).toBeGreaterThan(0);
    expect(await screen.findByText("Please remove the latest hotfix from my PC")).toBeInTheDocument();
  });
});
