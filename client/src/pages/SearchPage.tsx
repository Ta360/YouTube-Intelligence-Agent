import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowRight, Bookmark, Brain, ListVideo, Loader2, Search, Users, Video } from "lucide-react";
import { CreatorHeader } from "@/components/creator/CreatorProfile";
import { SearchFilterPanel } from "@/components/common/FilterPanel";
import { DemoBadge, EmptyState, ErrorState, LoadingGrid, SectionTitle } from "@/components/common/states";
import { toast } from "@/components/common/toast";
import { Button } from "@/components/ui/button";
import { Badge, Card, Input } from "@/components/ui/primitives";
import { ChannelCard, PlaylistGrid } from "@/components/video/Cards";
import { VideoCard, VideoGrid } from "@/components/video/VideoCard";
import { api } from "@/lib/api";
import type { Playlist, SearchResponse, Video as V } from "@/lib/types";
import { useAppStore } from "@/store/appStore";

function useLoadMore<T>(initial: T[], token: string | null, fetchPage: (token: string) => Promise<{ items: T[]; nextPageToken: string | null }>, resetKey: unknown) {
  const [extra, setExtra] = useState<T[]>([]);
  const [next, setNext] = useState<string | null>(token);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setExtra([]);
    setNext(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, token]);
  const more = async () => {
    if (!next) return;
    setLoading(true);
    try {
      const r = await fetchPage(next);
      setExtra((e) => [...e, ...r.items]);
      setNext(r.nextPageToken);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  return { items: [...initial, ...extra], hasMore: Boolean(next), more, loading };
}

function Results({ data }: { data: SearchResponse }) {
  const qc = useQueryClient();
  const setCreator = useAppStore((s) => s.setSelectedCreator);
  useEffect(() => {
    if (data.creator) setCreator(data.creator.id);
  }, [data.creator, setCreator]);

  const params = data.videos.params ?? {};
  const videos = useLoadMore<V>(
    data.videos.items,
    data.videos.nextPageToken,
    (pageToken) =>
      params.playlistId
        ? api.playlist(String(params.playlistId), pageToken).then((r) => ({ items: r.items, nextPageToken: r.nextPageToken }))
        : api.moreVideos({ ...params, playlistId: undefined, pageToken, sort: data.intent.sort }),
    data.searchId,
  );
  const playlists = useLoadMore<Playlist>(
    data.playlists.items,
    data.playlists.nextPageToken,
    (pageToken) => (data.creator ? api.channelPlaylists(data.creator.id, pageToken) : api.playlistSearch(data.intent.topic ?? data.query, pageToken)),
    data.searchId,
  );

  const saveSearch = async () => {
    try {
      await api.saveResearch({ kind: "SEARCH", title: data.creator ? `Creator: ${data.creator.title}` : `Search: ${data.query}`, query: data.query, refId: data.creator?.id, payload: { intent: data.intent, videos: data.videos.items.slice(0, 24).map((v) => v.id), creator: data.creator?.id ?? null } });
      toast.success("Search saved to Saved Research");
      void qc.invalidateQueries({ queryKey: ["saved"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const nothing = !data.creator && !videos.items.length && !playlists.items.length && !data.channels.length && !data.video;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Brain className="size-4 text-primary" />
        <span className="text-muted-foreground">Understood as</span>
        <Badge>{data.intent.label}</Badge>
        {data.intent.entity && <Badge variant="outline">Entity: {data.intent.entity}</Badge>}
        {data.intent.topic && <Badge variant="outline">Topic: {data.intent.topic}</Badge>}
        {data.intent.year && <Badge variant="outline">Year: {data.intent.year}</Badge>}
        {data.intent.sort && <Badge variant="outline">Sort: {data.intent.sort}</Badge>}
        <DemoBadge dataSource={data.dataSource} />
        <Button size="sm" variant="outline" className="ml-auto" onClick={saveSearch}>
          <Bookmark /> Save research
        </Button>
      </div>

      {data.warnings.map((w) => (
        <p key={w} className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" /> {w}
        </p>
      ))}

      {nothing && <EmptyState icon={<Search />} title="No results found" description="Try a different spelling, remove filters, or search for a broader topic." />}

      {data.creator && (
        <>
          <CreatorHeader channel={data.creator} candidates={data.candidates} />
          <div className="flex justify-end">
            <Button asChild variant="secondary" size="sm">
              <Link to={`/channels/${data.creator.id}`}>
                Open full creator intelligence <ArrowRight />
              </Link>
            </Button>
          </div>
        </>
      )}

      {data.video && (
        <section className="space-y-3">
          <SectionTitle title="Video" />
          <div className="max-w-md">
            <VideoCard video={data.video} />
          </div>
        </section>
      )}

      {data.channels.length > 0 && (
        <section className="space-y-3">
          <SectionTitle title={<span className="flex items-center gap-2"><Users className="size-4" /> Channels</span>} description={`${data.channels.length} matching channels`} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.channels.map((c) => (
              <ChannelCard key={c.id} channel={c} />
            ))}
          </div>
        </section>
      )}

      {videos.items.length > 0 && !data.video && (
        <section className="space-y-3">
          <SectionTitle
            title={
              <span className="flex items-center gap-2">
                <Video className="size-4 text-secondary" /> {data.creator ? `Videos from ${data.creator.title}` : data.playlist ? `Videos in “${data.playlist.title}”` : "Videos"}
              </span>
            }
            description={
              data.videos.mode === "uploads"
                ? `${videos.items.length} most relevant of ${data.creator?.videoCount?.toLocaleString() ?? "?"} channel videos · more on the creator page`
                : `${videos.items.length} shown${data.videos.total ? ` · about ${data.videos.total.toLocaleString()} on YouTube` : ""}`
            }
          />
          <VideoGrid videos={videos.items} playlistId={data.playlist?.id} />
          {videos.hasMore && (
            <div className="flex justify-center">
              <Button variant="secondary" onClick={() => void videos.more()} disabled={videos.loading}>
                {videos.loading && <Loader2 className="animate-spin" />} Load more
              </Button>
            </div>
          )}
        </section>
      )}

      {playlists.items.length > 0 && (
        <section className="space-y-3">
          <SectionTitle title={<span className="flex items-center gap-2"><ListVideo className="size-4 text-warning" /> Playlists</span>} description={`${playlists.items.length} shown${data.playlists.total ? ` of ${data.playlists.total}` : ""}`} />
          <PlaylistGrid playlists={playlists.items} />
          {playlists.hasMore && (
            <div className="flex justify-center">
              <Button variant="secondary" onClick={() => void playlists.more()} disabled={playlists.loading}>
                {playlists.loading && <Loader2 className="animate-spin" />} Load more
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q")?.trim() ?? "";
  const src = params.get("src") === "global" ? "GLOBAL_SEARCH" : params.get("src") === "history" ? "HISTORY" : "SEARCH_PAGE";
  const filters = useAppStore((s) => s.filters);
  const setFilters = useAppStore((s) => s.setFilters);
  const resetFilters = useAppStore((s) => s.resetFilters);
  const setGlobalQuery = useAppStore((s) => s.setSearchQuery);
  const contextChannelId = useAppStore((s) => s.selectedCreatorId);
  const qc = useQueryClient();
  const [input, setInput] = useState(q);

  useEffect(() => {
    setInput(q);
    if (q) setGlobalQuery(q);
  }, [q, setGlobalQuery]);

  const search = useQuery({
    queryKey: ["search", q, filters],
    queryFn: async () => {
      const r = await api.search({ query: q, filters, source: src, contextChannelId: contextChannelId ?? undefined });
      for (const k of ["analytics", "history", "calendar", "recentSearches", "library", "status"]) void qc.invalidateQueries({ queryKey: [k] });
      return r;
    },
    enabled: q.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = input.trim();
    if (v) setParams({ q: v });
  };

  return (
    <div className="space-y-5">
      <Card className="relative overflow-hidden p-5 sm:p-6">
        <div className="absolute -left-10 -top-20 size-64 rounded-full brand-gradient opacity-15 blur-3xl" aria-hidden />
        <p className="relative text-xs font-bold uppercase tracking-[0.2em] text-primary">Search YouTube</p>
        <form onSubmit={submit} className="relative mt-3 flex gap-2" role="search">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input value={input} onChange={(e) => setInput(e.target.value)} maxLength={200} placeholder="Search person, channel, video, playlist or topic..." aria-label="Search person, channel, video, playlist or topic" className="h-12 rounded-xl pl-12 text-base" />
          </div>
          <Button type="submit" variant="gradient" className="h-12 rounded-xl px-5 text-base" disabled={!input.trim() || search.isFetching}>
            {search.isFetching ? <Loader2 className="animate-spin" /> : <Search />} <span className="hidden sm:inline">SEARCH</span>
          </Button>
        </form>
        <p className="relative mt-2 text-xs text-muted-foreground">Examples: “MrBeast” · “@veritasium” · “MrBeast latest videos” · “Find videos and playlists of MrBeast from 2025” · “videos about AI” · a youtube.com link</p>
      </Card>

      <SearchFilterPanel filters={filters} onChange={setFilters} onReset={resetFilters} />

      {!q ? (
        <EmptyState icon={<Search />} title="Start a search" description="Results — creator profile, videos, playlists — appear here and play inside the dashboard." />
      ) : search.isLoading ? (
        <div className="space-y-4">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Identifying “{q}” and fetching results from YouTube…
          </p>
          <LoadingGrid />
        </div>
      ) : search.error ? (
        <ErrorState error={search.error} onRetry={() => void search.refetch()} />
      ) : search.data ? (
        <Results data={search.data} />
      ) : null}
    </div>
  );
}
