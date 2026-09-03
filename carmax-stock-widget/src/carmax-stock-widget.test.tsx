import React from "react"
import {render} from "@testing-library/react"

import {CarmaxStockWidget} from "./carmax-stock-widget";

describe("CarmaxStockWidget", () => {
    it("renders the ticker controls with the configured default ticker", () => {
        const {container} = render(<CarmaxStockWidget contentLanguage="en_US" ticker="KMX"/>);

        const input = container.querySelector<HTMLInputElement>("#csw-tickerInput");
        expect(input).not.toBeNull();
        expect(input?.value).toBe("KMX");
    })

    it("falls back to KMX when no ticker is configured", () => {
        const {container} = render(<CarmaxStockWidget contentLanguage="en_US"/>);

        const input = container.querySelector<HTMLInputElement>("#csw-tickerInput");
        expect(input?.placeholder).toBe("KMX");
    })
})
