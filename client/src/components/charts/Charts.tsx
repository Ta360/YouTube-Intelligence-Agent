import { useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart as RBarChart,
  Brush,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart as RLineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, Table2, BarChart3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/common/states";
import { fmtDay } from "@/lib/dates";
import { compact, full } from "@/lib/format";
import type { ActivityPoint, Distribution, Granularity } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useChartTheme } from "@/theme/chartTheme";

// ─── Shared frame ──────────────────────────────────────────────────────────
export function ChartCard({
  title,
  description,
  actions,
  loading,
  error,
  onRetry,
  empty,
  table,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  empty?: boolean;
  table?: { headers: string[]; rows: (string | number)[][] };
  children: ReactNode;
  className?: string;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {table && (
            <Button size="icon-sm" variant="ghost" onClick={() => setShowTable((s) => !s)} aria-label={showTable ? "Show chart" : "Show data table"} title={showTable ? "Chart" : "Table"}>
              {showTable ? <BarChart3 /> : <Table2 />}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : error ? (
          <ErrorState error={error} onRetry={onRetry} compact />
        ) : empty ? (
          <EmptyState title="No activity in this range" description="Search for a creator or topic, or widen the date range in the header." className="h-64 justify-center" />
        ) : showTable && table ? (
          <div className="max-h-72 overflow-auto rounded-lg border scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card-solid">
                <tr>
                  {table.headers.map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r, i) => (
                  <tr key={i} className="border-t">
                    {r.map((c, j) => (
                      <td key={j} className={cn("px-3 py-1.5", j > 0 && "tabular-nums")}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

function ChartTooltip({ active, payload, label, formatLabel }: Partial<TooltipContentProps<number, string>> & { formatLabel?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-card-solid px-3 py-2 text-xs shadow-xl">
      {label !== undefined && <p className="mb-1 font-semibold">{formatLabel ? formatLabel(String(label)) : String(label)}</p>}
      {payload.map((p) => (
        <p key={String(p.dataKey ?? p.name)} className="flex items-center gap-2">
          <span className="size-2.5 rounded-sm" style={{ background: (p.color as string) ?? (p.payload as { fill?: string })?.fill }} aria-hidden />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto pl-3 font-semibold tabular-nums">{full(Number(p.value))}</span>
        </p>
      ))}
    </div>
  );
}

export function bucketLabel(bucket: string, g: Granularity) {
  if (g === "year") return bucket;
  if (g === "month") return new Date(`${bucket}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  if (g === "week") return `Wk of ${fmtDay(bucket, { month: "short", day: "numeric" })}`;
  return fmtDay(bucket, { month: "short", day: "numeric" });
}

const SERIES_LABEL: Record<string, string> = { searches: "Searches", videosFound: "Videos Found", channelsFound: "Channels Found", playlistsFound: "Playlists Found", aiQueries: "AI Queries", creators: "Creators" };

// ─── Bar chart: activity by date ──────────────────────────────────────────────
export function ActivityBarChart({ points, granularity, series = ["searches", "videosFound", "channelsFound"] }: { points: ActivityPoint[]; granularity: Granularity; series?: (keyof ActivityPoint)[] }) {
  const t = useChartTheme();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const data = useMemo(() => points.map((p) => ({ ...p, label: bucketLabel(p.bucket, granularity) })), [points, granularity]);
  return (
    <div className="h-72 w-full" role="img" aria-label={`Bar chart of ${series.map((s) => SERIES_LABEL[s]).join(", ")} by ${granularity}`}>
      <ResponsiveContainer>
        <RBarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }} barGap={2} barCategoryGap="22%">
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis tickLine={false} axisLine={false} allowDecimals={false} tickFormatter={(v) => compact(v)} width={44} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: `${t.colors.primary}14` }} />
          <Legend iconType="circle" onClick={(e) => setHidden((h) => {
            const n = new Set(h);
            const k = String(e.dataKey);
            if (n.has(k)) n.delete(k);
            else n.add(k);
            return n;
          })} wrapperStyle={{ fontSize: 12, cursor: "pointer" }} />
          {series.map((s) => (
            <Bar key={s} dataKey={s} name={SERIES_LABEL[s]} fill={t.series(s)} radius={[4, 4, 0, 0]} maxBarSize={28} hide={hidden.has(s)} />
          ))}
        </RBarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Line chart: activity over time (with zoom) ──────────────────────────────
export function ActivityLineChart({ points, granularity, series = ["searches", "aiQueries"] }: { points: ActivityPoint[]; granularity: Granularity; series?: (keyof ActivityPoint)[] }) {
  const t = useChartTheme();
  const data = useMemo(() => points.map((p) => ({ ...p, label: bucketLabel(p.bucket, granularity) })), [points, granularity]);
  return (
    <div className="h-72 w-full" role="img" aria-label="Line chart of search activity over time">
      <ResponsiveContainer>
        <RLineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={20} />
          <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={40} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: t.axis, strokeDasharray: "3 3" }} />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
          {series.map((s) => (
            <Line key={s} type="monotone" dataKey={s} name={SERIES_LABEL[s]} stroke={t.series(s)} strokeWidth={2} dot={data.length <= 31 ? { r: 3, strokeWidth: 2, fill: t.surface } : false} activeDot={{ r: 5, stroke: t.surface, strokeWidth: 2 }} />
          ))}
          {data.length > 14 && <Brush dataKey="label" height={22} stroke={t.colors.primary} fill={t.surface} travellerWidth={8} tickFormatter={() => ""} />}
        </RLineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Donut chart: distributions ──────────────────────────────────────────────
export function DonutChart({ distribution, centerLabel = "Total" }: { distribution: Distribution; centerLabel?: string }) {
  const t = useChartTheme();
  const data = distribution.slices.map((s, i) => ({ ...s, fill: s.key === "__other" ? t.neutral : t.categorical(i) }));
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,15rem)_1fr]">
      <div className="relative mx-auto h-56 w-full max-w-60" role="img" aria-label={`Donut chart: ${data.map((d) => `${d.label} ${d.percent}%`).join(", ")}`}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="92%" paddingAngle={data.length > 1 ? 2 : 0} stroke={t.surface} strokeWidth={2} isAnimationActive>
              {data.map((d) => (
                <Cell key={d.key} fill={d.fill} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-2xl font-bold tabular-nums">{compact(distribution.total)}</p>
            <p className="text-xs text-muted-foreground">{centerLabel}</p>
          </div>
        </div>
      </div>
      <ul className="space-y-1.5 text-sm" aria-label="Legend">
        {data.map((d) => (
          <li key={d.key} className="flex items-center gap-2">
            <span className="size-3 shrink-0 rounded-sm" style={{ background: d.fill }} aria-hidden />
            <span className="min-w-0 flex-1 truncate" title={d.label}>
              {d.label}
            </span>
            <span className="tabular-nums text-muted-foreground">{full(d.value)}</span>
            <span className="w-12 text-right font-semibold tabular-nums">{d.percent}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Simple series chart for creator analytics ────────────────────────────────
export function SimpleBarChart({ data, xKey, yKey, name, color, xFormatter }: { data: Record<string, unknown>[]; xKey: string; yKey: string; name: string; color: string; xFormatter?: (v: string) => string }) {
  return (
    <div className="h-64 w-full" role="img" aria-label={`Bar chart of ${name}`}>
      <ResponsiveContainer>
        <RBarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickFormatter={xFormatter} minTickGap={12} />
          <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => compact(v)} width={48} />
          <Tooltip content={<ChartTooltip formatLabel={xFormatter} />} />
          <Bar dataKey={yKey} name={name} fill={color} radius={[4, 4, 0, 0]} maxBarSize={32} />
        </RBarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── KPI stat cards ────────────────────────────────────────────────────────────
export function KPIStats({ items, loading }: { items: { label: string; value: number; previous?: number; icon: ReactNode; color: string }[]; loading?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
      {items.map((k) => {
        const delta = k.previous !== undefined && k.previous > 0 ? ((k.value - k.previous) / k.previous) * 100 : null;
        return (
          <Card key={k.label} className="relative overflow-hidden p-4">
            <div className="absolute -right-6 -top-6 size-20 rounded-full opacity-15 blur-xl" style={{ background: k.color }} aria-hidden />
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">{k.label}</p>
              <span className="grid size-8 place-items-center rounded-lg [&_svg]:size-4" style={{ background: `${k.color}26`, color: k.color }} aria-hidden>
                {k.icon}
              </span>
            </div>
            {loading ? <Skeleton className="mt-2 h-8 w-20" /> : <p className="mt-1 text-2xl font-bold tabular-nums">{compact(k.value)}</p>}
            {!loading && k.previous !== undefined && (
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                {delta === null ? (
                  k.value > 0 ? "New this period" : "No change"
                ) : (
                  <>
                    {delta >= 0 ? <ArrowUpRight className="size-3.5 text-success" /> : <ArrowDownRight className="size-3.5 text-danger" />}
                    <span className={delta >= 0 ? "text-success" : "text-danger"}>{Math.abs(delta).toFixed(0)}%</span> vs previous
                  </>
                )}
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}

export const GRANULARITIES: { id: Granularity; label: string }[] = [
  { id: "day", label: "Daily" },
  { id: "week", label: "Weekly" },
  { id: "month", label: "Monthly" },
  { id: "year", label: "Yearly" },
];

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-muted/70 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn("cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors", value === o.id && "bg-card-solid text-foreground shadow-sm")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
