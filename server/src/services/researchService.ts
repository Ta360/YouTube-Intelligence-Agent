/**
 * researchService — saved videos/creators/playlists/research, the research workspace
 * (sessions with multiple creators, videos and playlists), per-user library pages and
 * search history. Every function is scoped to the signed-in user.
 */
import type { EntityKind, Prisma, SavedResearchKind, SearchStatus, SearchType } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { recordDiscoveries, recordEvent } from "./activityService.js";
import { serializeChannel, serializePlaylist, serializeVideo } from "./youtube/serializers.js";
import { applyVideoFilters, type VideoFilters } from "./youtube/videoFilters.js";
import { getChannel, getPlaylist, getVideo } from "./youtube/youtubeService.js";

// ─── Saved items ─────────────────────────────────────────────────────────────
async function videoRow(youtubeId: string) {
  await getVideo(youtubeId); // ensures it exists (and is available) in the catalog
  return prisma.video.findUniqueOrThrow({ where: { youtubeId } });
}

export async function saveVideo(userId: string, tz: string, youtubeId: string, note?: string) {
  const v = await videoRow(youtubeId);
  const existing = await prisma.savedVideo.findUnique({ where: { userId_videoId: { userId, videoId: v.id } } });
  if (existing) return { saved: true, created: false };
  await prisma.savedVideo.create({ data: { userId, videoId: v.id, note: note ?? null } });
  await recordEvent(userId, tz, "VIDEO_SAVE", { videoYoutubeId: v.youtubeId, channelYoutubeId: v.channelYoutubeId, channelTitle: v.channelTitle, contentType: v.contentType });
  await recordDiscoveries(userId, "VIDEO", [v.youtubeId]);
  return { saved: true, created: true };
}

export async function unsaveVideo(userId: string, youtubeId: string) {
  const v = await prisma.video.findUnique({ where: { youtubeId } });
  if (v) await prisma.savedVideo.deleteMany({ where: { userId, videoId: v.id } });
  return { saved: false };
}

export async function saveChannel(userId: string, tz: string, youtubeId: string) {
  const ch = await getChannel(youtubeId);
  const r = await prisma.savedChannel.createMany({ data: [{ userId, channelId: ch.id }], skipDuplicates: true });
  if (r.count) await recordEvent(userId, tz, "CHANNEL_SAVE", { channelYoutubeId: ch.youtubeId, channelTitle: ch.title });
  await recordDiscoveries(userId, "CHANNEL", [ch.youtubeId]);
  return { saved: true, created: r.count > 0 };
}

export async function unsaveChannel(userId: string, youtubeId: string) {
  const ch = await prisma.channel.findUnique({ where: { youtubeId } });
  if (ch) await prisma.savedChannel.deleteMany({ where: { userId, channelId: ch.id } });
  return { saved: false };
}

export async function savePlaylist(userId: string, tz: string, youtubeId: string) {
  let pl = await prisma.playlist.findUnique({ where: { youtubeId } });
  if (!pl) {
    await getPlaylist(youtubeId);
    pl = await prisma.playlist.findUniqueOrThrow({ where: { youtubeId } });
  }
  const r = await prisma.savedPlaylist.createMany({ data: [{ userId, playlistId: pl.id }], skipDuplicates: true });
  if (r.count) await recordEvent(userId, tz, "PLAYLIST_SAVE", { playlistYoutubeId: pl.youtubeId, channelYoutubeId: pl.channelYoutubeId, channelTitle: pl.channelTitle });
  await recordDiscoveries(userId, "PLAYLIST", [pl.youtubeId]);
  return { saved: true, created: r.count > 0 };
}

export async function unsavePlaylist(userId: string, youtubeId: string) {
  const pl = await prisma.playlist.findUnique({ where: { youtubeId } });
  if (pl) await prisma.savedPlaylist.deleteMany({ where: { userId, playlistId: pl.id } });
  return { saved: false };
}

export const savedResearchSchema = z.object({
  kind: z.enum(["SEARCH", "AI_SESSION", "RESEARCH_SESSION", "CREATOR", "NOTE"]),
  title: z.string().trim().min(1).max(160),
  query: z.string().trim().max(200).optional(),
  refId: z.string().max(64).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export async function saveResearch(userId: string, tz: string, input: z.infer<typeof savedResearchSchema>) {
  const payloadSize = input.payload ? JSON.stringify(input.payload).length : 0;
  if (payloadSize > 200_000) throw new AppError("INVALID_INPUT", "Research payload is too large.");
  const row = await prisma.savedResearch.create({
    data: { userId, kind: input.kind as SavedResearchKind, title: input.title, query: input.query ?? null, refId: input.refId ?? null, payload: (input.payload ?? undefined) as Prisma.InputJsonValue | undefined },
  });
  await recordEvent(userId, tz, "RESEARCH_SAVE", { category: input.kind });
  return row;
}

export async function deleteSavedResearch(userId: string, id: string) {
  const r = await prisma.savedResearch.deleteMany({ where: { id, userId } });
  if (!r.count) throw new AppError("NOT_FOUND");
  return { removed: true };
}

export async function listSaved(userId: string) {
  const [videos, channels, playlists, research] = await Promise.all([
    prisma.savedVideo.findMany({ where: { userId }, include: { video: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.savedChannel.findMany({ where: { userId }, include: { channel: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.savedPlaylist.findMany({ where: { userId }, include: { playlist: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.savedResearch.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  return {
    videos: videos.map((s) => ({ savedAt: s.createdAt.toISOString(), note: s.note, video: serializeVideo(s.video) })),
    channels: channels.map((s) => ({ savedAt: s.createdAt.toISOString(), channel: serializeChannel(s.channel) })),
    playlists: playlists.map((s) => ({ savedAt: s.createdAt.toISOString(), playlist: serializePlaylist(s.playlist) })),
    research: research.map((r) => ({ id: r.id, kind: r.kind, title: r.title, query: r.query, refId: r.refId, payload: r.payload, createdAt: r.createdAt.toISOString() })),
  };
}

/** IDs of everything this user saved (lets the UI show "Saved" states cheaply). */
export async function savedIds(userId: string) {
  const [v, c, p] = await Promise.all([
    prisma.savedVideo.findMany({ where: { userId }, select: { video: { select: { youtubeId: true } } } }),
    prisma.savedChannel.findMany({ where: { userId }, select: { channel: { select: { youtubeId: true } } } }),
    prisma.savedPlaylist.findMany({ where: { userId }, select: { playlist: { select: { youtubeId: true } } } }),
  ]);
  return { videos: v.map((x) => x.video.youtubeId), channels: c.map((x) => x.channel.youtubeId), playlists: p.map((x) => x.playlist.youtubeId) };
}

// ─── Research workspace ────────────────────────────────────────────────────
export const sessionSchema = z.object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(500).optional() });
export const itemSchema = z.object({ kind: z.enum(["CHANNEL", "VIDEO", "PLAYLIST"]), youtubeId: z.string().min(5).max(64) });

async function ownSession(userId: string, id: string) {
  const s = await prisma.researchSession.findFirst({ where: { id, userId } });
  if (!s) throw new AppError("NOT_FOUND", "Research session not found.");
  return s;
}

export async function listSessions(userId: string) {
  const rows = await prisma.researchSession.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, include: { items: { orderBy: { addedAt: "asc" } } } });
  return rows.map((s) => ({ ...s, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString(), items: s.items.map((i) => ({ ...i, addedAt: i.addedAt.toISOString() })) }));
}

export async function createSession(userId: string, input: z.infer<typeof sessionSchema>) {
  return prisma.researchSession.create({ data: { userId, name: input.name, description: input.description ?? null } });
}

export async function updateSession(userId: string, id: string, input: Partial<z.infer<typeof sessionSchema>>) {
  await ownSession(userId, id);
  return prisma.researchSession.update({ where: { id }, data: input });
}

export async function deleteSession(userId: string, id: string) {
  await ownSession(userId, id);
  await prisma.researchSession.delete({ where: { id } });
  return { removed: true };
}

export async function addItem(userId: string, tz: string, sessionId: string, input: z.infer<typeof itemSchema>) {
  await ownSession(userId, sessionId);
  let title = "";
  let thumbnailUrl: string | null = null;
  if (input.kind === "CHANNEL") {
    const c = await getChannel(input.youtubeId);
    title = c.title;
    thumbnailUrl = c.thumbnailUrl;
  } else if (input.kind === "VIDEO") {
    const v = await getVideo(input.youtubeId);
    title = v.title;
    thumbnailUrl = v.thumbnailUrl;
  } else {
    const p = (await prisma.playlist.findUnique({ where: { youtubeId: input.youtubeId } })) ?? (await getPlaylist(input.youtubeId), await prisma.playlist.findUniqueOrThrow({ where: { youtubeId: input.youtubeId } }));
    title = p.title;
    thumbnailUrl = p.thumbnailUrl;
  }
  const item = await prisma.researchItem.upsert({
    where: { sessionId_kind_youtubeId: { sessionId, kind: input.kind as EntityKind, youtubeId: input.youtubeId } },
    create: { sessionId, kind: input.kind as EntityKind, youtubeId: input.youtubeId, title, thumbnailUrl },
    update: { title, thumbnailUrl },
  });
  await prisma.researchSession.update({ where: { id: sessionId }, data: { updatedAt: new Date() } });
  await recordEvent(userId, tz, "RESEARCH_ADD", { category: input.kind, ...(input.kind === "CHANNEL" ? { channelYoutubeId: input.youtubeId, channelTitle: title } : {}) });
  return item;
}

export async function removeItem(userId: string, sessionId: string, itemId: string) {
  await ownSession(userId, sessionId);
  await prisma.researchItem.deleteMany({ where: { id: itemId, sessionId } });
  return { removed: true };
}

export async function sessionChannelIds(userId: string, sessionId: string) {
  await ownSession(userId, sessionId);
  const items = await prisma.researchItem.findMany({ where: { sessionId, kind: "CHANNEL" }, orderBy: { addedAt: "asc" } });
  return items.map((i) => i.youtubeId);
}

// ─── Library (this user's discoveries) ───────────────────────────────────────
export async function libraryVideos(userId: string, filters: VideoFilters, page = 1, pageSize = 24) {
  const disc = await prisma.userDiscovery.findMany({ where: { userId, kind: "VIDEO" }, orderBy: { lastSeenAt: "desc" }, take: 3000, select: { youtubeId: true } });
  const videos = await prisma.video.findMany({ where: { youtubeId: { in: disc.map((d) => d.youtubeId) } } });
  const filtered = applyVideoFilters(videos, filters);
  const size = Math.min(Math.max(pageSize, 1), 60);
  return { items: filtered.slice((page - 1) * size, page * size).map((v) => serializeVideo(v)), total: filtered.length, page, pageSize: size };
}

export async function libraryChannels(userId: string, q?: string) {
  const disc = await prisma.userDiscovery.findMany({ where: { userId, kind: "CHANNEL" }, orderBy: { lastSeenAt: "desc" }, take: 500 });
  const channels = await prisma.channel.findMany({ where: { youtubeId: { in: disc.map((d) => d.youtubeId) }, ...(q ? { title: { contains: q, mode: "insensitive" } } : {}) } });
  const byId = new Map(channels.map((c) => [c.youtubeId, c]));
  const searches = await prisma.searchHistory.groupBy({ by: ["channelYoutubeId"], where: { userId, channelYoutubeId: { in: channels.map((c) => c.youtubeId) } }, _count: true });
  const count = new Map(searches.map((s) => [s.channelYoutubeId, s._count]));
  return disc
    .filter((d) => byId.has(d.youtubeId))
    .map((d) => ({ ...serializeChannel(byId.get(d.youtubeId)!), lastSeenAt: d.lastSeenAt.toISOString(), searches: count.get(d.youtubeId) ?? 0 }));
}

export async function libraryPlaylists(userId: string, q?: string, channelId?: string) {
  const disc = await prisma.userDiscovery.findMany({ where: { userId, kind: "PLAYLIST" }, orderBy: { lastSeenAt: "desc" }, take: 1000 });
  const pls = await prisma.playlist.findMany({
    where: { youtubeId: { in: disc.map((d) => d.youtubeId) }, ...(q ? { title: { contains: q, mode: "insensitive" } } : {}), ...(channelId ? { channelYoutubeId: channelId } : {}) },
  });
  const byId = new Map(pls.map((p) => [p.youtubeId, p]));
  return disc.filter((d) => byId.has(d.youtubeId)).map((d) => ({ ...serializePlaylist(byId.get(d.youtubeId)!), lastSeenAt: d.lastSeenAt.toISOString() }));
}

// ─── Search history ────────────────────────────────────────────────────────
export const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(100).optional(),
  type: z.enum(["PERSON", "CHANNEL", "CHANNEL_ID", "HANDLE", "VIDEO", "PLAYLIST", "TOPIC"]).optional(),
  status: z.enum(["SUCCESS", "NO_RESULTS", "ERROR", "QUOTA_EXCEEDED", "INVALID"]).optional(),
  source: z.enum(["GLOBAL_SEARCH", "SEARCH_PAGE", "AI_AGENT", "HISTORY", "RESEARCH"]).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  channel: z.string().max(40).optional(),
});

export function historyWhere(userId: string, q: z.infer<typeof historyQuerySchema>): Prisma.SearchHistoryWhereInput {
  return {
    userId,
    ...(q.q ? { OR: [{ query: { contains: q.q, mode: "insensitive" } }, { entityName: { contains: q.q, mode: "insensitive" } }] } : {}),
    ...(q.type ? { searchType: q.type as SearchType } : {}),
    ...(q.status ? { status: q.status as SearchStatus } : {}),
    ...(q.source ? { source: q.source } : {}),
    ...(q.channel ? { channelYoutubeId: q.channel } : {}),
    ...(q.from || q.to ? { day: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
  };
}

export async function listHistory(userId: string, q: z.infer<typeof historyQuerySchema>) {
  const where = historyWhere(userId, q);
  const [items, total] = await Promise.all([
    prisma.searchHistory.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.searchHistory.count({ where }),
  ]);
  return { items: items.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() })), total, page: q.page, pageSize: q.pageSize };
}

export async function deleteHistory(userId: string, id: string) {
  const r = await prisma.searchHistory.deleteMany({ where: { id, userId } });
  if (!r.count) throw new AppError("NOT_FOUND", "Search not found.");
  return { removed: true };
}

export async function recentSearches(userId: string, limit = 8) {
  const rows = await prisma.searchHistory.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 40, select: { query: true, searchType: true, entityName: true, createdAt: true } });
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.query.toLowerCase()) ? false : (seen.add(r.query.toLowerCase()), true))).slice(0, limit).map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}
