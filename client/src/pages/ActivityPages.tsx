import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { BarChart3, Bot, Bookmark, CalendarDays, ChevronLeft, ChevronRight, History, ListVideo, Play, Search, Users, Video } from "lucide-react";
import { AnalyticsCharts, KpiRow, type AnalyticsFilters } from "@/components/charts/AnalyticsDashboard";
import { Segmented } from "@/components/charts/Charts";
import { HistoryTable } from "@/components/common/HistoryTable";
import { EmptyState, ErrorState, LoadingGrid, PageHeader } from "@/components/common/states";
import { DateRangePicker } from "@/components/layout/TopHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, Input, Select, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { addDays, addMonths, endOfMonth, fmtDay, startOfMonth, startOfWeek, todayKey } from "@/lib/dates";
import { time } from "@/lib/format";
import type { CalendarDay } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/appStore";
import { useChartTheme } from "@/theme/chartTheme";

// ─── Search History ────────────────────────────────────────────────────────
export function HistoryPage() {
  const [f, setF] = useState({ q: "", type: "", status: "", source: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const q = useQuery({ queryKey: ["history", f, page], queryFn: () => api.history({ ...f, page, pageSize }), placeholderData: keepPreviousData });
  const set = (p: Partial<typeof f>) => (setF((x) => ({ ...x, ...p })), setPage(1));
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / pageSize)) : 1;
  return (
    <div className="space-y-5">
      <PageHeader icon={<History />} title="Search History" description="Every search — from the search bar, the search page and the AI agent — with its results and status." />
      <div className="glass grid grid-cols-2 gap-2 rounded-xl p-3 sm:grid-cols-3 lg:grid-cols-6">
        <Input value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search query or creator…" aria-label="Filter by query" className="col-span-2 sm:col-span-3 lg:col-span-2" />
        <Select aria-label="Search type" value={f.type} onChange={(e) => set({ type: e.target.value })}>
          <option value="">All types</option>
          {["PERSON", "CHANNEL", "CHANNEL_ID", "HANDLE", "VIDEO", "PLAYLIST", "TOPIC"].map((t) => (
            <option key={t} value={t}>
              {t.replace("_", " ").toLowerCase()}
            </option>
          ))}
        </Select>
        <Select aria-label="Status" value={f.status} onChange={(e) => set({ status: e.target.value })}>
          <option value="">All statuses</option>
          <option value="SUCCESS">Success</option>
          <option value="NO_RESULTS">No results</option>
          <option value="ERROR">Error</option>
          <option value="QUOTA_EXCEEDED">Quota exceeded</option>
        </Select>
        <Input type="date" aria-label="From date" value={f.from} max={f.to || todayKey()} onChange={(e) => set({ from: e.target.value })} />
        <Input type="date" aria-label="To date" value={f.to} min={f.from} max={todayKey()} onChange={(e) => set({ to: e.target.value })} />
      </div>
      {q.isLoading ? (
        <LoadingGrid count={3} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data?.items.length ? (
        <>
          <p className="text-xs text-muted-foreground">{q.data.total.toLocaleString()} searches</p>
          <HistoryTable rows={q.data.items} />
          {pages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                <ChevronLeft />
              </Button>
              <span className="text-sm tabular-nums text-muted-foreground">
                Page {page} / {pages}
              </span>
              <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                <ChevronRight />
              </Button>
            </div>
          )}
        </>
      ) : (
        <EmptyState icon={<Search />} title="No searches match" description="Your searches are recorded automatically." />
      )}
    </div>
  );
}

// ─── Analytics ──────────────────────────────────────────────────────────────
export function AnalyticsPage() {
  const [filters, setFilters] = useState<AnalyticsFilters>({ content: "all" });
  const creators = useQuery({ queryKey: ["analytics", "creators"], queryFn: api.searchedCreators });
  const range = useAppStore((s) => s.dateRange);
  return (
    <div className="space-y-5">
      <PageHeader
        icon={<BarChart3 />}
        title="Analytics"
        description={`${fmtDay(range.from)} – ${fmtDay(range.to)} · every chart follows the date range, creator and content filters`}
        actions={
          <>
            <DateRangePicker />
            <Select aria-label="Filter by creator" value={filters.channel ?? ""} onChange={(e) => setFilters((f) => ({ ...f, channel: e.target.value || undefined }))} className="w-48">
              <option value="">All creators</option>
              {creators.data?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </Select>
            <Select aria-label="Filter by content" value={filters.content ?? "all"} onChange={(e) => setFilters((f) => ({ ...f, content: e.target.value as AnalyticsFilters["content"] }))} className="w-40">
              <option value="all">All content</option>
              <option value="channels">Creator searches</option>
              <option value="videos">Video searches</option>
              <option value="playlists">Playlist searches</option>
            </Select>
          </>
        }
      />
      <KpiRow filters={filters} />
      <AnalyticsCharts filters={filters} />
    </div>
  );
}

// ─── Calendar ───────────────────────────────────────────────────────────────
type View = "day" | "week" | "month";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function DayCell({ day, stats, selected, outside, onClick, intensity }: { day: string; stats?: CalendarDay; selected: boolean; outside?: boolean; onClick: () => void; intensity: number }) {
  const t = useChartTheme();
  const today = day === todayKey();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`${fmtDay(day)}: ${stats?.searches ?? 0} searches`}
      className={cn("flex min-h-20 cursor-pointer flex-col gap-0.5 rounded-lg border p-1.5 text-left text-[11px] transition-colors hover:border-primary/60 sm:min-h-24 sm:p-2", outside && "opacity-40", selected && "ring-2 ring-primary")}
      style={{ background: stats?.searches ? `color-mix(in srgb, ${t.colors.primary} ${Math.round(8 + intensity * 30)}%, transparent)` : undefined }}
    >
      <span className={cn("text-xs font-semibold", today && "grid size-5 place-items-center rounded-full bg-primary text-white")}>{Number(day.slice(8))}</span>
      {stats && (stats.searches || stats.aiSessions || stats.plays) ? (
        <span className="hidden space-y-px text-muted-foreground sm:block">
          <span className="block">{stats.searches} searches</span>
          {stats.creators > 0 && <span className="block">{stats.creators} creators</span>}
          {stats.videos > 0 && <span className="block">{stats.videos} videos</span>}
          {stats.aiSessions > 0 && <span className="block">{stats.aiSessions} AI</span>}
        </span>
      ) : null}
      {stats?.searches ? <span className="font-semibold text-foreground sm:hidden">{stats.searches}</span> : null}
    </button>
  );
}

export function CalendarPage() {
  const navigate = useNavigate();
  const setRange = useAppStore((s) => s.setDateRange);
  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState(todayKey());
  const [selected, setSelected] = useState(todayKey());

  const { from, to, days } = useMemo(() => {
    if (view === "day") return { from: anchor, to: anchor, days: [anchor] };
    if (view === "week") {
      const s = startOfWeek(anchor);
      return { from: s, to: addDays(s, 6), days: Array.from({ length: 7 }, (_, i) => addDays(s, i)) };
    }
    const s = startOfWeek(startOfMonth(anchor));
    const e = addDays(startOfWeek(endOfMonth(anchor)), 6);
    const out: string[] = [];
    for (let d = s; d <= e; d = addDays(d, 1)) out.push(d);
    return { from: s, to: e, days: out };
  }, [view, anchor]);

  const cal = useQuery({ queryKey: ["calendar", from, to], queryFn: () => api.calendar(from, to), placeholderData: keepPreviousData });
  const byDay = new Map((cal.data?.days ?? []).map((d) => [d.day, d]));
  const max = Math.max(1, ...(cal.data?.days ?? []).map((d) => d.searches));
  const detail = useQuery({ queryKey: ["calendar", "day", selected], queryFn: () => api.calendarDay(selected) });

  const step = (dir: number) => setAnchor((a) => (view === "month" ? addMonths(a, dir) : addDays(a, dir * (view === "week" ? 7 : 1))));
  const title = view === "month" ? new Date(`${anchor}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) : view === "week" ? `${fmtDay(from, { month: "short", day: "numeric" })} – ${fmtDay(to)}` : fmtDay(anchor, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const visibleFrom = view === "month" ? startOfMonth(anchor) : from;
  const visibleTo = view === "month" ? endOfMonth(anchor) : to;
  const c = detail.data?.counters;

  return (
    <div className="space-y-5">
      <PageHeader icon={<CalendarDays />} title="Calendar" description="Date-wise intelligence activity. Click a date to see that day's complete search history." />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => (setAnchor(todayKey()), setSelected(todayKey()))}>
          Today
        </Button>
        <Button variant="outline" size="icon-sm" onClick={() => step(-1)} aria-label="Previous">
          <ChevronLeft />
        </Button>
        <Button variant="outline" size="icon-sm" onClick={() => step(1)} aria-label="Next">
          <ChevronRight />
        </Button>
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</h2>
        <Segmented label="Calendar view" value={view} onChange={(v) => (setView(v), v === "day" && setAnchor(selected))} options={[{ id: "day", label: "Day" }, { id: "week", label: "Week" }, { id: "month", label: "Month" }]} />
        <Button size="sm" variant="secondary" onClick={() => (setRange("custom", { from: visibleFrom, to: visibleTo > todayKey() ? todayKey() : visibleTo }), navigate("/analytics"))}>
          <BarChart3 /> Analyze this {view}
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="p-3">
          {cal.error ? (
            <ErrorState error={cal.error} onRetry={() => void cal.refetch()} />
          ) : view === "day" ? (
            <DayCell day={anchor} stats={byDay.get(anchor)} selected intensity={1} onClick={() => setSelected(anchor)} />
          ) : (
            <>
              <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
                {WEEKDAYS.map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {days.map((d) => (
                  <DayCell key={d} day={d} stats={byDay.get(d)} selected={d === selected} outside={view === "month" && d.slice(0, 7) !== anchor.slice(0, 7)} intensity={(byDay.get(d)?.searches ?? 0) / max} onClick={() => setSelected(d)} />
                ))}
              </div>
            </>
          )}
          {cal.data && (
            <p className="mt-3 text-xs text-muted-foreground">
              {cal.data.activeDays} active days · {cal.data.totals.searches} searches · {cal.data.totals.videos.toLocaleString()} videos · {cal.data.totals.aiSessions} AI sessions in view
            </p>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{fmtDay(selected, { month: "long", day: "numeric", year: "numeric" })}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {detail.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : detail.error ? (
              <ErrorState error={detail.error} compact />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {[
                    { l: "Searches", v: c?.searches, i: <Search /> },
                    { l: "Creators", v: c?.creators, i: <Users /> },
                    { l: "Videos", v: c?.videos, i: <Video /> },
                    { l: "Playlists", v: c?.playlists, i: <ListVideo /> },
                    { l: "Saved videos", v: c?.savedVideos, i: <Bookmark /> },
                    { l: "AI Research Sessions", v: c?.aiSessions, i: <Bot /> },
                    { l: "Videos played", v: c?.plays, i: <Play /> },
                  ].map((s) => (
                    <div key={s.l} className="flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-2 [&_svg]:size-4 [&_svg]:text-muted-foreground">
                      {s.i}
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{s.l}</span>
                      <span className="font-semibold tabular-nums">{(s.v ?? 0).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="mb-1.5 text-sm font-semibold">Search history</p>
                  {detail.data?.searches.length ? (
                    <ul className="max-h-80 space-y-1 overflow-y-auto scrollbar-thin">
                      {detail.data.searches.map((s) => (
                        <li key={s.id}>
                          <button type="button" onClick={() => navigate(s.channelYoutubeId ? `/channels/${s.channelYoutubeId}` : `/search?q=${encodeURIComponent(s.query)}&src=history`)} className="flex w-full cursor-pointer items-center gap-2 rounded-lg p-1.5 text-left text-sm hover:bg-accent">
                            <span className="w-16 shrink-0 text-xs text-muted-foreground">{time(s.createdAt)}</span>
                            <span className="min-w-0 flex-1 truncate">{s.query}</span>
                            <span className="text-xs text-muted-foreground">{s.resultCount}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No searches on this day.</p>
                  )}
                </div>
                {detail.data?.aiSessions.length ? (
                  <div>
                    <p className="mb-1.5 text-sm font-semibold">AI research sessions</p>
                    <ul className="space-y-1 text-sm">
                      {detail.data.aiSessions.map((s) => (
                        <li key={s.id} className="flex gap-2 rounded-lg p-1.5">
                          <Bot className="size-4 shrink-0 text-primary" />
                          <span className="min-w-0 flex-1 truncate">{s.title}</span>
                          <span className="text-xs text-muted-foreground">{time(s.createdAt)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>
      {!cal.isLoading && cal.data && cal.data.activeDays === 0 && <EmptyState icon={<CalendarDays />} title="No activity in this period" description="Searches, saves, plays and AI sessions are tracked here automatically." />}
    </div>
  );
}
