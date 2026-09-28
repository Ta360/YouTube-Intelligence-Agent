/**
 * youtubeService — high-level YouTube operations on top of a provider.
 * Stores every public record once (keyed by YouTube ID), reuses fresh DB rows before
 * spending API quota, and paginates instead of bulk-fetching.
 */
import type { Channel, ContentType, Playlist, Video } from "@prisma/client";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { getYouTubeProvider } from "./provider.js";
import { serializeChannel, serializePlaylist, serializeVideo, type ChannelDTO, type PlaylistDTO, type VideoDTO } from "./serializers.js";
import type { ChannelRecord, PlaylistRecord, VideoRecord, VideoSearchParams } from "./types.js";
import { applyVideoFilters, type VideoFilters } from "./videoFilters.js";

const CHANNEL_TTL_MS = 6 * 3600_000;
const VIDEO_TTL_MS = 3 * 3600_000;
const UPLOADS_PAGE = 50;

const provider = () => getYouTubeProvider();
const ds = () => provider().dataSource;

export const normalizeName = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

// ─── Persistence ────────────────────────────────────────────────────────────
export async function upsertChannel(r: ChannelRecord): Promise<Channel> {
  const data = {
    title: r.title,
    handle: r.handle,
    customUrl: r.customUrl,
    description: r.description,
    thumbnailUrl: r.thumbnailUrl,
    bannerUrl: r.bannerUrl,
    country: r.country,
    publishedAt: r.publishedAt,
    subscriberCount: r.subscriberCount,
    hiddenSubscriberCount: r.hiddenSubscriberCount,
    videoCount: r.videoCount,
    viewCount: r.viewCount,
    uploadsPlaylistId: r.uploadsPlaylistId,
    keywords: r.keywords,
    topicCategories: r.topicCategories,
    dataSource: ds(),
    fetchedAt: new Date(),
  };
  const ch = await prisma.channel.upsert({ where: { youtubeId: r.youtubeId }, create: { youtubeId: r.youtubeId, ...data }, update: data });
  // Link the channel to a Person entity (one per normalized channel title).
  if (!ch.personId) {
    const normalizedName = normalizeName(r.title) || r.youtubeId;
    const person = await prisma.person.upsert({ where: { normalizedName }, create: { name: r.title, normalizedName }, update: {} });
    return prisma.channel.update({ where: { id: ch.id }, data: { personId: person.id } });
  }
  return ch;
}

export function classifyContent(r: VideoRecord): ContentType {
  const live = r.details?.liveBroadcastContent;
  if (live === "live") return "LIVE";
  if (live === "upcoming") return "UPCOMING";
  const d = r.details?.durationSeconds;
  // YouTube's API has no "is Short" flag: ≤60s, or ≤3 min tagged #shorts, is treated as a Short.
  if (d !== null && d !== undefined && d > 0 && (d <= 60 || (d <= 180 && /#shorts?\b/i.test(`${r.title} ${r.description}`)))) return "SHORT";
  return "VIDEO";
}

export async function upsertVideos(records: VideoRecord[]): Promise<Video[]> {
  if (!records.length) return [];
  const categories = await provider().getCategories().catch(() => ({}) as Record<string, string>);
  const channels = await prisma.channel.findMany({ where: { youtubeId: { in: [...new Set(records.map((r) => r.channelYoutubeId))] } }, select: { id: true, youtubeId: true } });
  const chanId = new Map(channels.map((c) => [c.youtubeId, c.id]));
  const out: Video[] = [];
  for (const r of records) {
    const base = {
      channelYoutubeId: r.channelYoutubeId,
      channelTitle: r.channelTitle,
      channelId: chanId.get(r.channelYoutubeId) ?? null,
      title: r.title,
      description: r.description,
      thumbnailUrl: r.thumbnailUrl,
      publishedAt: r.publishedAt,
      dataSource: ds(),
    };
    const d = r.details;
    const details = d
      ? {
          durationSeconds: d.durationSeconds,
          viewCount: d.viewCount,
          likeCount: d.likeCount,
          commentCount: d.commentCount,
          tags: d.tags,
          categoryId: d.categoryId,
          categoryName: d.categoryId ? (categories[d.categoryId] ?? null) : null,
          contentType: classifyContent(r),
          liveBroadcastContent: d.liveBroadcastContent,
          embeddable: d.embeddable,
          privacyStatus: d.privacyStatus,
          defaultLanguage: d.defaultLanguage,
          detailsFetchedAt: new Date(),
        }
      : {};
    out.push(await prisma.video.upsert({ where: { youtubeId: r.youtubeId }, create: { youtubeId: r.youtubeId, ...base, ...details }, update: { ...base, ...details } }));
  }
  return out;
}

export async function upsertPlaylists(records: PlaylistRecord[]): Promise<Playlist[]> {
  const channels = await prisma.channel.findMany({ where: { youtubeId: { in: [...new Set(records.map((r) => r.channelYoutubeId))] } }, select: { id: true, youtubeId: true } });
  const chanId = new Map(channels.map((c) => [c.youtubeId, c.id]));
  const out: Playlist[] = [];
  for (const r of records) {
    const data = {
      channelYoutubeId: r.channelYoutubeId,
      channelTitle: r.channelTitle,
      channelId: chanId.get(r.channelYoutubeId) ?? null,
      title: r.title,
      description: r.description,
      thumbnailUrl: r.thumbnailUrl,
      itemCount: r.itemCount,
      publishedAt: r.publishedAt,
      dataSource: ds(),
      fetchedAt: new Date(),
    };
    out.push(await prisma.playlist.upsert({ where: { youtubeId: r.youtubeId }, create: { youtubeId: r.youtubeId, ...data }, update: data }));
  }
  return out;
}

// ─── Channels ───────────────────────────────────────────────────────────────
export async function getChannel(youtubeId: string, opts: { refresh?: boolean } = {}): Promise<Channel> {
  const stored = await prisma.channel.findUnique({ where: { youtubeId } });
  if (stored && !opts.refresh && stored.dataSource === ds() && Date.now() - stored.fetchedAt.getTime() < CHANNEL_TTL_MS) return stored;
  const [rec] = await provider().getChannels({ ids: [youtubeId] });
  if (!rec) {
    if (stored) return stored;
    throw new AppError("CHANNEL_NOT_FOUND");
  }
  return upsertChannel(rec);
}

/** Relevance of a channel to a name query (exact title/handle ≫ partial ≫ audience size). */
export function scoreChannel(c: Pick<ChannelRecord, "title" | "handle" | "subscriberCount">, query: string): number {
  const q = normalizeName(query);
  const t = normalizeName(c.title);
  const h = normalizeName(c.handle ?? "");
  let s = 0;
  if (t === q || h === q) s += 100;
  else if (t.startsWith(q) || h.startsWith(q)) s += 45;
  else if (t.includes(q) || h.includes(q)) s += 25;
  const tokens = query.toLowerCase().split(/\s+/).filter((x) => x.length > 1);
  s += tokens.filter((tok) => c.title.toLowerCase().includes(tok)).length * 5;
  const subs = c.subscriberCount ? Number(c.subscriberCount) : 0;
  s += Math.log10(subs + 1) * 4; // up to ~36 for 1B subscribers
  return s;
}

export interface ResolvedChannel {
  channel: Channel;
  candidates: Channel[];
  method: "id" | "handle" | "cache" | "search";
}

/**
 * Identifies the YouTube channel for a person/creator/channel query.
 * Cheapest path first: channel ID (1 unit) → @handle (1 unit) → recently stored match (0) →
 * handle guess (1 unit, exact match only) → search (100 units) ranked by `scoreChannel`.
 */
export async function resolveChannel(input: { channelId?: string; handle?: string; name?: string }, opts: { withCandidates?: boolean } = {}): Promise<ResolvedChannel> {
  const p = provider();
  if (input.channelId) return { channel: await getChannel(input.channelId), candidates: [], method: "id" };

  if (input.handle) {
    const [rec] = await p.getChannels({ handle: input.handle });
    if (rec) return { channel: await upsertChannel(rec), candidates: [], method: "handle" };
  }

  const name = (input.name ?? input.handle ?? "").replace(/^@/, "").trim();
  if (!name) throw new AppError("INVALID_QUERY");
  const nq = normalizeName(name);

  if (!opts.withCandidates) {
    const cached = await prisma.channel.findFirst({
      where: { dataSource: p.dataSource, fetchedAt: { gte: new Date(Date.now() - CHANNEL_TTL_MS) }, person: { normalizedName: nq } },
      orderBy: { subscriberCount: { sort: "desc", nulls: "last" } },
    });
    if (cached) return { channel: cached, candidates: [], method: "cache" };

    if (/^[a-z0-9._-]{3,30}$/.test(nq) && !input.handle) {
      const [rec] = await p.getChannels({ handle: `@${nq}` }).catch(() => []);
      if (rec && (normalizeName(rec.title) === nq || normalizeName(rec.handle ?? "") === nq)) {
        return { channel: await upsertChannel(rec), candidates: [], method: "handle" };
      }
    }
  }

  const page = await p.searchChannels(name, undefined, 8);
  if (!page.items.length) throw new AppError("CHANNEL_NOT_FOUND", `No YouTube channel matched “${name}”.`);
  const ranked = [...page.items].sort((a, b) => scoreChannel(b, name) - scoreChannel(a, name));
  const stored: Channel[] = [];
  for (const r of ranked) stored.push(await upsertChannel(r));
  return { channel: stored[0]!, candidates: stored.slice(1), method: "search" };
}

// ─── Channel uploads (paginated) ──────────────────────────────────────────────
/** Fetches the next page of a channel's uploads (newest first). */
export async function loadMoreUploads(youtubeId: string): Promise<{ added: number; exhausted: boolean }> {
  const ch = await getChannel(youtubeId);
  if (!ch.uploadsPlaylistId || ch.uploadsExhausted) return { added: 0, exhausted: true };
  const storedCount = await prisma.video.count({ where: { channelYoutubeId: youtubeId } });
  // First page, or continue from the saved token.
  const token = storedCount === 0 ? undefined : (ch.uploadsNextPageToken ?? undefined);
  if (storedCount > 0 && !token) return { added: 0, exhausted: true };
  let page;
  try {
    page = await provider().getPlaylistItems(ch.uploadsPlaylistId, token, UPLOADS_PAGE);
  } catch (err) {
    // A channel with no public uploads has no uploads playlist.
    if (err instanceof AppError && (err.code === "PLAYLIST_NOT_FOUND" || err.code === "NOT_FOUND")) {
      await prisma.channel.update({ where: { id: ch.id }, data: { uploadsExhausted: true } });
      return { added: 0, exhausted: true };
    }
    throw err;
  }
  const records = await provider().getVideos(page.items.map((i) => i.videoId));
  const before = storedCount;
  await upsertVideos(records);
  const after = await prisma.video.count({ where: { channelYoutubeId: youtubeId } });
  await prisma.channel.update({ where: { id: ch.id }, data: { uploadsNextPageToken: page.nextPageToken, uploadsExhausted: !page.nextPageToken } });
  return { added: after - before, exhausted: !page.nextPageToken };
}

export async function ensureUploads(youtubeId: string) {
  const count = await prisma.video.count({ where: { channelYoutubeId: youtubeId } });
  if (count === 0) await loadMoreUploads(youtubeId);
}

export async function listChannelVideos(youtubeId: string, filters: VideoFilters, page = 1, pageSize = 24) {
  const ch = await getChannel(youtubeId);
  await ensureUploads(youtubeId);
  const all = await prisma.video.findMany({ where: { channelYoutubeId: youtubeId } });
  const filtered = applyVideoFilters(all, filters);
  const size = Math.min(Math.max(pageSize, 1), 60);
  const fresh = await prisma.channel.findUniqueOrThrow({ where: { id: ch.id } });
  return {
    items: filtered.slice((page - 1) * size, page * size).map((v) => serializeVideo(v)),
    total: filtered.length,
    loaded: all.length,
    page,
    pageSize: size,
    canLoadMore: !fresh.uploadsExhausted,
    channelVideoCount: fresh.videoCount,
  };
}

/**
 * A channel's most-viewed videos. YouTube's `order=viewCount` search is approximate, so its
 * results are stored alongside the loaded uploads and everything is ranked by real view counts.
 */
export async function topChannelVideosByViews(youtubeId: string, limit = 24, content: "all" | "short" | "video" = "all") {
  await ensureUploads(youtubeId);
  const r = await provider().searchVideos({ channelId: youtubeId, order: "viewCount", maxResults: 50 });
  await upsertVideos(r.items);
  const videos = await prisma.video.findMany({
    where: { channelYoutubeId: youtubeId, ...(content === "short" ? { contentType: "SHORT" } : content === "video" ? { contentType: "VIDEO" } : {}) },
    orderBy: { viewCount: { sort: "desc", nulls: "last" } },
    take: limit,
  });
  return videos;
}

// ─── Playlists ──────────────────────────────────────────────────────────────
export async function channelPlaylists(youtubeId: string, pageToken?: string) {
  const page = await provider().getChannelPlaylists(youtubeId, pageToken);
  const stored = await upsertPlaylists(page.items);
  return { items: stored.map(serializePlaylist), nextPageToken: page.nextPageToken, total: page.totalResults ?? null };
}

export async function searchPlaylists(q: string, pageToken?: string, channelId?: string) {
  const page = await provider().searchPlaylists(q, pageToken, channelId);
  const stored = await upsertPlaylists(page.items);
  return { items: stored.map(serializePlaylist), nextPageToken: page.nextPageToken, total: page.totalResults ?? null };
}

export async function getPlaylist(youtubeId: string, pageToken?: string) {
  let pl = await prisma.playlist.findUnique({ where: { youtubeId } });
  if (!pl || pl.dataSource !== ds() || Date.now() - pl.fetchedAt.getTime() > CHANNEL_TTL_MS) {
    const [rec] = await provider().getPlaylists([youtubeId]);
    if (!rec) throw new AppError("PLAYLIST_NOT_FOUND");
    [pl] = await upsertPlaylists([rec]);
  }
  const page = await provider().getPlaylistItems(youtubeId, pageToken, 25);
  const records = await provider().getVideos(page.items.map((i) => i.videoId));
  const videos = await upsertVideos(records);
  const byYt = new Map(videos.map((v) => [v.youtubeId, v]));
  for (const item of page.items) {
    const v = byYt.get(item.videoId);
    if (v) {
      await prisma.playlistVideo.upsert({
        where: { playlistId_videoId: { playlistId: pl!.id, videoId: v.id } },
        create: { playlistId: pl!.id, videoId: v.id, position: item.position },
        update: { position: item.position },
      });
    }
  }
  // Items YouTube lists but no longer returns details for are private or deleted.
  const unavailable = page.items.filter((i) => !byYt.has(i.videoId)).length;
  return {
    playlist: serializePlaylist(pl!),
    items: page.items.map((i) => byYt.get(i.videoId)).filter((v): v is Video => Boolean(v)).map((v) => serializeVideo(v)),
    unavailable,
    nextPageToken: page.nextPageToken,
    total: page.totalResults ?? pl!.itemCount,
  };
}

// ─── Videos ─────────────────────────────────────────────────────────────────
export async function searchVideos(params: VideoSearchParams) {
  const page = await provider().searchVideos(params);
  const stored = await upsertVideos(page.items);
  return { videos: stored, nextPageToken: page.nextPageToken, total: page.totalResults ?? null };
}

export async function getVideo(youtubeId: string): Promise<VideoDTO> {
  let v = await prisma.video.findUnique({ where: { youtubeId } });
  if (!v || !v.detailsFetchedAt || v.dataSource !== ds() || Date.now() - v.detailsFetchedAt.getTime() > VIDEO_TTL_MS) {
    const [rec] = await provider().getVideos([youtubeId]);
    if (!rec) throw new AppError("VIDEO_UNAVAILABLE");
    [v] = await upsertVideos([rec]);
  }
  const playlists = await prisma.playlist.findMany({ where: { videos: { some: { videoId: v!.id } } }, select: { youtubeId: true, title: true }, take: 10 });
  return serializeVideo(v!, playlists);
}

/**
 * "Related" content. YouTube removed related-video search from the Data API in 2023, so this
 * returns more videos from the same channel and the channel's playlists (no extra quota).
 */
export async function relatedContent(youtubeId: string) {
  const v = await prisma.video.findUnique({ where: { youtubeId } });
  if (!v) throw new AppError("VIDEO_UNAVAILABLE");
  const [videos, playlists] = await Promise.all([
    prisma.video.findMany({ where: { channelYoutubeId: v.channelYoutubeId, NOT: { id: v.id } }, orderBy: { viewCount: { sort: "desc", nulls: "last" } }, take: 12 }),
    prisma.playlist.findMany({ where: { channelYoutubeId: v.channelYoutubeId }, orderBy: { itemCount: { sort: "desc", nulls: "last" } }, take: 8 }),
  ]);
  return { videos: videos.map((x) => serializeVideo(x)), playlists: playlists.map(serializePlaylist) };
}

export async function channelDTO(youtubeId: string, opts: { refresh?: boolean } = {}): Promise<ChannelDTO> {
  const ch = await getChannel(youtubeId, opts);
  const stored = await prisma.video.count({ where: { channelYoutubeId: youtubeId } });
  return serializeChannel(ch, stored);
}

// ─── Comments (public comments via commentThreads — 1 quota unit per page, not stored) ──
export async function videoComments(youtubeId: string, opts: { order: "relevance" | "time"; pageToken?: string; searchTerms?: string }) {
  const page = await provider().getComments(youtubeId, opts);
  return { items: page.items, nextPageToken: page.nextPageToken, dataSource: ds() };
}

export async function commentReplies(parentId: string, pageToken?: string) {
  const page = await provider().getReplies(parentId, pageToken);
  return { items: page.items, nextPageToken: page.nextPageToken };
}

export type { ChannelDTO, PlaylistDTO, VideoDTO };
