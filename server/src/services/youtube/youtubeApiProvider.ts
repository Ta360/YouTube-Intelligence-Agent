/**
 * Official YouTube Data API v3 provider.
 *
 * - Every call goes through `call()`: API key stays server-side, errors are mapped to safe
 *   AppErrors, quota units are recorded in `api_usage`, and GET responses are cached.
 * - Only public data is requested. There is no scraping and no attempt to access private,
 *   deleted or restricted content.
 */
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { parseIsoDuration } from "../../lib/dates.js";
import { TtlCache } from "../../lib/ttlCache.js";
import { recordApiUsage } from "../apiUsageService.js";
import type { ChannelRecord, CommentRecord, CommentThreadRecord, Page, PlaylistRecord, VideoRecord, VideoSearchParams, YouTubeProvider } from "./types.js";

const BASE = "https://www.googleapis.com/youtube/v3";
/** Quota cost per endpoint (https://developers.google.com/youtube/v3/determine_quota_cost). */
const COST: Record<string, number> = { search: 100 };

const cache = new TtlCache<unknown>(env.youtube.cacheTtlSeconds * 1000, 2000);

type Params = Record<string, string | number | undefined>;

async function call<T>(endpoint: string, params: Params): Promise<T> {
  if (!env.youtube.apiKey) throw new AppError("API_NOT_CONFIGURED");
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
  const cacheKey = `${endpoint}?${qs.toString()}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit.value as T;

  qs.set("key", env.youtube.apiKey);
  const units = COST[endpoint] ?? 1;
  let res: Response;
  try {
    res = await fetch(`${BASE}/${endpoint}?${qs.toString()}`, { signal: AbortSignal.timeout(15_000), headers: { Accept: "application/json" } });
  } catch (err) {
    await recordApiUsage("youtube", endpoint, units, false, "NETWORK_ERROR");
    throw new AppError("NETWORK_ERROR", undefined, { cause: err });
  }
  const body = (await res.json().catch(() => null)) as { error?: { errors?: { reason?: string }[]; message?: string } } | null;
  if (!res.ok) {
    const reason = body?.error?.errors?.[0]?.reason ?? "";
    const code = mapError(res.status, reason);
    await recordApiUsage("youtube", endpoint, units, false, code);
    logger.warn("youtube.api_error", { endpoint, status: res.status, reason });
    throw new AppError(code);
  }
  await recordApiUsage("youtube", endpoint, units, true);
  cache.set(cacheKey, body);
  return body as T;
}

function mapError(status: number, reason: string) {
  if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") return "QUOTA_EXCEEDED" as const;
  if (reason === "rateLimitExceeded" || reason === "userRateLimitExceeded" || status === 429) return "RATE_LIMITED" as const;
  if (["keyInvalid", "keyExpired", "accessNotConfigured", "ipRefererBlocked"].includes(reason) || (status === 400 && /key/i.test(reason)))
    return "API_KEY_INVALID" as const;
  if (reason === "playlistNotFound") return "PLAYLIST_NOT_FOUND" as const;
  if (reason === "commentsDisabled") return "COMMENTS_DISABLED" as const;
  if (reason === "channelNotFound") return "CHANNEL_NOT_FOUND" as const;
  if (reason === "videoNotFound") return "VIDEO_UNAVAILABLE" as const;
  if (status === 404) return "NOT_FOUND" as const;
  if (status === 400) return "INVALID_INPUT" as const;
  if (status === 403) return "FORBIDDEN" as const;
  return "NETWORK_ERROR" as const;
}

// ─── Raw response shapes (only the fields used) ───────────────────────────
type Thumbs = Record<string, { url: string } | undefined>;
const bestThumb = (t?: Thumbs) => t?.maxres?.url ?? t?.standard?.url ?? t?.high?.url ?? t?.medium?.url ?? t?.default?.url ?? null;
const big = (v?: string) => (v === undefined || v === null || v === "" ? null : BigInt(v));
const date = (v?: string) => (v ? new Date(v) : null);

interface RawChannel {
  id: string;
  snippet?: { title?: string; description?: string; customUrl?: string; publishedAt?: string; country?: string; thumbnails?: Thumbs };
  statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean; videoCount?: string; viewCount?: string };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
  brandingSettings?: { channel?: { keywords?: string }; image?: { bannerExternalUrl?: string } };
  topicDetails?: { topicCategories?: string[] };
}
interface RawVideo {
  id: string;
  snippet?: {
    channelId?: string;
    channelTitle?: string;
    title?: string;
    description?: string;
    publishedAt?: string;
    thumbnails?: Thumbs;
    tags?: string[];
    categoryId?: string;
    liveBroadcastContent?: string;
    defaultLanguage?: string;
    defaultAudioLanguage?: string;
  };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  status?: { embeddable?: boolean; privacyStatus?: string };
}
interface RawPlaylist {
  id: string;
  snippet?: { channelId?: string; channelTitle?: string; title?: string; description?: string; publishedAt?: string; thumbnails?: Thumbs };
  contentDetails?: { itemCount?: number };
}
interface ListResponse<T> {
  items?: T[];
  nextPageToken?: string;
  pageInfo?: { totalResults?: number };
}

function toChannel(c: RawChannel): ChannelRecord {
  const customUrl = c.snippet?.customUrl ?? null;
  return {
    youtubeId: c.id,
    title: c.snippet?.title ?? "Untitled channel",
    handle: customUrl?.startsWith("@") ? customUrl : null,
    customUrl,
    description: c.snippet?.description ?? "",
    thumbnailUrl: bestThumb(c.snippet?.thumbnails),
    bannerUrl: c.brandingSettings?.image?.bannerExternalUrl ?? null,
    country: c.snippet?.country ?? null,
    publishedAt: date(c.snippet?.publishedAt),
    subscriberCount: c.statistics?.hiddenSubscriberCount ? null : big(c.statistics?.subscriberCount),
    hiddenSubscriberCount: Boolean(c.statistics?.hiddenSubscriberCount),
    videoCount: c.statistics?.videoCount ? Number(c.statistics.videoCount) : null,
    viewCount: big(c.statistics?.viewCount),
    uploadsPlaylistId: c.contentDetails?.relatedPlaylists?.uploads ?? null,
    keywords: c.brandingSettings?.channel?.keywords ?? null,
    topicCategories: (c.topicDetails?.topicCategories ?? []).map((u) => decodeURIComponent(u.split("/").pop() ?? "").replace(/_/g, " ")),
  };
}

function toVideo(v: RawVideo, withDetails: boolean): VideoRecord {
  const s = v.snippet ?? {};
  return {
    youtubeId: v.id,
    channelYoutubeId: s.channelId ?? "",
    channelTitle: s.channelTitle ?? "",
    title: s.title ?? "Untitled video",
    description: s.description ?? "",
    thumbnailUrl: bestThumb(s.thumbnails),
    publishedAt: date(s.publishedAt),
    ...(withDetails
      ? {
          details: {
            durationSeconds: parseIsoDuration(v.contentDetails?.duration),
            viewCount: big(v.statistics?.viewCount),
            likeCount: big(v.statistics?.likeCount),
            commentCount: big(v.statistics?.commentCount),
            tags: s.tags ?? [],
            categoryId: s.categoryId ?? null,
            liveBroadcastContent: s.liveBroadcastContent ?? null,
            embeddable: v.status?.embeddable ?? null,
            privacyStatus: v.status?.privacyStatus ?? null,
            defaultLanguage: s.defaultLanguage ?? s.defaultAudioLanguage ?? null,
          },
        }
      : {}),
  };
}

function toPlaylist(p: RawPlaylist): PlaylistRecord {
  const s = p.snippet ?? {};
  return {
    youtubeId: p.id,
    channelYoutubeId: s.channelId ?? "",
    channelTitle: s.channelTitle ?? "",
    title: s.title ?? "Untitled playlist",
    description: s.description ?? "",
    thumbnailUrl: bestThumb(s.thumbnails),
    itemCount: p.contentDetails?.itemCount ?? null,
    publishedAt: date(s.publishedAt),
  };
}

interface RawComment {
  id: string;
  snippet?: { authorDisplayName?: string; authorProfileImageUrl?: string; authorChannelUrl?: string; textOriginal?: string; textDisplay?: string; likeCount?: number; publishedAt?: string; updatedAt?: string };
}
const toComment = (c: RawComment): CommentRecord => ({
  id: c.id,
  authorName: c.snippet?.authorDisplayName ?? "Unknown",
  authorAvatarUrl: c.snippet?.authorProfileImageUrl ?? null,
  authorChannelUrl: c.snippet?.authorChannelUrl ?? null,
  // textOriginal is plain text (textDisplay is HTML) — rendered as text, never as HTML.
  text: c.snippet?.textOriginal ?? c.snippet?.textDisplay ?? "",
  likeCount: c.snippet?.likeCount ?? 0,
  publishedAt: c.snippet?.publishedAt ?? null,
  updatedAt: c.snippet?.updatedAt ?? null,
});

const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

export class YouTubeApiProvider implements YouTubeProvider {
  readonly dataSource = "youtube" as const;
  private categories: Record<string, string> | null = null;

  async getChannels(by: { ids?: string[]; handle?: string; username?: string }): Promise<ChannelRecord[]> {
    const part = "snippet,statistics,contentDetails,brandingSettings,topicDetails";
    if (by.ids?.length) {
      const out: ChannelRecord[] = [];
      for (const ids of chunk(by.ids, 50)) {
        const r = await call<ListResponse<RawChannel>>("channels", { part, id: ids.join(","), maxResults: 50 });
        out.push(...(r.items ?? []).map(toChannel));
      }
      return out;
    }
    if (by.handle) {
      const r = await call<ListResponse<RawChannel>>("channels", { part, forHandle: by.handle.replace(/^@?/, "@") });
      return (r.items ?? []).map(toChannel);
    }
    if (by.username) {
      const r = await call<ListResponse<RawChannel>>("channels", { part, forUsername: by.username });
      return (r.items ?? []).map(toChannel);
    }
    return [];
  }

  async searchChannels(q: string, pageToken?: string, maxResults = 8): Promise<Page<ChannelRecord>> {
    const r = await call<ListResponse<{ id: { channelId?: string } }>>("search", { part: "snippet", type: "channel", q, maxResults, pageToken });
    const ids = (r.items ?? []).map((i) => i.id.channelId).filter((x): x is string => Boolean(x));
    const full = ids.length ? await this.getChannels({ ids }) : [];
    const byId = new Map(full.map((c) => [c.youtubeId, c]));
    return { items: ids.map((id) => byId.get(id)).filter((c): c is ChannelRecord => Boolean(c)), nextPageToken: r.nextPageToken ?? null, totalResults: r.pageInfo?.totalResults ?? null };
  }

  async getVideos(ids: string[]): Promise<VideoRecord[]> {
    const out: VideoRecord[] = [];
    for (const group of chunk([...new Set(ids)], 50)) {
      const r = await call<ListResponse<RawVideo>>("videos", { part: "snippet,contentDetails,statistics,status", id: group.join(","), maxResults: 50 });
      out.push(...(r.items ?? []).map((v) => toVideo(v, true)));
    }
    return out;
  }

  async searchVideos(p: VideoSearchParams): Promise<Page<VideoRecord>> {
    const r = await call<ListResponse<RawVideo & { id: { videoId?: string } }>>("search", {
      part: "snippet",
      type: "video",
      q: p.q,
      channelId: p.channelId,
      order: p.order ?? "relevance",
      publishedAfter: p.publishedAfter,
      publishedBefore: p.publishedBefore,
      videoDuration: p.videoDuration && p.videoDuration !== "any" ? p.videoDuration : undefined,
      eventType: p.eventType,
      maxResults: p.maxResults ?? 24,
      pageToken: p.pageToken,
      safeSearch: "moderate",
    });
    const ids = (r.items ?? []).map((i) => (i.id as unknown as { videoId?: string }).videoId).filter((x): x is string => Boolean(x));
    // Enrich with statistics/duration in one cheap call (1 unit per 50 videos).
    const details = ids.length ? await this.getVideos(ids) : [];
    const byId = new Map(details.map((v) => [v.youtubeId, v]));
    return { items: ids.map((id) => byId.get(id)).filter((v): v is VideoRecord => Boolean(v)), nextPageToken: r.nextPageToken ?? null, totalResults: r.pageInfo?.totalResults ?? null };
  }

  async getPlaylists(ids: string[]): Promise<PlaylistRecord[]> {
    const out: PlaylistRecord[] = [];
    for (const group of chunk([...new Set(ids)], 50)) {
      const r = await call<ListResponse<RawPlaylist>>("playlists", { part: "snippet,contentDetails", id: group.join(","), maxResults: 50 });
      out.push(...(r.items ?? []).map(toPlaylist));
    }
    return out;
  }

  async searchPlaylists(q: string, pageToken?: string, channelId?: string): Promise<Page<PlaylistRecord>> {
    const r = await call<ListResponse<{ id: { playlistId?: string } }>>("search", { part: "snippet", type: "playlist", q, channelId, maxResults: 12, pageToken });
    const ids = (r.items ?? []).map((i) => i.id.playlistId).filter((x): x is string => Boolean(x));
    const full = ids.length ? await this.getPlaylists(ids) : [];
    const byId = new Map(full.map((p) => [p.youtubeId, p]));
    return { items: ids.map((id) => byId.get(id)).filter((p): p is PlaylistRecord => Boolean(p)), nextPageToken: r.nextPageToken ?? null, totalResults: r.pageInfo?.totalResults ?? null };
  }

  async getChannelPlaylists(channelId: string, pageToken?: string): Promise<Page<PlaylistRecord>> {
    const r = await call<ListResponse<RawPlaylist>>("playlists", { part: "snippet,contentDetails", channelId, maxResults: 25, pageToken });
    return { items: (r.items ?? []).map(toPlaylist), nextPageToken: r.nextPageToken ?? null, totalResults: r.pageInfo?.totalResults ?? null };
  }

  async getPlaylistItems(playlistId: string, pageToken?: string, maxResults = 25) {
    const r = await call<ListResponse<{ contentDetails?: { videoId?: string }; snippet?: { position?: number } }>>("playlistItems", {
      part: "contentDetails,snippet",
      playlistId,
      maxResults,
      pageToken,
    });
    return {
      items: (r.items ?? [])
        .map((i) => ({ videoId: i.contentDetails?.videoId ?? "", position: i.snippet?.position ?? 0 }))
        .filter((i) => i.videoId),
      nextPageToken: r.nextPageToken ?? null,
      totalResults: r.pageInfo?.totalResults ?? null,
    };
  }

  async getComments(videoId: string, opts: { order: "relevance" | "time"; pageToken?: string; searchTerms?: string }): Promise<Page<CommentThreadRecord>> {
    const r = await call<ListResponse<{ id: string; snippet?: { topLevelComment?: RawComment; totalReplyCount?: number }; replies?: { comments?: RawComment[] } }>>("commentThreads", {
      part: "snippet,replies",
      videoId,
      order: opts.order,
      maxResults: 20,
      pageToken: opts.pageToken,
      searchTerms: opts.searchTerms,
      textFormat: "plainText",
    });
    return {
      items: (r.items ?? [])
        .filter((t) => t.snippet?.topLevelComment)
        .map((t) => ({
          ...toComment(t.snippet!.topLevelComment!),
          id: t.id,
          replyCount: t.snippet?.totalReplyCount ?? 0,
          // The API returns replies newest-first; show them in conversation order.
          replies: (t.replies?.comments ?? []).map(toComment).reverse(),
        })),
      nextPageToken: r.nextPageToken ?? null,
      totalResults: r.pageInfo?.totalResults ?? null,
    };
  }

  async getReplies(parentId: string, pageToken?: string): Promise<Page<CommentRecord>> {
    const r = await call<ListResponse<RawComment>>("comments", { part: "snippet", parentId, maxResults: 50, pageToken, textFormat: "plainText" });
    return { items: (r.items ?? []).map(toComment), nextPageToken: r.nextPageToken ?? null };
  }

  async getCategories(): Promise<Record<string, string>> {
    if (this.categories) return this.categories;
    const r = await call<ListResponse<{ id: string; snippet?: { title?: string } }>>("videoCategories", { part: "snippet", regionCode: env.youtube.region });
    this.categories = Object.fromEntries((r.items ?? []).map((c) => [c.id, c.snippet?.title ?? c.id]));
    return this.categories;
  }

  async ping() {
    await call("i18nRegions", { part: "snippet", hl: "en_US" });
  }
}
