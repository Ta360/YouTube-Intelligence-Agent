import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, Bot, ListVideo, Search, Users, Video } from "lucide-react";
import { Select } from "@/components/ui/primitives";
import { useRange } from "@/hooks/queries";
import { api } from "@/lib/api";
import { diffDays } from "@/lib/dates";
import type { Dimension, Granularity } from "@/lib/types";
import { useChartTheme } from "@/theme/chartTheme";
import { ActivityBarChart, ActivityLineChart, bucketLabel, ChartCard, DonutChart, GRANULARITIES, KPIStats, Segmented } from "./Charts";

export const DIMENSION_OPTIONS: { id: Dimension; label: string; center: string }[] = [
  { id: "searchesByCreator", label: "Searches by creator", center: "Searches" },
  { id: "videosByCreator", label: "Videos by creator", center: "Videos" },
  { id: "videosByContentType", label: "Videos by content type", center: "Videos" },
  { id: "searchCategories", label: "Search categories", center: "Searches" },
  { id: "savedVideos", label: "Saved videos", center: "Saved" },
  { id: "playlistsDiscovered", label: "Playlists discovered", center: "Playlists" },
];

export interface AnalyticsFilters {
  channel?: string;
  content?: "all" | "channels" | "videos" | "playlists";
}

const autoGranularity = (days: number): Granularity => (days > 400 ? "month" : days > 120 ? "week" : "day");

export function useKpis(filters: AnalyticsFilters = {}) {
  const r = useRange();
  return useQuery({ queryKey: ["analytics", "summary", r.from, r.to, filters], queryFn: () => api.summary({ from: r.from, to: r.to, ...filters }) });
}

export function KpiRow({ filters = {} }: { filters?: AnalyticsFilters }) {
  const t = useChartTheme();
  const { data, isLoading } = useKpis(filters);
  const c = data?.current;
  const p = data?.previous;
  return (
    <KPIStats
      loading={isLoading}
      items={[
        { label: "Total Searches", value: c?.totalSearches ?? 0, previous: p?.totalSearches, icon: <Search />, color: t.series("searches") },
        { label: "Creators Researched", value: c?.creatorsResearched ?? 0, previous: p?.creatorsResearched, icon: <Users />, color: t.series("creators") },
        { label: "Videos Found", value: c?.videosFound ?? 0, previous: p?.videosFound, icon: <Video />, color: t.series("videosFound") },
        { label: "Playlists Found", value: c?.playlistsFound ?? 0, previous: p?.playlistsFound, icon: <ListVideo />, color: t.series("playlistsFound") },
        { label: "Saved Videos", value: c?.savedVideos ?? 0, previous: p?.savedVideos, icon: <Bookmark />, color: t.series("savedVideos") },
        { label: "AI Research Sessions", value: c?.aiSessions ?? 0, previous: p?.aiSessions, icon: <Bot />, color: t.series("aiQueries") },
      ]}
    />
  );
}

export function AnalyticsCharts({ filters = {}, compact: small }: { filters?: AnalyticsFilters; compact?: boolean }) {
  const r = useRange();
  const days = diffDays(r.from, r.to) + 1;
  const [gran, setGran] = useState<Granularity | null>(null);
  const granularity = gran ?? autoGranularity(days);
  const [dimension, setDimension] = useState<Dimension>("searchesByCreator");

  const activity = useQuery({ queryKey: ["analytics", "activity", r.from, r.to, granularity, filters], queryFn: () => api.activity({ from: r.from, to: r.to, granularity, ...filters }) });
  const dist = useQuery({ queryKey: ["analytics", "distribution", r.from, r.to, dimension, filters], queryFn: () => api.distribution({ from: r.from, to: r.to, dimension, ...filters }) });

  const points = activity.data?.points ?? [];
  const empty = !points.some((p) => p.searches || p.videosFound || p.aiQueries);
  const dimOpt = DIMENSION_OPTIONS.find((d) => d.id === dimension)!;
  const table = {
    headers: ["Date", "Searches", "Videos Found", "Channels Found", "Playlists Found", "AI Queries"],
    rows: points.map((p) => [bucketLabel(p.bucket, granularity), p.searches, p.videosFound, p.channelsFound, p.playlistsFound, p.aiQueries]),
  };

  return (
    <div className="grid gap-4 xl:grid-cols-5">
      <ChartCard
        className="xl:col-span-3"
        title="Search activity"
        description={`Searches, videos and channels found · ${r.from} → ${r.to}`}
        loading={activity.isLoading}
        error={activity.error}
        onRetry={() => void activity.refetch()}
        empty={empty}
        table={table}
        actions={<Segmented label="Granularity" value={granularity} options={GRANULARITIES} onChange={setGran} />}
      >
        <ActivityBarChart points={points} granularity={granularity} />
      </ChartCard>

      <ChartCard
        className="xl:col-span-2"
        title="Content distribution"
        description={dimOpt.label}
        loading={dist.isLoading}
        error={dist.error}
        onRetry={() => void dist.refetch()}
        empty={!dist.data?.total}
        table={dist.data ? { headers: ["Item", "Count", "Share"], rows: dist.data.slices.map((s) => [s.label, s.value, `${s.percent}%`]) } : undefined}
        actions={
          <Select aria-label="Distribution" value={dimension} onChange={(e) => setDimension(e.target.value as Dimension)} className="w-48">
            {DIMENSION_OPTIONS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </Select>
        }
      >
        {dist.data && <DonutChart distribution={dist.data} centerLabel={dimOpt.center} />}
      </ChartCard>

      {!small && (
        <ChartCard
          className="xl:col-span-5"
          title="Search activity over time"
          description="Searches and AI agent queries — drag the handles below the chart to zoom"
          loading={activity.isLoading}
          error={activity.error}
          onRetry={() => void activity.refetch()}
          empty={empty}
          table={table}
        >
          <ActivityLineChart points={points} granularity={granularity} />
        </ChartCard>
      )}
    </div>
  );
}
