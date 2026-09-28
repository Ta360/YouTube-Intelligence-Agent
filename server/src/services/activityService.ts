/**
 * Records user activity: analytics events, date-wise calendar counters and the per-user
 * "discoveries" that make library pages (Videos / Channels / Playlists) private per account.
 */
import type { ContentType, EntityKind, EventType, Prisma, SearchSource, SearchStatus, SearchType } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { dayKey } from "../lib/dates.js";
import { getYouTubeProvider } from "./youtube/provider.js";

type CalendarField = "searches" | "creators" | "videos" | "playlists" | "savedVideos" | "aiSessions" | "aiQueries" | "plays";

export async function bumpCalendar(userId: string, day: string, inc: Partial<Record<CalendarField, number>>) {
  const increments = Object.fromEntries(Object.entries(inc).filter(([, v]) => v).map(([k, v]) => [k, { increment: v }]));
  if (!Object.keys(increments).length) return;
  await prisma.calendarActivity.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day, ...(inc as Record<CalendarField, number>) },
    update: increments,
  });
}

export async function recordEvent(
  userId: string,
  tz: string,
  type: EventType,
  data: Omit<Prisma.AnalyticsEventUncheckedCreateInput, "userId" | "type" | "day"> = {},
) {
  const day = dayKey(new Date(), tz);
  await prisma.analyticsEvent.create({ data: { userId, type, day, ...data } });
  const inc: Partial<Record<CalendarField, number>> = {};
  if (type === "VIDEO_PLAY") inc.plays = 1;
  if (type === "VIDEO_SAVE") inc.savedVideos = 1;
  if (type === "AI_SESSION") inc.aiSessions = 1;
  if (type === "AI_QUERY") inc.aiQueries = 1;
  await bumpCalendar(userId, day, inc);
  return day;
}

/** Marks catalog records as seen by this user (insert new, bump existing). */
export async function recordDiscoveries(userId: string, kind: EntityKind, youtubeIds: string[]) {
  const ids = [...new Set(youtubeIds.filter(Boolean))];
  if (!ids.length) return;
  const now = new Date();
  await prisma.userDiscovery.createMany({ data: ids.map((youtubeId) => ({ userId, kind, youtubeId, firstSeenAt: now, lastSeenAt: now })), skipDuplicates: true });
  await prisma.userDiscovery.updateMany({ where: { userId, kind, youtubeId: { in: ids }, lastSeenAt: { lt: now } }, data: { lastSeenAt: now, timesSeen: { increment: 1 } } });
}

export interface SearchRecordInput {
  userId: string;
  tz: string;
  query: string;
  searchType: SearchType;
  source: SearchSource;
  status: SearchStatus;
  errorCode?: string;
  entityName?: string | null;
  channelYoutubeId?: string | null;
  channelTitle?: string | null;
  videoIds?: string[];
  playlistIds?: string[];
  channelIds?: string[];
  contentType?: ContentType | null;
  clientSessionId?: string | null;
}

/** Stores a search in history + analytics + calendar. Never throws (search results matter more). */
export async function recordSearch(i: SearchRecordInput): Promise<string | null> {
  try {
    const day = dayKey(new Date(), i.tz);
    const videosFound = i.videoIds?.length ?? 0;
    const playlistsFound = i.playlistIds?.length ?? 0;
    const channelIds = [...new Set([...(i.channelIds ?? []), ...(i.channelYoutubeId ? [i.channelYoutubeId] : [])])];
    const channelsFound = channelIds.length;

    // A creator counts once per day in the calendar.
    const newCreatorToday =
      i.channelYoutubeId && i.status === "SUCCESS"
        ? !(await prisma.searchHistory.findFirst({ where: { userId: i.userId, day, channelYoutubeId: i.channelYoutubeId, status: "SUCCESS" }, select: { id: true } }))
        : false;

    const row = await prisma.searchHistory.create({
      data: {
        userId: i.userId,
        clientSessionId: i.clientSessionId ?? null,
        query: i.query.slice(0, 200),
        searchType: i.searchType,
        entityName: i.entityName?.slice(0, 120) ?? null,
        channelYoutubeId: i.channelYoutubeId ?? null,
        resultCount: videosFound + playlistsFound + channelsFound,
        videosFound,
        playlistsFound,
        channelsFound,
        source: i.source,
        status: i.status,
        errorCode: i.errorCode ?? null,
        dataSource: getYouTubeProvider().dataSource,
        day,
      },
    });
    await prisma.analyticsEvent.create({
      data: {
        userId: i.userId,
        type: "SEARCH",
        day,
        channelYoutubeId: i.channelYoutubeId ?? null,
        channelTitle: i.channelTitle ?? i.entityName ?? null,
        category: i.searchType,
        contentType: i.contentType ?? null,
        videosFound,
        playlistsFound,
        channelsFound,
      },
    });
    await bumpCalendar(i.userId, day, { searches: 1, videos: videosFound, playlists: playlistsFound, creators: newCreatorToday ? 1 : 0 });
    await Promise.all([
      recordDiscoveries(i.userId, "VIDEO", i.videoIds ?? []),
      recordDiscoveries(i.userId, "PLAYLIST", i.playlistIds ?? []),
      recordDiscoveries(i.userId, "CHANNEL", channelIds),
    ]);
    return row.id;
  } catch (err) {
    logger.error("search.record_failed", { error: String((err as Error)?.message ?? err) });
    return null;
  }
}
