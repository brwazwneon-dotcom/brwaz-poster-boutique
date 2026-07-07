// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PosterPerformanceStats } from "./PosterPerformanceStats";

afterEach(cleanup);

/**
 * End-to-end style test for the admin dashboard's per-poster performance UI.
 * Renders the same component wired into the "Lowest Performing" panel with a
 * zero-view poster (as produced by admin_dashboard for brand-new posters) and
 * asserts CTR, conversion rate, and average time viewed all display "—".
 */
describe("Admin dashboard — zero-view poster metrics", () => {
  it("shows — for CTR, conversion rate, and avg time on a zero-view poster", () => {
    render(
      <PosterPerformanceStats
        viewsCount={0}
        salesCount={0}
        cartAddsCount={0}
        totalViewSeconds={0}
      />,
    );

    const wrapper = screen.getByTestId("poster-performance-stats");
    expect(within(screen.getByTestId("poster-ctr")).getByText("—")).toBeTruthy();
    expect(within(screen.getByTestId("poster-conversion")).getByText("—")).toBeTruthy();
    expect(within(screen.getByTestId("poster-avg-time")).getByText("—")).toBeTruthy();

    // Guard: no NaN / Infinity leaked into the rendered UI.
    expect(wrapper.textContent ?? "").not.toMatch(/NaN|Infinity/);
  });

  it("still shows — when tracking counters are null/undefined (fresh poster)", () => {
    render(
      <PosterPerformanceStats
        viewsCount={null}
        salesCount={undefined}
        cartAddsCount={null}
        totalViewSeconds={undefined}
      />,
    );

    expect(within(screen.getByTestId("poster-ctr")).getByText("—")).toBeTruthy();
    expect(within(screen.getByTestId("poster-conversion")).getByText("—")).toBeTruthy();
    expect(within(screen.getByTestId("poster-avg-time")).getByText("—")).toBeTruthy();
  });

  it("renders real percentages and avg time once the poster has views", () => {
    render(
      <PosterPerformanceStats
        viewsCount={200}
        salesCount={10}
        cartAddsCount={25}
        totalViewSeconds={9000}
      />,
    );

    expect(within(screen.getByTestId("poster-conversion")).getByText("5.00%")).toBeTruthy();
    expect(within(screen.getByTestId("poster-ctr")).getByText("12.50%")).toBeTruthy();
    expect(within(screen.getByTestId("poster-avg-time")).getByText("45s")).toBeTruthy();
  });
});