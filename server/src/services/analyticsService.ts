/**
 * analyticsService — KPI summary, activity over time, distributions, per-creator and
 * comparative analytics. Every query is scoped to one user and a [from, to] day range.
 */
import type { Prisma, SearchType, Video } from "@prisma/client";
import { z } from "zod";
import { addDays, bucketOf, diffDays, eachDay, type Granularity } from "../lib/dates.js";
import { prisma } from "../lib/prisma.js";
import { num } from "../lib/sanitize.js";
import { serializeVideo } from "./youtube/serializers.js";
import { engagementRate } from "./youtube/videoFilters.js";
import { ensureUploads, getChannel } from "./youtube/youtubeService.js";

export const rangeSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    channel: z.string().max(40).optional(),
    content: z.enum(["all", "channels", "videos", "playlists"]).default("all"),
  })
  .refine((r) => r.from <= r.to, "from must be on or before to")
  .refine((r) => diffDays(r.from, r.to) <= 1100, "Range is limited to about 3 years");
export type Range = z.infer<typeof rangeSchema>;

const CONTENT_TYPES: Record<string, SearchType[]> = {
  channels: ["PERSON", "CHANNEL", "CHANNEL_ID", "HANDLE"],
  videos: ["VIDEO", "TOPIC"],
  playlists: ["PLAYLIST"],
};

function historyWhere(userId: string, r: Range): Prisma.SearchHistoryWhereInput {
  return {
    userId,
    day: { gte: r.from, lte: r.to },
    ...(r.channel ? { channelYoutubeId: r.channel } : {}),
    ...(r.content !== "all" ? { searchType: { in: CONTENT_TYPES[r.content] } } : {}),
  };
}

async function kpis(userId: string, r: Range) {
  const where = historyWhere(userId, r);
  const [agg, creators, saved, ai, plays] = await Promise.all([
    prisma.searchHistory.aggregate({ where, _count: true, _sum: { videosFound: true, playlistsFound: true } }),
    prisma.searchHistory.groupBy({ by: ["channelYoutubeId"], where: { ...where, channelYoutubeId: r.channel ? r.channel : { not: null } } }),
    prisma.analyticsEvent.count({ where: { userId, type: "VIDEO_SAVE", day: { gte: r.from, lte: r.to }, ...(r.channel ? { channelYoutubeId: r.channel } : {}) } }),
    prisma.aiSession.count({ where: { userId, day: { gte: r.from, lte: r.to } } }),
    prisma.analyticsEvent.count({ where: { userId, type: "VIDEO_PLAY", day: { gte: r.from, lte: r.to }, ...(r.channel ? { channelYoutubeId: r.channel } : {}) } }),
  ]);
  return {
    totalSearches: agg._count,
    creatorsResearched: creators.length,
    videosFound: agg._sum.videosFound ?? 0,
    playlistsFound: agg._sum.playlistsFound ?? 0,
    savedVideos: saved,
    aiSessions: ai,
    videoPlays: plays,
  };
}

export async function getSummary(userId: string, r: Range) {
  const len = diffDays(r.from, r.to) + 1;
  const prev = { ...r, from: addDays(r.from, -len), to: addDays(r.from, -1) };
  const [current, previous, totals] = await Promise.all([
    kpis(userId, r),
    kpis(userId, prev),
    prisma.$transaction([
      prisma.savedVideo.count({ where: { userId } }),
      prisma.savedChannel.count({ where: { userId } }),
      prisma.savedPlaylist.count({ where: { userId } }),
      prisma.savedResearch.count({ where: { userId } }),
    ]),
  ]);
  return {
    range: { from: r.from, to: r.to },
    previousRange: { from: prev.from, to: prev.to },
    current,
    previous,
    saved: { videos: totals[0], channels: totals[1], playlists: totals[2], research: totals[3] },
  };
}

export async function getActivity(userId: string, r: Range, granularity: Granularity) {
  const rows = await prisma.searchHistory.findMany({
    where: historyWhere(userId, r),
    select: { day: true, videosFound: true, playlistsFound: true, channelsFound: true, channelYoutubeId: true },
  });
  const ai = await prisma.analyticsEvent.groupBy({ by: ["day"], where: { userId, type: "AI_QUERY", day: { gte: r.from, lte: r.to } }, _count: true });

  const buckets = new Map<string, { bucket: string; searches: number; videosFound: number; channelsFound: number; playlistsFound: number; aiQueries: number; creators: Set<string> }>();
  for (const d of eachDay(r.from, r.to)) {
    const b = bucketOf(d, granularity);
    if (!buckets.has(b)) buckets.set(b, { bucket: b, searches: 0, videosFound: 0, channelsFound: 0, playlistsFound: 0, aiQueries: 0, creators: new Set() });
  }
  for (const row of rows) {
    const b = buckets.get(bucketOf(row.day, granularity));
    if (!b) continue;
    b.searches++;
    b.videosFound += row.videosFound;
    b.playlistsFound += row.playlistsFound;
    b.channelsFound += row.channelsFound;
    if (row.channelYoutubeId) b.creators.add(row.channelYoutubeId);
  }
  for (const a of ai) {
    const b = buckets.get(bucketOf(a.day, granularity));
    if (b) b.aiQueries += a._count;
  }
  return {
    granularity,
    range: { from: r.from, to: r.to },
    points: [...buckets.values()].map(({ creators, ...b }) => ({ ...b, creators: creators.size })),
  };
}

export const DIMENSIONS = ["searchesByCreator", "videosByCreator", "videosByContentType", "searchCategories", "savedVideos", "playlistsDiscovered"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

const SEARCH_TYPE_LABEL: Record<SearchType, string> = {
  PERSON: "Person",
  CHANNEL: "Channel",
  CHANNEL_ID: "Channel ID",
  HANDLE: "@handle",
  VIDEO: "Videos",
  PLAYLIST: "Playlists",
  TOPIC: "Topic",
};
const CONTENT_LABEL: Record<string, string> = { VIDEO: "Videos", SHORT: "Shorts", LIVE: "Live", UPCOMING: "Upcoming" };

function topN(counts: Map<string, { label: string; value: number }>, n = 6) {
  const sorted = [...counts.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, n);
  const rest = sorted.slice(n).reduce((s, x) => s + x.value, 0);
  if (rest > 0) head.push({ key: "__other", label: "Other", value: rest });
  const total = head.reduce((s, x) => s + x.value, 0);
  return { total, slices: head.map((x) => ({ ...x, percent: total ? Math.round((x.value / total) * 1000) / 10 : 0 })) };
}

export async function getDistribution(userId: string, dimension: Dimension, r: Range) {
  const counts = new Map<string, { label: string; value: number }>();
  const add = (key: string, label: string, v = 1) => {
    const c = counts.get(key) ?? { label, value: 0 };
    c.value += v;
    counts.set(key, c);
  };
  // Discoveries/saves carry timestamps rather than day keys; UTC day bounds are used for them.
  const start = new Date(`${r.from}T00:00:00Z`);
  const end = new Date(`${addDays(r.to, 1)}T00:00:00Z`);

  if (dimension === "searchesByCreator") {
    const rows = await prisma.searchHistory.findMany({ where: { ...historyWhere(userId, r), channelYoutubeId: r.channel ?? { not: null } }, select: { channelYoutubeId: true, entityName: true } });
    for (const row of rows) add(row.channelYoutubeId!, row.entityName ?? row.channelYoutubeId!);
  } else if (dimension === "searchCategories") {
    const rows = await prisma.searchHistory.groupBy({ by: ["searchType"], where: historyWhere(userId, r), _count: true });
    for (const row of rows) add(row.searchType, SEARCH_TYPE_LABEL[row.searchType], row._count);
  } else if (dimension === "videosByCreator" || dimension === "videosByContentType") {
    const disc = await prisma.userDiscovery.findMany({ where: { userId, kind: "VIDEO", lastSeenAt: { gte: start, lt: end } }, select: { youtubeId: true }, take: 5000 });
    const vids = await prisma.video.findMany({
      where: { youtubeId: { in: disc.map((d) => d.youtubeId) }, ...(r.channel ? { channelYoutubeId: r.channel } : {}) },
      select: { channelYoutubeId: true, channelTitle: true, contentType: true },
    });
    for (const v of vids) dimension === "videosByCreator" ? add(v.channelYoutubeId, v.channelTitle) : add(v.contentType, CONTENT_LABEL[v.contentType] ?? v.contentType);
  } else if (dimension === "savedVideos") {
    const saved = await prisma.savedVideo.findMany({ where: { userId, createdAt: { gte: start, lt: end } }, include: { video: { select: { channelYoutubeId: true, channelTitle: true } } } });
    for (const s of saved) if (!r.channel || s.video.channelYoutubeId === r.channel) add(s.video.channelYoutubeId, s.video.channelTitle);
  } else if (dimension === "playlistsDiscovered") {
    const disc = await prisma.userDiscovery.findMany({ where: { userId, kind: "PLAYLIST", lastSeenAt: { gte: start, lt: end } }, select: { youtubeId: true }, take: 5000 });
    const pls = await prisma.playlist.findMany({ where: { youtubeId: { in: disc.map((d) => d.youtubeId) }, ...(r.channel ? { channelYoutubeId: r.channel } : {}) }, select: { channelYoutubeId: true, channelTitle: true } });
    for (const p of pls) add(p.channelYoutubeId, p.channelTitle);
  }
  return { dimension, range: { from: r.from, to: r.to }, ...topN(counts) };
}

/** Channels this user has searched (for the creator filter). */
export async function searchedCreators(userId: string) {
  const rows = await prisma.searchHistory.groupBy({ by: ["channelYoutubeId", "entityName"], where: { userId, channelYoutubeId: { not: null } }, _count: true, orderBy: { _count: { channelYoutubeId: "desc" } }, take: 50 });
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.channelYoutubeId!) ? false : (seen.add(r.channelYoutubeId!), true))).map((r) => ({ id: r.channelYoutubeId!, title: r.entityName ?? r.channelYoutubeId!, searches: r._count }));
}

// ─── Creator analytics (from stored public video statistics) ─────────────────
function videoStats(videos: Video[]) {
  const withViews = videos.filter((v) => v.viewCount !== null);
  const totalViews = withViews.reduce((s, v) => s + Number(v.viewCount), 0);
  const rates = videos.map(engagementRate).filter((x): x is number => x !== null);
  return {
    count: videos.length,
    totalViews,
    avgViews: withViews.length ? Math.round(totalViews / withViews.length) : null,
    avgEngagement: rates.length ? Math.round((rates.reduce((s, x) => s + x, 0) / rates.length) * 100) / 100 : null,
  };
}

export async function creatorAnalytics(userId: string, youtubeId: string) {
  const ch = await getChannel(youtubeId);
  await ensureUploads(youtubeId);
  const videos = await prisma.video.findMany({ where: { channelYoutubeId: youtubeId } });
  const byMonth = new Map<string, { month: string; uploads: number; views: number }>();
  for (const v of videos) {
    if (!v.publishedAt) continue;
    const m = v.publishedAt.toISOString().slice(0, 7);
    const b = byMonth.get(m) ?? { month: m, uploads: 0, views: 0 };
    b.uploads++;
    b.views += Number(v.viewCount ?? 0n);
    byMonth.set(m, b);
  }
  const content = new Map<string, number>();
  for (const v of videos) content.set(v.contentType, (content.get(v.contentType) ?? 0) + 1);
  const [searches, lastSearch] = await Promise.all([
    prisma.searchHistory.count({ where: { userId, channelYoutubeId: youtubeId } }),
    prisma.searchHistory.findFirst({ where: { userId, channelYoutubeId: youtubeId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  return {
    channelId: youtubeId,
    title: ch.title,
    subscriberCount: num(ch.subscriberCount),
    channelVideoCount: ch.videoCount,
    channelViewCount: num(ch.viewCount),
    stats: videoStats(videos),
    uploadsByMonth: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-18),
    contentTypes: [...content.entries()].map(([type, count]) => ({ type, label: CONTENT_LABEL[type] ?? type, count })),
    topVideos: [...videos].sort((a, b) => Number((b.viewCount ?? 0n) - (a.viewCount ?? 0n))).slice(0, 10).map((v) => serializeVideo(v)),
    yourSearches: searches,
    lastSearchedAt: lastSearch?.createdAt.toISOString() ?? null,
  };
}

/** Side-by-side comparison of creators over the last `days` days (based on loaded uploads). */
export async function compareCreators(channelIds: string[], days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  const out = [];
  for (const id of channelIds.slice(0, 8)) {
    const ch = await getChannel(id);
    await ensureUploads(id);
    const videos = await prisma.video.findMany({ where: { channelYoutubeId: id } });
    const recent = videos.filter((v) => v.publishedAt && v.publishedAt >= since);
    const top = [...recent].sort((a, b) => Number((b.viewCount ?? 0n) - (a.viewCount ?? 0n)))[0];
    out.push({
      channelId: id,
      title: ch.title,
      thumbnailUrl: ch.thumbnailUrl,
      subscriberCount: num(ch.subscriberCount),
      channelViewCount: num(ch.viewCount),
      channelVideoCount: ch.videoCount,
      loadedVideos: videos.length,
      window: { days, ...videoStats(recent), shorts: recent.filter((v) => v.contentType === "SHORT").length },
      allLoaded: videoStats(videos),
      topVideo: top ? serializeVideo(top) : null,
    });
  }
  return { days, since: since.toISOString(), creators: out };
}
