/**
 * searchService — the unified, intent-aware search behind the global search bar, the
 * YouTube Search page and the AI agent. Classifies the query, runs the cheapest set of
 * YouTube calls that answers it, and records history / analytics / calendar activity.
 */
import type { SearchSource, Video } from "@prisma/client";
import { z } from "zod";
import { AppError, errorMessage, toSearchStatus } from "../lib/errors.js";
import { addDays, dayKey } from "../lib/dates.js";
import { recordSearch } from "./activityService.js";
import { classifyQuery, type IntentSort, type QueryIntent } from "./queryIntent.js";
import { getYouTubeProvider } from "./youtube/provider.js";
import { serializeChannel, serializeVideo, type ChannelDTO, type PlaylistDTO, type VideoDTO } from "./youtube/serializers.js";
import type { SearchOrder, VideoSearchParams } from "./youtube/types.js";
import { applyVideoFilters, videoFilterSchema } from "./youtube/videoFilters.js";
import * as yt from "./youtube/youtubeService.js";

export const searchFiltersSchema = z
  .object({
    date: z.enum(["any", "today", "yesterday", "7d", "30d", "custom"]).default("any"),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    content: z.enum(["all", "video", "short", "live", "playlist", "channel"]).default("all"),
    sort: z.enum(["relevance", "newest", "oldest", "views", "likes", "comments", "engagement"]).optional(),
    minViews: z.coerce.number().int().min(0).optional(),
    minLikes: z.coerce.number().int().min(0).optional(),
    minComments: z.coerce.number().int().min(0).optional(),
  })
  .default({ date: "any", content: "all" });
export type SearchFilters = z.infer<typeof searchFiltersSchema>;

export const searchRequestSchema = z.object({
  query: z.string().trim().min(1, "Enter something to search for.").max(200),
  source: z.enum(["GLOBAL_SEARCH", "SEARCH_PAGE", "HISTORY", "RESEARCH"]).default("SEARCH_PAGE"),
  filters: searchFiltersSchema,
  clientSessionId: z.string().max(64).optional(),
  /** Channel currently open in the dashboard, used for "this creator" queries. */
  contextChannelId: z.string().regex(/^UC[A-Za-z0-9_-]{22}$/).optional(),
});

export interface SearchResponse {
  searchId: string | null;
  query: string;
  intent: QueryIntent;
  dataSource: "youtube" | "mock";
  creator: ChannelDTO | null;
  candidates: ChannelDTO[];
  channels: ChannelDTO[];
  videos: { items: VideoDTO[]; nextPageToken: string | null; mode: "uploads" | "search"; total: number | null; params?: Record<string, unknown> };
  playlists: { items: PlaylistDTO[]; nextPageToken: string | null; total: number | null };
  video: VideoDTO | null;
  playlist: PlaylistDTO | null;
  warnings: string[];
}

const ORDER: Record<string, SearchOrder> = { relevance: "relevance", newest: "date", views: "viewCount", likes: "rating" };

/** Date preset → [from, to] day keys in the user's timezone. */
export function resolveDateFilter(f: SearchFilters, tz: string, year?: number): { from?: string; to?: string } {
  const today = dayKey(new Date(), tz);
  switch (f.date) {
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: addDays(today, -1), to: addDays(today, -1) };
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "custom":
      return { from: f.from, to: f.to };
    default:
      return year ? { from: `${year}-01-01`, to: `${year}-12-31` } : {};
  }
}

const rfc = (day?: string, end = false) => (day ? `${day}T${end ? "23:59:59" : "00:00:00"}Z` : undefined);

function effectiveSort(intent: QueryIntent, f: SearchFilters): IntentSort | "engagement" {
  return f.sort ?? intent.sort ?? "relevance";
}

/** Runs a YouTube video search (search.list — 100 quota units) and applies post-filters. */
export async function videoSearch(params: VideoSearchParams, f: SearchFilters, sort: string) {
  const r = await yt.searchVideos(params);
  const filtered = postFilter(r.videos, f, sort);
  return { items: filtered.map((v) => serializeVideo(v)), nextPageToken: r.nextPageToken, total: r.total };
}

function postFilter(videos: Video[], f: SearchFilters, sort: string) {
  const content = f.content === "video" || f.content === "short" || f.content === "live" ? f.content : "all";
  return applyVideoFilters(
    videos,
    videoFilterSchema.parse({ sort: sort === "relevance" ? "relevance" : sort, content, minViews: f.minViews, minLikes: f.minLikes, minComments: f.minComments }),
  ).concat([]);
}

export function buildVideoParams(intent: QueryIntent, f: SearchFilters, tz: string, extra: Partial<VideoSearchParams> = {}): VideoSearchParams {
  const { from, to } = resolveDateFilter(f, tz, intent.year);
  const sort = effectiveSort(intent, f);
  const content = f.content !== "all" ? f.content : intent.contentType;
  return {
    q: intent.topic,
    order: ORDER[sort] ?? (sort === "oldest" ? "date" : "relevance"),
    publishedAfter: rfc(from),
    publishedBefore: rfc(to, true),
    videoDuration: content === "short" ? "short" : undefined,
    eventType: content === "live" ? "live" : undefined,
    maxResults: 24,
    ...extra,
  };
}

export async function runSearch(
  userId: string,
  tz: string,
  input: z.infer<typeof searchRequestSchema>,
  opts: { source?: SearchSource; intent?: QueryIntent } = {},
): Promise<SearchResponse> {
  const intent = opts.intent ?? classifyQuery(input.query);
  const f = input.filters;
  const source = opts.source ?? input.source;
  const dataSource = getYouTubeProvider().dataSource;
  const res: SearchResponse = {
    searchId: null,
    query: input.query,
    intent,
    dataSource,
    creator: null,
    candidates: [],
    channels: [],
    videos: { items: [], nextPageToken: null, mode: "search", total: null },
    playlists: { items: [], nextPageToken: null, total: null },
    video: null,
    playlist: null,
    warnings: [],
  };

  const record = (status: "SUCCESS" | "NO_RESULTS" | "ERROR" | "QUOTA_EXCEEDED" | "INVALID", errorCode?: string) =>
    recordSearch({
      userId,
      tz,
      query: input.query,
      searchType: intent.type,
      source,
      status,
      errorCode,
      entityName: res.creator?.title ?? intent.entity ?? intent.topic ?? null,
      channelYoutubeId: res.creator?.id ?? null,
      channelTitle: res.creator?.title ?? null,
      videoIds: res.videos.items.map((v) => v.id).concat(res.video ? [res.video.id] : []),
      playlistIds: res.playlists.items.map((p) => p.id).concat(res.playlist ? [res.playlist.id] : []),
      channelIds: res.channels.map((c) => c.id).concat(res.candidates.map((c) => c.id)),
      contentType: f.content === "short" ? "SHORT" : f.content === "live" ? "LIVE" : null,
      clientSessionId: input.clientSessionId,
    });

  try {
    if (!intent.raw) throw new AppError("INVALID_QUERY");
    await execute(intent, f, tz, input.contextChannelId, res);
    const found = res.videos.items.length + res.playlists.items.length + res.channels.length + (res.creator ? 1 : 0) + (res.video ? 1 : 0) + (res.playlist ? 1 : 0);
    res.searchId = await record(found ? "SUCCESS" : "NO_RESULTS");
    return res;
  } catch (err) {
    const code = err instanceof AppError ? err.code : "INTERNAL";
    await record(err instanceof AppError ? toSearchStatus(err.code) : "ERROR", code);
    throw err;
  }
}

async function execute(intent: QueryIntent, f: SearchFilters, tz: string, contextChannelId: string | undefined, res: SearchResponse) {
  const sort = effectiveSort(intent, f);

  // Direct links / IDs.
  if (intent.videoId) {
    res.video = await yt.getVideo(intent.videoId);
    res.videos.items = [res.video];
    return;
  }
  if (intent.playlistId) {
    const p = await yt.getPlaylist(intent.playlistId);
    res.playlist = p.playlist;
    res.playlists.items = [p.playlist];
    res.videos = { items: p.items, nextPageToken: p.nextPageToken, mode: "search", total: p.total ?? null, params: { playlistId: p.playlist.id } };
    if (p.unavailable) res.warnings.push(`${p.unavailable} item(s) in this playlist are private or deleted and are not shown.`);
    return;
  }

  // Explicit content tabs that aren't video lists.
  if (f.content === "channel") {
    const q = intent.entity ?? intent.topic ?? intent.raw;
    const r = await getYouTubeProvider().searchChannels(q, undefined, 12);
    for (const c of r.items) res.channels.push(serializeChannel(await yt.upsertChannel(c)));
    return;
  }

  // Creator-centric queries.
  const creatorQuery = intent.channelId || intent.handle || intent.entity || (intent.usesContext && contextChannelId);
  if (creatorQuery) {
    let resolved: yt.ResolvedChannel | null = null;
    try {
      if (intent.usesContext && !intent.entity) {
        if (!contextChannelId) throw new AppError("INVALID_QUERY", "Open a creator first, or name the creator in your search.");
        resolved = await yt.resolveChannel({ channelId: contextChannelId });
      } else {
        resolved = await yt.resolveChannel({ channelId: intent.channelId, handle: intent.handle, name: intent.entity });
      }
    } catch (err) {
      // A name that isn't a channel is still a valid topic.
      if (!(err instanceof AppError && err.code === "CHANNEL_NOT_FOUND") || intent.channelId || intent.handle) throw err;
      res.warnings.push(`No channel matched “${intent.entity}”, so videos about it are shown instead.`);
      const topicIntent = { ...intent, topic: [intent.topic, intent.entity].filter(Boolean).join(" ") };
      res.videos = { ...(await videoSearch(buildVideoParams(topicIntent, f, tz), f, sort)), mode: "search", params: { q: topicIntent.topic } };
      return;
    }

    const ch = resolved.channel;
    res.creator = await yt.channelDTO(ch.youtubeId);
    res.candidates = resolved.candidates.map((c) => serializeChannel(c));

    const wantsPlaylistsOnly = f.content === "playlist" || (intent.wants.playlists && !intent.wants.videos);
    const { from, to } = resolveDateFilter(f, tz, intent.year);

    if (!wantsPlaylistsOnly) {
      const plain = !intent.topic && !from && !to && f.content !== "live";
      if (plain && sort === "views" && !f.minViews && !f.minLikes && !f.minComments) {
        // Channel-wide "most viewed" (approximate API ordering merged with loaded uploads, ranked by real views).
        const vs = await yt.topChannelVideosByViews(ch.youtubeId, 24, f.content === "short" || intent.contentType === "short" ? "short" : f.content === "video" ? "video" : "all");
        res.videos = { items: vs.map((v) => serializeVideo(v)), nextPageToken: null, mode: "uploads", total: vs.length };
      } else if (!plain) {
        // Topic within a creator, or a date window that may be older than the loaded uploads:
        // ask YouTube directly (search.list scoped to the channel).
        const params = buildVideoParams(intent, f, tz, { channelId: ch.youtubeId, order: intent.topic ? (ORDER[sort] ?? "relevance") : (ORDER[sort] ?? "date") });
        res.videos = { ...(await videoSearch(params, f, sort)), mode: "search", params: { ...params } };
      } else {
        const list = await yt.listChannelVideos(
          ch.youtubeId,
          videoFilterSchema.parse({
            sort: sort === "relevance" ? "newest" : sort,
            content: f.content === "video" || f.content === "short" ? f.content : intent.contentType === "short" ? "short" : "all",
            minViews: f.minViews,
            minLikes: f.minLikes,
            minComments: f.minComments,
          }),
          1,
          24,
        );
        res.videos = { items: list.items, nextPageToken: null, mode: "uploads", total: list.total };
        res.creator = await yt.channelDTO(ch.youtubeId);
      }
    }
    try {
      const pl = await yt.channelPlaylists(ch.youtubeId);
      res.playlists = { items: pl.items, nextPageToken: pl.nextPageToken, total: pl.total };
    } catch (err) {
      res.warnings.push(`Playlists could not be loaded: ${errorMessage(err)}`);
    }
    return;
  }

  // Topic searches.
  const q = intent.topic ?? intent.raw;
  if (f.content === "playlist" || (intent.wants.playlists && !intent.wants.videos)) {
    const pl = await yt.searchPlaylists(q);
    res.playlists = { items: pl.items, nextPageToken: pl.nextPageToken, total: pl.total };
    return;
  }
  const params = buildVideoParams({ ...intent, topic: q }, f, tz);
  res.videos = { ...(await videoSearch(params, f, sort)), mode: "search", params: { ...params } };
  if (intent.wants.playlists) {
    const pl = await yt.searchPlaylists(q).catch(() => null);
    if (pl) res.playlists = { items: pl.items, nextPageToken: pl.nextPageToken, total: pl.total };
  }
}
