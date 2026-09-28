/** calendarService — date-wise intelligence activity (counters kept in calendar_activity). */
import { AppError } from "../lib/errors.js";
import { diffDays, isDayKey } from "../lib/dates.js";
import { prisma } from "../lib/prisma.js";

export async function getCalendarRange(userId: string, from: string, to: string) {
  if (!isDayKey(from) || !isDayKey(to) || from > to || diffDays(from, to) > 400) throw new AppError("INVALID_INPUT", "Use a valid date range of at most ~13 months.");
  const rows = await prisma.calendarActivity.findMany({ where: { userId, day: { gte: from, lte: to } }, orderBy: { day: "asc" } });
  const days = rows.map(({ userId: _u, ...r }) => r);
  const totals = days.reduce(
    (t, d) => ({
      searches: t.searches + d.searches,
      creators: t.creators + d.creators,
      videos: t.videos + d.videos,
      playlists: t.playlists + d.playlists,
      savedVideos: t.savedVideos + d.savedVideos,
      aiSessions: t.aiSessions + d.aiSessions,
    }),
    { searches: 0, creators: 0, videos: 0, playlists: 0, savedVideos: 0, aiSessions: 0 },
  );
  return { from, to, days, totals, activeDays: days.filter((d) => d.searches || d.aiSessions || d.plays || d.savedVideos).length };
}

/** Everything that happened on one day: counters, full search history, AI sessions, saves and plays. */
export async function getCalendarDay(userId: string, day: string) {
  if (!isDayKey(day)) throw new AppError("INVALID_INPUT", "Date must be YYYY-MM-DD.");
  const [counters, searches, aiSessions, events] = await Promise.all([
    prisma.calendarActivity.findUnique({ where: { userId_day: { userId, day } } }),
    prisma.searchHistory.findMany({ where: { userId, day }, orderBy: { createdAt: "desc" } }),
    prisma.aiSession.findMany({ where: { userId, day }, orderBy: { createdAt: "desc" }, include: { _count: { select: { messages: true } } } }),
    prisma.analyticsEvent.findMany({ where: { userId, day, type: { in: ["VIDEO_PLAY", "VIDEO_SAVE", "CHANNEL_SAVE", "PLAYLIST_SAVE", "RESEARCH_SAVE", "RESEARCH_ADD", "WEB_SEARCH"] } }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  const { userId: _u, ...c } = counters ?? { userId, day, searches: 0, creators: 0, videos: 0, playlists: 0, savedVideos: 0, aiSessions: 0, aiQueries: 0, plays: 0 };
  return {
    day,
    counters: c,
    searches: searches.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() })),
    aiSessions: aiSessions.map((s) => ({ id: s.id, title: s.title, messages: s._count.messages, createdAt: s.createdAt.toISOString() })),
    events: events.map((e) => ({ id: e.id, type: e.type, channelTitle: e.channelTitle, channelId: e.channelYoutubeId, videoId: e.videoYoutubeId, playlistId: e.playlistYoutubeId, createdAt: e.createdAt.toISOString() })),
  };
}
