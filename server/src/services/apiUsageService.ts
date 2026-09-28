import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { dayKey } from "../lib/dates.js";

export type ApiProviderName = "youtube" | "web" | "openai";

/** Records an outbound API call. Never throws — usage tracking must not break a request. */
export async function recordApiUsage(provider: ApiProviderName, endpoint: string, units: number, ok: boolean, errorCode?: string) {
  try {
    await prisma.apiUsage.create({ data: { provider, endpoint, units, ok, errorCode: errorCode ?? null, day: dayKey(new Date()) } });
  } catch (err) {
    logger.warn("api_usage.record_failed", { error: String((err as Error)?.message ?? err) });
  }
}

export async function unitsUsedToday(provider: ApiProviderName = "youtube") {
  const r = await prisma.apiUsage.aggregate({ where: { provider, day: dayKey(new Date()) }, _sum: { units: true }, _count: true });
  return { units: r._sum.units ?? 0, calls: r._count };
}

export async function lastCall(provider: ApiProviderName) {
  return prisma.apiUsage.findFirst({ where: { provider }, orderBy: { createdAt: "desc" } });
}

export async function usageByDay(provider: ApiProviderName, days = 14) {
  const since = dayKey(new Date(Date.now() - days * 86_400_000));
  const rows = await prisma.apiUsage.groupBy({ by: ["day"], where: { provider, day: { gte: since } }, _sum: { units: true }, _count: true, orderBy: { day: "asc" } });
  return rows.map((r) => ({ day: r.day, units: r._sum.units ?? 0, calls: r._count }));
}
