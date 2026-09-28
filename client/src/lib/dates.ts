/** Browser-side date helpers (day keys are YYYY-MM-DD in the user's timezone). */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export const todayKey = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export const diffDays = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export const startOfMonth = (key: string) => `${key.slice(0, 7)}-01`;
export function endOfMonth(key: string) {
  const [y, m] = key.split("-").map(Number) as [number, number];
  return `${key.slice(0, 7)}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}
export function addMonths(key: string, n: number) {
  const [y, m] = key.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}
/** Monday of the week containing `key`. */
export function startOfWeek(key: string) {
  const dow = new Date(`${key}T00:00:00Z`).getUTCDay();
  return addDays(key, -((dow + 6) % 7));
}

export type RangePreset = "today" | "7d" | "30d" | "90d" | "month" | "year" | "custom";
export const RANGE_PRESETS: { id: RangePreset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
  { id: "month", label: "This month" },
  { id: "year", label: "This year" },
  { id: "custom", label: "Custom" },
];

export function presetRange(p: RangePreset, today = todayKey()): { from: string; to: string } {
  switch (p) {
    case "today":
      return { from: today, to: today };
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "90d":
      return { from: addDays(today, -89), to: today };
    case "month":
      return { from: startOfMonth(today), to: today };
    case "year":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    default:
      return { from: addDays(today, -29), to: today };
  }
}

export const fmtDay = (key: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) =>
  new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });
