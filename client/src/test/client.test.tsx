import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DonutChart } from "@/components/charts/Charts";
import { addDays, presetRange, startOfWeek } from "@/lib/dates";
import { compact, duration, engagement } from "@/lib/format";
import { CATEGORICAL_ORDER, ChartThemeProvider, DEFAULT_CHART_COLORS, SERIES_COLOR } from "@/theme/chartTheme";
import { THEME } from "@/theme/theme";
import { ThemeProvider } from "@/theme/themeProvider";

describe("central theme", () => {
  it("uses the specified HEX chart palette", () => {
    expect(DEFAULT_CHART_COLORS).toEqual({ primary: "#6366F1", secondary: "#06B6D4", success: "#22C55E", warning: "#F59E0B", danger: "#EF4444", purple: "#8B5CF6", pink: "#EC4899" });
    for (const v of Object.values(DEFAULT_CHART_COLORS)) expect(v).toMatch(/^#[0-9A-F]{6}$/);
  });
  it("reserves danger for errors and gives every metric a fixed color", () => {
    expect(CATEGORICAL_ORDER).not.toContain("danger");
    expect(Object.values(SERIES_COLOR)).not.toContain("danger");
  });
  it("uses the specified dark UI tokens", () => {
    expect(THEME.dark).toMatchObject({ background: "#0B1020", surface: "#111827", surfaceSecondary: "#1F2937", text: "#F9FAFB", mutedText: "#9CA3AF", border: "#374151" });
  });
});

describe("helpers", () => {
  it("computes date presets", () => {
    expect(presetRange("7d", "2026-09-28")).toEqual({ from: "2026-09-22", to: "2026-09-28" });
    expect(presetRange("month", "2026-09-28")).toEqual({ from: "2026-09-01", to: "2026-09-28" });
    expect(presetRange("year", "2026-09-28")).toEqual({ from: "2026-01-01", to: "2026-09-28" });
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(startOfWeek("2026-09-27")).toBe("2026-09-21");
  });
  it("formats numbers and durations", () => {
    expect(compact(1_500_000)).toBe("1.5M");
    expect(compact(null)).toBe("—");
    expect(duration(3723)).toBe("1:02:03");
    expect(duration(65)).toBe("1:05");
    expect(engagement({ viewCount: 1000, likeCount: 40, commentCount: 10 })).toBe(5);
  });
});

describe("DonutChart", () => {
  it("renders a legend with percentages and colors from the chart theme", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const qc = new QueryClient();
    render(
      <ThemeProvider>
        <QueryClientProvider client={qc}>
          <ChartThemeProvider>
            <DonutChart
              distribution={{
                dimension: "searchesByCreator",
                total: 4,
                slices: [
                  { key: "a", label: "Nova Labs", value: 3, percent: 75 },
                  { key: "__other", label: "Other", value: 1, percent: 25 },
                ],
              }}
            />
          </ChartThemeProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    );
    expect(screen.getByText("Nova Labs")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    const swatch = screen.getByText("Nova Labs").previousSibling as HTMLElement;
    expect(swatch.style.background).toBe("rgb(99, 102, 241)"); // #6366F1
  });
});
