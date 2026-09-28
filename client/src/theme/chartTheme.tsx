/**
 * Centralized chart color configuration. Every chart reads its colors from here — no chart
 * hard-codes its own palette. Values can be changed per user in Settings (persisted server-side)
 * and apply instantly.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useTheme } from "./themeProvider";

export const PRIMARY = "#6366F1";
export const SECONDARY = "#06B6D4";
export const SUCCESS = "#22C55E";
export const WARNING = "#F59E0B";
export const DANGER = "#EF4444";
export const PURPLE = "#8B5CF6";
export const PINK = "#EC4899";

export const DEFAULT_CHART_COLORS = { primary: PRIMARY, secondary: SECONDARY, success: SUCCESS, warning: WARNING, danger: DANGER, purple: PURPLE, pink: PINK };
export type ChartColors = typeof DEFAULT_CHART_COLORS;
export type ChartColorKey = keyof ChartColors;

export const CHART_COLOR_LABELS: Record<ChartColorKey, string> = {
  primary: "Primary",
  secondary: "Secondary",
  success: "Success",
  warning: "Warning",
  danger: "Danger",
  purple: "Purple",
  pink: "Pink",
};

/**
 * Fixed categorical order (never cycled; distributions fold into "Other" after 6).
 * Validated for colorblind separation on the dark surface. Danger is reserved for errors.
 */
export const CATEGORICAL_ORDER: ChartColorKey[] = ["primary", "secondary", "warning", "pink", "success", "purple"];

/** Each metric always wears the same color, on every chart. */
export const SERIES_COLOR: Record<string, ChartColorKey> = {
  searches: "primary",
  videosFound: "secondary",
  channelsFound: "warning",
  creators: "warning",
  playlistsFound: "pink",
  aiQueries: "purple",
  uploads: "primary",
  views: "secondary",
  savedVideos: "success",
};

export const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

interface Ctx {
  colors: ChartColors;
  raw: ChartColors;
  setColor: (key: ChartColorKey, hex: string) => void;
  reset: () => Promise<void>;
  saving: boolean;
  series: (metric: string) => string;
  categorical: (i: number) => string;
  /** Neutral ink for "Other", grid and axes, taken from the UI theme. */
  neutral: string;
  grid: string;
  axis: string;
  surface: string;
}
const ChartThemeContext = createContext<Ctx | null>(null);

export function ChartThemeProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { tokens } = useTheme();
  const { data } = useQuery({ queryKey: ["chartColors"], queryFn: api.chartColors, staleTime: Infinity });
  const [local, setLocal] = useState<ChartColors>(DEFAULT_CHART_COLORS);
  const [saving, setSaving] = useState(false);
  const pending = useRef<Partial<ChartColors>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (data?.colors) setLocal(data.colors);
  }, [data]);

  const setColor = useCallback(
    (key: ChartColorKey, hex: string) => {
      setLocal((c) => ({ ...c, [key]: hex }));
      if (!HEX_RE.test(hex)) return;
      pending.current[key] = hex.toUpperCase();
      clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const patch = pending.current;
        pending.current = {};
        setSaving(true);
        try {
          const r = await api.updateChartColors(patch);
          qc.setQueryData(["chartColors"], (old: { defaults: ChartColors } | undefined) => ({ defaults: old?.defaults ?? DEFAULT_CHART_COLORS, colors: r.colors }));
        } finally {
          setSaving(false);
        }
      }, 400);
    },
    [qc],
  );

  const reset = useCallback(async () => {
    const r = await api.resetChartColors();
    setLocal(r.colors);
    qc.setQueryData(["chartColors"], { colors: r.colors, defaults: DEFAULT_CHART_COLORS });
  }, [qc]);

  const value = useMemo<Ctx>(() => {
    // Charts never receive an invalid color mid-typing: fall back per key.
    const colors = Object.fromEntries(
      (Object.keys(DEFAULT_CHART_COLORS) as ChartColorKey[]).map((k) => [k, HEX_RE.test(local[k]) ? local[k] : (data?.colors?.[k] ?? DEFAULT_CHART_COLORS[k])]),
    ) as ChartColors;
    return {
      colors,
      raw: local,
      setColor,
      reset,
      saving,
      series: (metric) => colors[SERIES_COLOR[metric] ?? "primary"],
      categorical: (i) => colors[CATEGORICAL_ORDER[i % CATEGORICAL_ORDER.length]!],
      neutral: tokens.mutedText,
      grid: tokens.border,
      axis: tokens.mutedText,
      surface: tokens.surface,
    };
  }, [local, data, setColor, reset, saving, tokens]);

  return <ChartThemeContext.Provider value={value}>{children}</ChartThemeContext.Provider>;
}

export function useChartTheme() {
  const ctx = useContext(ChartThemeContext);
  if (!ctx) throw new Error("useChartTheme must be used inside ChartThemeProvider");
  return ctx;
}
