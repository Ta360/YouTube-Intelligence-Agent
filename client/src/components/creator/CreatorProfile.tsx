import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { BadgeCheck, BarChart3, Bookmark, BookmarkCheck, Bot, CalendarDays, ChevronLeft, ChevronRight, CloudDownload, ExternalLink, FlaskConical, Globe, History, Info, LayoutGrid, ListVideo, Loader2, MapPin, RefreshCw, Search, Sparkles, Users, Video, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, CardTitle, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { ChartCard, DonutChart, SimpleBarChart } from "@/components/charts/Charts";
import { DEFAULT_VIDEO_FILTERS, VideoFilterBar } from "@/components/common/FilterPanel";
import { DemoBadge, EmptyState, ErrorState, LoadingGrid } from "@/components/common/states";
import { toast } from "@/components/common/toast";
import { HistoryTable } from "@/components/common/HistoryTable";
import { Avatar, ChannelCard, PlaylistGrid } from "@/components/video/Cards";
import { VideoGrid } from "@/components/video/VideoCard";
import { useAskAgent } from "@/components/agent/AIAgentPanel";
import { useAddToResearch, useIsSaved, useToggleSave } from "@/hooks/queries";
import { api } from "@/lib/api";
import { compact, dateShort, full, pct } from "@/lib/format";
import type { Channel, Playlist, VideoFilters } from "@/lib/types";
import { useChartTheme } from "@/theme/chartTheme";

export function CreatorHeader({ channel, candidates }: { channel: Channel; candidates?: Channel[] }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const saved = useIsSaved("channel", channel.id);
  const toggle = useToggleSave("channel");
  const add = useAddToResearch();
  const send = useAskAgent();
  const refresh = useMutation({
    mutationFn: () => api.channel(channel.id, true),
    onSuccess: (c) => {
      qc.setQueryData(["channel", channel.id], c);
      toast.success("Channel refreshed from YouTube");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const stats = [
    { label: "Subscribers", value: channel.hiddenSubscriberCount ? "Hidden" : compact(channel.subscriberCount), icon: <Users /> },
    { label: "Videos", value: compact(channel.videoCount), icon: <Video /> },
    { label: "Total views", value: compact(channel.viewCount), icon: <BarChart3 /> },
    { label: "Created", value: dateShort(channel.publishedAt), icon: <CalendarDays /> },
  ];

  return (
    <Card className="overflow-hidden">
      {channel.bannerUrl ? (
        <div className="h-24 bg-cover bg-center sm:h-32" style={{ backgroundImage: `url("${channel.bannerUrl.replace(/"/g, "")}=w1400")` }} aria-hidden />
      ) : (
        <div className="h-16 brand-gradient opacity-60 sm:h-20" aria-hidden />
      )}
      <div className="space-y-4 p-4 sm:p-5">
        <div className="-mt-12 flex flex-wrap items-end gap-4 sm:-mt-14">
          <Avatar src={channel.thumbnailUrl} name={channel.title} className="size-20 border-4 border-card-solid sm:size-24" />
          <div className="min-w-0 flex-1 pb-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">Creator intelligence</p>
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold sm:text-2xl">
              <span className="min-w-0 break-words">{channel.title}</span>
              <DemoBadge dataSource={channel.dataSource} />
            </h1>
            <p className="text-sm text-muted-foreground">{channel.handle ?? channel.customUrl ?? "No public handle"}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button variant={saved ? "secondary" : "outline"} size="sm" onClick={() => toggle.mutate({ id: channel.id, saved })}>
              {saved ? <BookmarkCheck className="text-primary" /> : <Bookmark />} {saved ? "Saved" : "Save creator"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => add.mutate({ kind: "CHANNEL", youtubeId: channel.id })}>
              <FlaskConical /> Add to research
            </Button>
            <Button variant="gradient" size="sm" onClick={() => send(`Research ${channel.title}: latest videos and playlists`)}>
              <Bot /> Ask AI
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => refresh.mutate()} disabled={refresh.isPending} aria-label="Refresh from YouTube" title="Refresh from YouTube">
              {refresh.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl bg-muted/50 p-3">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-3.5">
                {s.icon} {s.label}
              </p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">{s.value}</p>
            </div>
          ))}
        </div>

        <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-muted-foreground">Channel ID</dt>
            <dd className="min-w-0 break-all font-mono text-xs leading-5">{channel.id}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-muted-foreground">Channel URL</dt>
            <dd className="min-w-0 truncate">
              <a href={channel.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                {channel.url.replace("https://www.", "")} <ExternalLink className="size-3" />
              </a>
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-muted-foreground">Verification</dt>
            <dd className="inline-flex items-center gap-1 text-muted-foreground" title="The YouTube Data API does not expose the verification badge.">
              <BadgeCheck className="size-3.5" /> Not available via API
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-muted-foreground">Country</dt>
            <dd className="inline-flex items-center gap-1">
              <MapPin className="size-3.5 text-muted-foreground" /> {channel.country ?? "—"}
            </dd>
          </div>
        </dl>

        {channel.topicCategories.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {channel.topicCategories.map((t) => (
              <Badge key={t} variant="secondary">
                {t}
              </Badge>
            ))}
          </div>
        )}
        {candidates && candidates.length > 0 && (
          <div className="rounded-xl border border-dashed p-3 text-sm">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Not the right channel? Other channels matched this search:</p>
            <div className="flex flex-wrap gap-2">
              {candidates.slice(0, 6).map((c) => (
                <button key={c.id} type="button" onClick={() => navigate(`/channels/${c.id}`)} className="flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 hover:bg-accent">
                  <Avatar src={c.thumbnailUrl} name={c.title} className="size-6" />
                  <span className="max-w-40 truncate">{c.title}</span>
                  <span className="text-xs text-muted-foreground">{compact(c.subscriberCount)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/** Videos that belong to this channel only — filterable, sortable, paginated. */
export function ChannelVideos({ channelId, fixedContent, initial }: { channelId: string; fixedContent?: VideoFilters["content"]; initial?: Partial<VideoFilters> }) {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<VideoFilters>({ ...DEFAULT_VIDEO_FILTERS, ...(fixedContent ? { content: fixedContent } : {}), ...initial });
  const [page, setPage] = useState(1);
  const pageSize = 24;
  const q = useQuery({
    queryKey: ["channelVideos", channelId, filters, page],
    queryFn: () => api.channelVideos(channelId, { ...filters, page, pageSize }),
    placeholderData: keepPreviousData,
  });
  const more = useMutation({
    mutationFn: () => api.loadMoreUploads(channelId),
    onSuccess: (r) => {
      toast.success(r.added ? `Loaded ${r.added} more videos from YouTube` : "All public uploads are loaded");
      void qc.invalidateQueries({ queryKey: ["channelVideos", channelId] });
      void qc.invalidateQueries({ queryKey: ["creatorAnalytics", channelId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const totalPages = q.data ? Math.max(1, Math.ceil(q.data.total / pageSize)) : 1;

  return (
    <div className="space-y-4">
      <VideoFilterBar
        filters={filters}
        showContent={!fixedContent}
        onChange={(f) => {
          setFilters(f);
          setPage(1);
        }}
      />
      {q.data && (
        <p className="text-xs text-muted-foreground">
          {full(q.data.total)} matching · {full(q.data.loaded)} of {full(q.data.channelVideoCount)} channel videos loaded
          {q.data.canLoadMore ? " — sorting and filters apply to loaded videos; load more to include older uploads." : " — all public uploads loaded."}
        </p>
      )}
      {q.isLoading ? (
        <LoadingGrid />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data?.items.length ? (
        <EmptyState icon={<Video />} title={fixedContent === "short" ? "No Shorts among the loaded videos" : "No videos match these filters"} description="Try clearing filters or loading more uploads." />
      ) : (
        <VideoGrid videos={q.data.items} className={q.isFetching ? "opacity-70" : undefined} />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
            <ChevronLeft />
          </Button>
          <span className="text-sm tabular-nums text-muted-foreground">
            Page {page} / {totalPages}
          </span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
            <ChevronRight />
          </Button>
        </div>
        {q.data?.canLoadMore && (
          <Button variant="secondary" onClick={() => more.mutate()} disabled={more.isPending}>
            {more.isPending ? <Loader2 className="animate-spin" /> : <CloudDownload />} Load more from YouTube
          </Button>
        )}
      </div>
    </div>
  );
}

export function ChannelPlaylists({ channelId }: { channelId: string }) {
  const [pages, setPages] = useState<string[]>([""]);
  const results = useQuery({
    queryKey: ["channelPlaylists", channelId, pages],
    queryFn: async () => {
      const all: Playlist[] = [];
      let next: string | null = null;
      let total: number | null = null;
      for (const token of pages) {
        const r = await api.channelPlaylists(channelId, token || undefined);
        all.push(...r.items);
        next = r.nextPageToken;
        total = r.total;
      }
      return { items: all, next, total };
    },
    placeholderData: keepPreviousData,
  });
  if (results.isLoading) return <LoadingGrid count={4} />;
  if (results.error) return <ErrorState error={results.error} onRetry={() => void results.refetch()} />;
  if (!results.data?.items.length) return <EmptyState icon={<ListVideo />} title="No public playlists" description="This channel hasn't published any playlists." />;
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Showing {results.data.items.length}
        {results.data.total ? ` of ${results.data.total}` : ""} playlists
      </p>
      <PlaylistGrid playlists={results.data.items} />
      {results.data.next && (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => setPages((p) => [...p, results.data!.next!])} disabled={results.isFetching}>
            {results.isFetching ? <Loader2 className="animate-spin" /> : null} Load more
          </Button>
        </div>
      )}
    </div>
  );
}

function CreatorAnalyticsTab({ channelId }: { channelId: string }) {
  const t = useChartTheme();
  const q = useQuery({ queryKey: ["creatorAnalytics", channelId], queryFn: () => api.creatorAnalytics(channelId) });
  if (q.isLoading) return <LoadingGrid count={3} />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const a = q.data;
  const monthFmt = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { l: "Videos analysed", v: full(a.stats.count) },
          { l: "Average views", v: compact(a.stats.avgViews) },
          { l: "Avg engagement", v: pct(a.stats.avgEngagement, 2) },
          { l: "Your searches", v: full(a.yourSearches) },
        ].map((s) => (
          <Card key={s.l} className="p-4">
            <p className="text-xs text-muted-foreground">{s.l}</p>
            <p className="text-xl font-bold tabular-nums">{s.v}</p>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Based on the {a.stats.count} loaded videos (public statistics from the YouTube Data API). Load more uploads on the Videos tab to extend the history.</p>
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Uploads per month" table={{ headers: ["Month", "Uploads", "Views"], rows: a.uploadsByMonth.map((m) => [m.month, m.uploads, m.views]) }} empty={!a.uploadsByMonth.length}>
          <SimpleBarChart data={a.uploadsByMonth} xKey="month" yKey="uploads" name="Uploads" color={t.series("uploads")} xFormatter={monthFmt} />
        </ChartCard>
        <ChartCard title="Views of videos published each month" table={{ headers: ["Month", "Views"], rows: a.uploadsByMonth.map((m) => [m.month, m.views]) }} empty={!a.uploadsByMonth.length}>
          <SimpleBarChart data={a.uploadsByMonth} xKey="month" yKey="views" name="Views" color={t.series("views")} xFormatter={monthFmt} />
        </ChartCard>
        <ChartCard title="Content types" empty={!a.contentTypes.length}>
          <DonutChart distribution={{ dimension: "videosByContentType", total: a.stats.count, slices: a.contentTypes.map((c) => ({ key: c.type, label: c.label, value: c.count, percent: a.stats.count ? Math.round((c.count / a.stats.count) * 1000) / 10 : 0 })) }} centerLabel="Videos" />
        </ChartCard>
        <Card>
          <CardHeader>
            <CardTitle>Top videos by views</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-1.5 text-sm">
              {a.topVideos.map((v, i) => (
                <li key={v.id} className="flex items-center gap-2">
                  <span className="w-5 text-right text-xs text-muted-foreground">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{v.title}</span>
                  <span className="tabular-nums text-muted-foreground">{compact(v.viewCount)}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function RelatedContent({ channel }: { channel: Channel }) {
  const [enabled, setEnabled] = useState<{ channels?: boolean; playlists?: boolean; web?: boolean }>({});
  const channels = useQuery({ queryKey: ["channelSearch", channel.title], queryFn: () => api.channelSearch(channel.title), enabled: Boolean(enabled.channels) });
  const playlists = useQuery({ queryKey: ["playlistSearch", channel.title], queryFn: () => api.playlistSearch(channel.title), enabled: Boolean(enabled.playlists) });
  const web = useQuery({ queryKey: ["web", channel.title], queryFn: () => api.webSearch(`${channel.title} YouTube`), enabled: Boolean(enabled.web), retry: false });
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Each search below uses YouTube API quota (100 units) or your web search provider, so they run only when you ask.</p>
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold">Similar &amp; related channels</h3>
          {!enabled.channels && (
            <Button size="sm" variant="outline" onClick={() => setEnabled((e) => ({ ...e, channels: true }))}>
              <Search /> Find channels
            </Button>
          )}
        </div>
        {channels.isLoading && <LoadingGrid count={3} />}
        {channels.error && <ErrorState error={channels.error} compact />}
        {channels.data && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {channels.data.items.filter((c) => c.id !== channel.id).map((c) => (
              <ChannelCard key={c.id} channel={c} />
            ))}
          </div>
        )}
      </section>
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold">Playlists featuring {channel.title}</h3>
          {!enabled.playlists && (
            <Button size="sm" variant="outline" onClick={() => setEnabled((e) => ({ ...e, playlists: true }))}>
              <ListVideo /> Find playlists
            </Button>
          )}
        </div>
        {playlists.isLoading && <LoadingGrid count={4} />}
        {playlists.error && <ErrorState error={playlists.error} compact />}
        {playlists.data && <PlaylistGrid playlists={playlists.data.items.map((p) => ({ ...p, source: "Playlist" as const }))} />}
      </section>
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold">On the web</h3>
          {!enabled.web && (
            <Button size="sm" variant="outline" onClick={() => setEnabled((e) => ({ ...e, web: true }))}>
              <Globe /> Search the web
            </Button>
          )}
        </div>
        {web.isLoading && <LoadingGrid count={2} />}
        {web.error && <ErrorState error={web.error} compact />}
        {web.data && (
          <div className="space-y-2">
            <p className="text-xs text-warning">Third-party web results — not verified.</p>
            {web.data.items.map((w) => (
              <a key={w.url} href={w.url} target="_blank" rel="noopener noreferrer nofollow" className="block rounded-xl border p-3 hover:bg-accent">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Badge variant="info">Web Search</Badge> <span className="truncate">{w.title}</span> <ExternalLink className="size-3 shrink-0" />
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {w.domain} — {w.snippet}
                </p>
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Overview({ channel, onTab }: { channel: Channel; onTab: (t: string) => void }) {
  const latest = useQuery({ queryKey: ["channelVideos", channel.id, { ...DEFAULT_VIDEO_FILTERS }, 1, "overview"], queryFn: () => api.channelVideos(channel.id, { ...DEFAULT_VIDEO_FILTERS, page: 1, pageSize: 8 }) });
  const popular = useQuery({ queryKey: ["channelVideos", channel.id, { ...DEFAULT_VIDEO_FILTERS, sort: "views" }, 1, "overview"], queryFn: () => api.channelVideos(channel.id, { ...DEFAULT_VIDEO_FILTERS, sort: "views", page: 1, pageSize: 4 }), enabled: latest.isSuccess });
  return (
    <div className="space-y-6">
      {channel.description && (
        <Card className="p-4">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
            <Info className="size-4" /> About
          </p>
          <p className="whitespace-pre-line break-words text-sm text-muted-foreground">{channel.description}</p>
          {channel.keywords && <p className="mt-2 text-xs text-muted-foreground">Keywords: {channel.keywords.slice(0, 300)}</p>}
        </Card>
      )}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold">
            <Sparkles className="size-4 text-primary" /> Latest videos
          </h3>
          <Button size="sm" variant="ghost" onClick={() => onTab("videos")}>
            All videos <ChevronRight />
          </Button>
        </div>
        {latest.isLoading ? <LoadingGrid count={4} /> : latest.error ? <ErrorState error={latest.error} onRetry={() => void latest.refetch()} /> : <VideoGrid videos={latest.data?.items ?? []} />}
      </section>
      {popular.data?.items.length ? (
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 font-semibold">
            <Zap className="size-4 text-warning" /> Most viewed (loaded videos)
          </h3>
          <VideoGrid videos={popular.data.items} />
        </section>
      ) : null}
    </div>
  );
}

export function CreatorProfile({ channel, candidates, initialTab = "overview" }: { channel: Channel; candidates?: Channel[]; initialTab?: string }) {
  const [tab, setTab] = useState(initialTab);
  return (
    <div className="space-y-4">
      <CreatorHeader channel={channel} candidates={candidates} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Creator sections">
          <TabsTrigger value="overview">
            <LayoutGrid /> Overview
          </TabsTrigger>
          <TabsTrigger value="videos">
            <Video /> Videos
          </TabsTrigger>
          <TabsTrigger value="shorts">
            <Zap /> Shorts
          </TabsTrigger>
          <TabsTrigger value="playlists">
            <ListVideo /> Playlists
          </TabsTrigger>
          <TabsTrigger value="analytics">
            <BarChart3 /> Analytics
          </TabsTrigger>
          <TabsTrigger value="history">
            <History /> Search History
          </TabsTrigger>
          <TabsTrigger value="related">
            <Globe /> Related Content
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <Overview channel={channel} onTab={setTab} />
        </TabsContent>
        <TabsContent value="videos">
          <ChannelVideos channelId={channel.id} />
        </TabsContent>
        <TabsContent value="shorts">
          <ChannelVideos channelId={channel.id} fixedContent="short" />
        </TabsContent>
        <TabsContent value="playlists">
          <ChannelPlaylists channelId={channel.id} />
        </TabsContent>
        <TabsContent value="analytics">
          <CreatorAnalyticsTab channelId={channel.id} />
        </TabsContent>
        <TabsContent value="history">
          <CreatorSearches channelId={channel.id} />
        </TabsContent>
        <TabsContent value="related">
          <RelatedContent channel={channel} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CreatorSearches({ channelId }: { channelId: string }) {
  const q = useQuery({ queryKey: ["history", "creator", channelId], queryFn: () => api.creatorSearches(channelId) });
  if (q.isLoading) return <LoadingGrid count={2} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data?.items.length) return <EmptyState icon={<History />} title="No searches for this creator yet" />;
  return <HistoryTable rows={q.data.items} />;
}
