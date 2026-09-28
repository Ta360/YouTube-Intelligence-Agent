import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HEX_COLOR_RE } from "../lib/sanitize.js";

/** Chart palette — the single server-side default (mirrors client/src/theme/chartTheme.ts). */
export const DEFAULT_CHART_COLORS = {
  primary: "#6366F1",
  secondary: "#06B6D4",
  success: "#22C55E",
  warning: "#F59E0B",
  danger: "#EF4444",
  purple: "#8B5CF6",
  pink: "#EC4899",
} as const;
export type ChartColors = Record<keyof typeof DEFAULT_CHART_COLORS, string>;

const hex = z.string().regex(HEX_COLOR_RE, "Colors must be 6-digit hex values like #6366F1");
export const chartColorsPatchSchema = z
  .object(Object.fromEntries(Object.keys(DEFAULT_CHART_COLORS).map((k) => [k, hex])) as Record<keyof ChartColors, typeof hex>)
  .partial()
  .strict();

function merge(stored: unknown): ChartColors {
  const out = { ...DEFAULT_CHART_COLORS } as ChartColors;
  if (stored && typeof stored === "object") {
    for (const k of Object.keys(DEFAULT_CHART_COLORS) as (keyof ChartColors)[]) {
      const v = (stored as Record<string, unknown>)[k];
      if (typeof v === "string" && HEX_COLOR_RE.test(v)) out[k] = v.toUpperCase();
    }
  }
  return out;
}

export async function getChartColors(userId: string): Promise<ChartColors> {
  const s = await prisma.userSettings.findUnique({ where: { userId } });
  return merge(s?.chartColors);
}

export async function updateChartColors(userId: string, patch: Partial<ChartColors>): Promise<ChartColors> {
  const next = merge({ ...(await getChartColors(userId)), ...patch });
  await prisma.userSettings.upsert({ where: { userId }, create: { userId, chartColors: next as Prisma.InputJsonValue }, update: { chartColors: next as Prisma.InputJsonValue } });
  return next;
}

export async function resetChartColors(userId: string): Promise<ChartColors> {
  await prisma.userSettings.deleteMany({ where: { userId } });
  return { ...DEFAULT_CHART_COLORS };
}
