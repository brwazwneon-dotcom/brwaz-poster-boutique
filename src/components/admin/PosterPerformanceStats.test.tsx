// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
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
    const { getByTestId } = render(
      <PosterPerformanceStats
        viewsCount={0}
        salesCount={0}
        cartAddsCount={0}
        totalViewSeconds={0}
      />,
    );

    const wrapper = getByTestId("poster-performance-stats");
    expect(getByTestId("poster-ctr").textContent).toContain("—");
    expect(getByTestId("poster-conversion").textContent).toContain("—");
    expect(getByTestId("poster-avg-time").textContent).toContain("—");

    // Guard: no NaN / Infinity leaked into the rendered UI.
    expect(wrapper.textContent ?? "").not.toMatch(/NaN|Infinity/);
  });

  it("still shows — when tracking counters are null/undefined (fresh poster)", () => {
    const { getByTestId } = render(
      <PosterPerformanceStats
        viewsCount={null}
        salesCount={undefined}
        cartAddsCount={null}
        totalViewSeconds={undefined}
      />,
    );

    expect(getByTestId("poster-ctr").textContent).toContain("—");
    expect(getByTestId("poster-conversion").textContent).toContain("—");
    expect(getByTestId("poster-avg-time").textContent).toContain("—");
  });

  it("renders real percentages and avg time once the poster has views", () => {
    const { getByTestId } = render(
      <PosterPerformanceStats
        viewsCount={200}
        salesCount={10}
        cartAddsCount={25}
        totalViewSeconds={9000}
      />,
    );

    expect(getByTestId("poster-conversion").textContent).toContain("5.00%");
    expect(getByTestId("poster-ctr").textContent).toContain("12.50%");
    expect(getByTestId("poster-avg-time").textContent).toContain("45s");
  });
});
