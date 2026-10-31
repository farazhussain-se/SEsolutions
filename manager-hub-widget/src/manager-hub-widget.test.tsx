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

  describe("mobile carousel", () => {
    // jsdom reports no touch support, so the swipe wiring would bail out.
    // Declaring the property is what the feature check actually looks for.
    beforeEach(() => {
      (window as unknown as Record<string, unknown>).ontouchstart = null;
    });
    afterEach(() => {
      delete (window as unknown as Record<string, unknown>).ontouchstart;
    });

    /** A real drag: down, at least one move (which is what locks the axis and
     * starts carrying the view), then up. */
    const swipe = (el: Element, dx: number, dy = 0, opts: { target?: Element } = {}) => {
      const target = opts.target ?? el;
      const start = new Event("touchstart", { bubbles: true });
      Object.defineProperty(start, "touches", { value: [{ clientX: 200, clientY: 300 }] });
      Object.defineProperty(start, "target", { value: target });
      el.dispatchEvent(start);

      // two moves: the first locks the axis, the second carries it the rest
      [0.5, 1].forEach((f) => {
        const move = new Event("touchmove", { bubbles: true, cancelable: true });
        Object.defineProperty(move, "touches", { value: [{ clientX: 200 + dx * f, clientY: 300 + dy * f }] });
        Object.defineProperty(move, "target", { value: target });
        el.dispatchEvent(move);
      });

      const end = new Event("touchend", { bubbles: true });
      Object.defineProperty(end, "changedTouches", { value: [{ clientX: 200 + dx, clientY: 300 + dy }] });
      el.dispatchEvent(end);
    };

    const activeView = (c: HTMLElement) => c.querySelector(".view.active")?.id;

    it("swiping left and right moves through the top-level views", async () => {
      const { container } = render(<ManagerHubWidget widgetApi={apiMock} contentLanguage="en_US" />);
      const content = container.querySelector(".cw-content") as HTMLElement;
      expect(activeView(container)).toBe("view-action");

      swipe(content, -120);
      expect(activeView(container)).toBe("view-mytasks");
      expect(container.querySelector("#view-mytasks")!.classList.contains("from-right")).toBe(true);
      expect(container.querySelector('.cw-tab[data-tab="mytasks"]')!.classList.contains("active")).toBe(true);

      swipe(content, -120);
      expect(activeView(container)).toBe("view-progress");

      swipe(content, 120);
      expect(activeView(container)).toBe("view-mytasks");
      expect(container.querySelector("#view-mytasks")!.classList.contains("from-left")).toBe(true);
    });

    it("ignores gestures that are vertical, too short, or past the ends", async () => {
      const { container } = render(<ManagerHubWidget widgetApi={apiMock} contentLanguage="en_US" />);
      const content = container.querySelector(".cw-content") as HTMLElement;

      swipe(content, -30);            // too short
      expect(activeView(container)).toBe("view-action");
      swipe(content, -120, 400);      // mostly vertical: a page scroll
      expect(activeView(container)).toBe("view-action");
      swipe(content, 150);            // already at the first view, no wrap
      expect(activeView(container)).toBe("view-action");

      // a press with no travel at all is a tap, not a drag
      const down = new Event("touchstart", { bubbles: true });
      Object.defineProperty(down, "touches", { value: [{ clientX: 200, clientY: 300 }] });
      Object.defineProperty(down, "target", { value: content });
      content.dispatchEvent(down);
      const up = new Event("touchend", { bubbles: true });
      Object.defineProperty(up, "changedTouches", { value: [{ clientX: 200, clientY: 300 }] });
      content.dispatchEvent(up);
      expect(activeView(container)).toBe("view-action");
    });

    it("does not hijack a swipe that starts on the sub-tab strip", async () => {
      const { container } = render(<ManagerHubWidget widgetApi={apiMock} contentLanguage="en_US" />);
      const content = container.querySelector(".cw-content") as HTMLElement;
      const subtabs = container.querySelector(".cw-subtabs") as HTMLElement;
      swipe(content, -140, 0, { target: subtabs });
      expect(activeView(container)).toBe("view-action");
    });
  });

  describe("header identity", () => {
    it("shows the signed-in user's own profile, not a stand-in", async () => {
      const { container } = render(<ManagerHubWidget widgetApi={apiMock} contentLanguage="en_US" />);
      await waitFor(() => {
        expect((container.querySelector("#headerUser") as HTMLElement).hidden).toBe(false);
      });
      expect(container.querySelector("#headerUserName")!.textContent).toMatch(/Lucy Liu/);
    });

    it("hides the identity block when there is no signed-in user", async () => {
      const noUser = {
        ...apiMock,
        getUserInformation: () => Promise.reject(new Error("no host")),
      } as unknown as typeof apiMock;
      const { container } = render(<ManagerHubWidget widgetApi={noUser} contentLanguage="en_US" />);
      await waitFor(() => {
        expect((container.querySelector("#headerUser") as HTMLElement).hidden).toBe(true);
      });
      // and nothing invented is sitting in the markup waiting to be shown
      expect(container.querySelector("#headerUserName")!.textContent).toBe("");
      expect(container.querySelector("#headerUserRole")!.textContent).toBe("");
    });
  });
});
