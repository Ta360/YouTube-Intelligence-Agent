import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Bookmark, ChevronRight, Clock, LayoutDashboard, Search, Video } from "lucide-react";
import { AnalyticsCharts, KpiRow } from "@/components/charts/AnalyticsDashboard";
import { EmptyState, ErrorState, LoadingGrid, PageHeader, SectionTitle } from "@/components/common/states";
import { StatusBadge } from "@/components/common/HistoryTable";
import { GlobalSearch } from "@/components/layout/TopHeader";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { VideoGrid } from "@/components/video/VideoCard";
import { useRange } from "@/hooks/queries";
import { api } from "@/lib/api";
import { fmtDay } from "@/lib/dates";
import { SEARCH_TYPE_LABEL, timeAgo } from "@/lib/format";
import { useAuth } from "@/components/auth/Auth";

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const r = useRange();
  const recent = useQuery({ queryKey: ["history", "dashboard"], queryFn: () => api.history({ page: 1, pageSize: 6 }) });
  const videos = useQuery({ queryKey: ["library", "videos", "recent"], queryFn: () => api.libraryVideos({ sort: "relevance", content: "all", duration: "any", page: 1, pageSize: 8 }) });
  const saved = useQuery({ queryKey: ["saved"], queryFn: api.saved });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<LayoutDashboard />}
        title={`Welcome back, ${user.name.split(" ")[0]}`}
        description={`Your YouTube intelligence overview · ${fmtDay(r.from)} – ${fmtDay(r.to)}`}
      />

      <Card className="relative overflow-hidden p-5 sm:p-6">
        <div className="absolute -right-16 -top-16 size-56 rounded-full brand-gradient opacity-20 blur-3xl" aria-hidden />
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Search YouTube</p>
        <p className="mb-3 mt-1 text-sm text-muted-foreground">A person, creator, @handle, channel ID, video or playlist link — or any topic.</p>
        <GlobalSearch autoFocusKey={false} className="relative" />
        <div className="relative mt-3 flex flex-wrap gap-1.5">
          {["MrBeast", "Veritasium latest videos", "videos about artificial intelligence", "Kurzgesagt playlists"].map((q) => (
            <button key={q} type="button" onClick={() => navigate(`/search?q=${encodeURIComponent(q)}`)} className="cursor-pointer rounded-full border px-3 py-1 text-xs text-muted-foreground hover:border-primary/60 hover:text-foreground">
              {q}
            </button>
          ))}
        </div>
      </Card>

      <KpiRow />
      <AnalyticsCharts />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <Clock className="size-4 text-primary" /> Recent searches
            </CardTitle>
            <Button asChild size="sm" variant="ghost">
              <Link to="/history">
                All history <ChevronRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recent.error ? (
              <ErrorState error={recent.error} compact onRetry={() => void recent.refetch()} />
            ) : !recent.data?.items.length ? (
              <EmptyState icon={<Search />} title="No searches yet" description="Use the search bar to research your first creator." />
            ) : (
              <ul className="divide-y">
                {recent.data.items.map((h) => (
                  <li key={h.id}>
                    <button type="button" onClick={() => navigate(h.channelYoutubeId ? `/channels/${h.channelYoutubeId}` : `/search?q=${encodeURIComponent(h.query)}&src=history`)} className="flex w-full cursor-pointer items-center gap-3 py-2.5 text-left hover:text-primary">
                      <Search className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{h.query}</p>
                        <p className="text-xs text-muted-foreground">
                          {SEARCH_TYPE_LABEL[h.searchType]} · {h.resultCount} results · {timeAgo(h.createdAt)}
                        </p>
                      </div>
                      <StatusBadge status={h.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <Bookmark className="size-4 text-success" /> Saved research
            </CardTitle>
            <Button asChild size="sm" variant="ghost">
              <Link to="/saved">
                All saved <ChevronRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {saved.error ? (
              <ErrorState error={saved.error} compact />
            ) : (
              (() => {
                const items = [
                  ...(saved.data?.research ?? []).map((x) => ({ key: x.id, title: x.title, sub: `${x.kind.replace("_", " ").toLowerCase()} · ${timeAgo(x.createdAt)}`, to: "/saved" })),
                  ...(saved.data?.channels ?? []).map((x) => ({ key: x.channel.id, title: x.channel.title, sub: `creator · ${timeAgo(x.savedAt)}`, to: `/channels/${x.channel.id}` })),
                  ...(saved.data?.videos ?? []).map((x) => ({ key: x.video.id, title: x.video.title, sub: `video · ${timeAgo(x.savedAt)}`, to: "/saved" })),
                ].slice(0, 6);
                return items.length ? (
                  <ul className="divide-y">
                    {items.map((i) => (
                      <li key={i.key}>
                        <Link to={i.to} className="flex items-center gap-3 py-2.5 hover:text-primary">
                          <Bookmark className="size-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{i.title}</p>
                            <p className="text-xs capitalize text-muted-foreground">{i.sub}</p>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState icon={<Bookmark />} title="Nothing saved yet" description="Save creators, videos, playlists or whole research sessions." />
                );
              })()
            )}
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <SectionTitle
          title={
            <span className="flex items-center gap-2">
              <Video className="size-4 text-secondary" /> Recent videos
            </span>
          }
          description="Videos you discovered most recently"
          actions={
            <Button asChild size="sm" variant="ghost">
              <Link to="/videos">
                All videos <ChevronRight />
              </Link>
            </Button>
          }
        />
        {videos.isLoading ? (
          <LoadingGrid count={4} />
        ) : videos.error ? (
          <ErrorState error={videos.error} onRetry={() => void videos.refetch()} />
        ) : videos.data?.items.length ? (
          <VideoGrid videos={videos.data.items} dense />
        ) : (
          <EmptyState icon={<Video />} title="No videos discovered yet" description="Search for a creator and their videos appear here." action={<Badge variant="outline">Tip: press / to search</Badge>} />
        )}
      </section>
    </div>
  );
}
