import { useEffect, useState, type FormEvent } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, ListVideo, Loader2, Play, Search, Users, Video } from "lucide-react";
import { CreatorProfile } from "@/components/creator/CreatorProfile";
import { DEFAULT_VIDEO_FILTERS, VideoFilterBar } from "@/components/common/FilterPanel";
import { DemoBadge, EmptyState, ErrorState, LoadingGrid, PageHeader, SectionTitle } from "@/components/common/states";
import { toast } from "@/components/common/toast";
import { Button } from "@/components/ui/button";
import { Card, Input, Select, Skeleton } from "@/components/ui/primitives";
import { ChannelCard, PlaylistGrid } from "@/components/video/Cards";
import { VideoGrid } from "@/components/video/VideoCard";
import { useAddToResearch, useIsSaved, usePlay, useToggleSave } from "@/hooks/queries";
import { api } from "@/lib/api";
import { dateShort, full } from "@/lib/format";
import type { Playlist, Video as V, VideoFilters } from "@/lib/types";
import { useAppStore } from "@/store/appStore";

// ─── People / Channels ──────────────────────────────────────────────────────
export function ChannelsPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("");
  const [find, setFind] = useState("");
  const [submitted, setSubmitted] = useState("");
  const lib = useQuery({ queryKey: ["library", "channels", ""], queryFn: () => api.libraryChannels() });
  const found = useQuery({ queryKey: ["channelSearch", submitted], queryFn: () => api.channelSearch(submitted), enabled: Boolean(submitted), retry: false });
  const items = (lib.data?.items ?? []).filter((c) => !filter || c.title.toLowerCase().includes(filter.toLowerCase()) || c.handle?.toLowerCase().includes(filter.toLowerCase()));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = find.trim();
    if (/^UC[A-Za-z0-9_-]{22}$/.test(v)) return navigate(`/channels/${v}`);
    if (v) setSubmitted(v);
  };

  return (
    <div className="space-y-6">
      <PageHeader icon={<Users />} title="People / Channels" description="Creators and channels you've researched — open one for its full intelligence profile." />
      <Card className="p-4">
        <form onSubmit={submit} className="flex flex-wrap gap-2">
          <Input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a person or channel by name, @handle or channel ID" aria-label="Find a channel" className="h-10 min-w-0 flex-1" maxLength={100} />
          <Button type="submit" className="h-10" disabled={!find.trim() || found.isFetching}>
            {found.isFetching ? <Loader2 className="animate-spin" /> : <Search />} Find channels
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">Channel search uses 100 YouTube API quota units. Candidates are ranked by name match and audience size.</p>
      </Card>
      {submitted && (
        <section className="space-y-3">
          <SectionTitle title={`Channels matching “${submitted}”`} />
          {found.isLoading ? <LoadingGrid count={3} /> : found.error ? <ErrorState error={found.error} /> : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {found.data?.items.map((c) => <ChannelCard key={c.id} channel={c} />)}
            </div>
          )}
        </section>
      )}
      <section className="space-y-3">
        <SectionTitle
          title="Researched creators"
          description={lib.data ? `${lib.data.items.length} channels` : undefined}
          actions={<Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter…" aria-label="Filter researched creators" className="w-48" />}
        />
        {lib.isLoading ? (
          <LoadingGrid count={6} />
        ) : lib.error ? (
          <ErrorState error={lib.error} onRetry={() => void lib.refetch()} />
        ) : items.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {items.map((c) => (
              <ChannelCard key={c.id} channel={c} />
            ))}
          </div>
        ) : (
          <EmptyState icon={<Users />} title="No creators yet" description="Search for a person or channel to start building your research." />
        )}
      </section>
    </div>
  );
}

export function CreatorPage() {
  const { id = "" } = useParams();
  const setCreator = useAppStore((s) => s.setSelectedCreator);
  const q = useQuery({ queryKey: ["channel", id], queryFn: () => api.channel(id), retry: false });
  useEffect(() => {
    if (q.data) setCreator(q.data.id);
  }, [q.data, setCreator]);
  if (q.isLoading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-72 w-full rounded-xl" />
        <LoadingGrid count={4} />
      </div>
    );
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return <CreatorProfile key={q.data.id} channel={q.data} />;
}

// ─── Videos (everything this user discovered) ───────────────────────────────
export function VideosPage() {
  const [filters, setFilters] = useState<VideoFilters>({ ...DEFAULT_VIDEO_FILTERS, sort: "relevance" });
  const [page, setPage] = useState(1);
  const channels = useQuery({ queryKey: ["library", "channels", ""], queryFn: () => api.libraryChannels() });
  const q = useQuery({ queryKey: ["library", "videos", filters, page], queryFn: () => api.libraryVideos({ ...filters, page, pageSize: 24 }), placeholderData: keepPreviousData });
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / 24)) : 1;
  return (
    <div className="space-y-5">
      <PageHeader icon={<Video />} title="Videos" description="Every video you've discovered across searches, creators, playlists and the AI agent." />
      <div className="flex flex-wrap items-start gap-2">
        <Select aria-label="Filter by creator" value={filters.channelId ?? ""} onChange={(e) => (setFilters({ ...filters, channelId: e.target.value || undefined }), setPage(1))} className="w-56">
          <option value="">All creators</option>
          {channels.data?.items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </Select>
        <VideoFilterBar className="flex-1" filters={filters} onChange={(f) => (setFilters(f), setPage(1))} />
      </div>
      {q.data && <p className="text-xs text-muted-foreground">{full(q.data.total)} videos{filters.sort === "relevance" && !filters.q ? " · most recently discovered first" : ""}</p>}
      {q.isLoading ? (
        <LoadingGrid />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data?.items.length ? (
        <VideoGrid videos={q.data.items} className={q.isFetching ? "opacity-70" : undefined} />
      ) : (
        <EmptyState icon={<Video />} title="No videos match" description="Search for creators or topics to discover videos, or clear the filters." />
      )}
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
    </div>
  );
}

// ─── Playlists ──────────────────────────────────────────────────────────────
export function PlaylistsPage() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [extra, setExtra] = useState<{ items: Playlist[]; next: string | null }>({ items: [], next: null });
  const [loadingMore, setLoadingMore] = useState(false);
  const lib = useQuery({ queryKey: ["library", "playlists"], queryFn: () => api.libraryPlaylists() });
  const found = useQuery({ queryKey: ["playlistSearch", query], queryFn: () => api.playlistSearch(query), enabled: Boolean(query), retry: false });
  useEffect(() => setExtra({ items: [], next: found.data?.nextPageToken ?? null }), [found.data]);
  const more = async () => {
    if (!extra.next) return;
    setLoadingMore(true);
    try {
      const r = await api.playlistSearch(query, extra.next);
      setExtra((e) => ({ items: [...e.items, ...r.items], next: r.nextPageToken }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };
  return (
    <div className="space-y-6">
      <PageHeader icon={<ListVideo />} title="Playlists" description="Search and discover YouTube playlists, and revisit the ones you've found." />
      <Card className="p-4">
        <form onSubmit={(e) => (e.preventDefault(), setQuery(input.trim()))} className="flex flex-wrap gap-2" role="search">
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Search playlists — e.g. “machine learning course”, “MrBeast”" aria-label="Search playlists" className="h-10 min-w-0 flex-1" maxLength={200} />
          <Button type="submit" className="h-10" disabled={!input.trim()}>
            <Search /> Search playlists
          </Button>
        </form>
      </Card>
      {query && (
        <section className="space-y-3">
          <SectionTitle title={`Playlists for “${query}”`} description={found.data?.total ? `About ${found.data.total.toLocaleString()} on YouTube` : undefined} />
          {found.isLoading ? <LoadingGrid count={4} /> : found.error ? <ErrorState error={found.error} /> : found.data?.items.length ? (
            <>
              <PlaylistGrid playlists={[...found.data.items, ...extra.items].map((p) => ({ ...p, source: "Playlist" as const }))} />
              {extra.next && (
                <div className="flex justify-center">
                  <Button variant="secondary" onClick={() => void more()} disabled={loadingMore}>
                    {loadingMore && <Loader2 className="animate-spin" />} Load more
                  </Button>
                </div>
              )}
            </>
          ) : (
            <EmptyState icon={<ListVideo />} title="No playlists found" />
          )}
        </section>
      )}
      <section className="space-y-3">
        <SectionTitle title="Discovered playlists" description={lib.data ? `${lib.data.items.length} playlists` : undefined} />
        {lib.isLoading ? <LoadingGrid count={4} /> : lib.error ? <ErrorState error={lib.error} /> : lib.data?.items.length ? <PlaylistGrid playlists={lib.data.items} /> : <EmptyState icon={<ListVideo />} title="No playlists yet" description="Creator searches and playlist searches add playlists here." />}
      </section>
    </div>
  );
}

export function PlaylistPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const play = usePlay();
  const setSelected = useAppStore((s) => s.setSelectedPlaylist);
  const q = useQuery({ queryKey: ["playlist", id], queryFn: () => api.playlist(id), retry: false });
  const saved = useIsSaved("playlist", id);
  const toggle = useToggleSave("playlist");
  const add = useAddToResearch();
  const [extra, setExtra] = useState<{ items: V[]; next: string | null }>({ items: [], next: null });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setSelected(id);
    setExtra({ items: [], next: q.data?.nextPageToken ?? null });
  }, [q.data, id, setSelected]);
  if (q.isLoading) return <LoadingGrid />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const { playlist } = q.data;
  const items = [...q.data.items, ...extra.items];
  const more = async () => {
    if (!extra.next) return;
    setLoading(true);
    try {
      const r = await api.playlist(id, extra.next);
      setExtra((e) => ({ items: [...e.items, ...r.items], next: r.nextPageToken }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="space-y-5">
      <Card className="flex flex-col gap-4 overflow-hidden p-4 sm:flex-row">
        <div className="aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-muted sm:w-72">{playlist.thumbnailUrl && <img src={playlist.thumbnailUrl} alt="" className="size-full object-cover" />}</div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-warning">Playlist</p>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold">
            {playlist.title} <DemoBadge dataSource={playlist.dataSource} />
          </h1>
          <button type="button" className="cursor-pointer text-sm text-primary hover:underline" onClick={() => navigate(`/channels/${playlist.channelId}`)}>
            {playlist.channelTitle}
          </button>
          <p className="text-sm text-muted-foreground">
            {full(playlist.itemCount)} videos · created {dateShort(playlist.publishedAt)} · ID <span className="font-mono text-xs">{playlist.id}</span>
          </p>
          {playlist.description && <p className="line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">{playlist.description}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button onClick={() => items[0] && play(items[0])} disabled={!items.length}>
              <Play className="fill-current" /> Play first video
            </Button>
            <Button variant="outline" onClick={() => toggle.mutate({ id, saved })}>
              {saved ? "Saved" : "Save playlist"}
            </Button>
            <Button variant="outline" onClick={() => add.mutate({ kind: "PLAYLIST", youtubeId: id })}>
              Add to research
            </Button>
          </div>
        </div>
      </Card>
      {q.data.unavailable > 0 && <p className="text-xs text-muted-foreground">{q.data.unavailable} item(s) on this page are private or deleted and are not shown.</p>}
      {items.length ? <VideoGrid videos={items} playlistId={id} /> : <EmptyState icon={<ListVideo />} title="This playlist has no available videos" />}
      {extra.next && (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => void more()} disabled={loading}>
            {loading && <Loader2 className="animate-spin" />} Load more
          </Button>
        </div>
      )}
    </div>
  );
}
