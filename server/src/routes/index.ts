import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { addDays, dayKey } from "../lib/dates.js";
import { prisma } from "../lib/prisma.js";
import { YT_CHANNEL_ID_RE, YT_PLAYLIST_ID_RE, YT_VIDEO_ID_RE } from "../lib/sanitize.js";
import { agentLimiter, attachUser, loginLimiter, requireAuth, searchLimiter, tzOf, uid } from "../middleware/index.js";
import { recordDiscoveries, recordEvent } from "../services/activityService.js";
import * as ai from "../services/ai/aiService.js";
import * as analytics from "../services/analyticsService.js";
import { REMEMBER_TTL_MS, SESSION_COOKIE, SESSION_TTL_MS, changePassword, createSessionToken, login, signOutEverywhere, signup, signupOpen } from "../services/authService.js";
import { getCalendarDay, getCalendarRange } from "../services/calendarService.js";
import * as research from "../services/researchService.js";
import { runSearch, searchFiltersSchema, searchRequestSchema, videoSearch } from "../services/searchService.js";
import { chartColorsPatchSchema, DEFAULT_CHART_COLORS, getChartColors, resetChartColors, updateChartColors } from "../services/settingsService.js";
import { getConfigOverview, getSystemStatus } from "../services/systemService.js";
import { webSearch } from "../services/web/webSearchService.js";
import { demoAvatarSvg, demoThumbSvg } from "../services/youtube/mockProvider.js";
import { videoFilterSchema } from "../services/youtube/videoFilters.js";
import * as yt from "../services/youtube/youtubeService.js";

type Handler = (req: Request, res: Response) => Promise<unknown>;
/** Wraps async handlers: resolved values become JSON, errors go to the error handler. */
const h =
  (fn: Handler) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res)
      .then((body) => {
        if (!res.headersSent && body !== undefined) res.json(body);
      })
      .catch(next);

const channelIdParam = (req: Request) => {
  const id = String(req.params.id);
  if (!YT_CHANNEL_ID_RE.test(id)) throw new AppError("INVALID_INPUT", "Invalid YouTube channel ID.");
  return id;
};
const videoIdParam = (req: Request) => {
  const id = String(req.params.id);
  if (!YT_VIDEO_ID_RE.test(id)) throw new AppError("INVALID_INPUT", "Invalid YouTube video ID.");
  return id;
};
const playlistIdParam = (req: Request) => {
  const id = String(req.params.id);
  if (!YT_PLAYLIST_ID_RE.test(id)) throw new AppError("INVALID_INPUT", "Invalid YouTube playlist ID.");
  return id;
};
/** YouTube page tokens are opaque base64-like strings; accept that shape only. */
const PAGE_TOKEN_RE = /^[A-Za-z0-9_=+/.-]{1,4000}$/;
const pageToken = (v: unknown) => (typeof v === "string" && PAGE_TOKEN_RE.test(v) ? v : undefined);
const paging = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(60).default(24) });

/** ?from&to (defaults to the last 30 days in the user's timezone). */
function rangeOf(req: Request) {
  const today = dayKey(new Date(), tzOf(req));
  return analytics.rangeSchema.parse({ from: req.query.from ?? addDays(today, -29), to: req.query.to ?? today, channel: req.query.channel || undefined, content: req.query.content || undefined });
}

export function buildRouter() {
  const api = Router();

  // ── Public ─────────────────────────────────────────────────────────────
  api.get("/health", (_req, res) => res.json({ ok: true }));
  api.get("/demo-assets/avatar/:name", (req, res) => {
    const name = String(req.params.name).replace(/\.svg$/, "").slice(0, 40);
    res.type("image/svg+xml").set("Cache-Control", "public, max-age=86400").send(demoAvatarSvg(name));
  });
  api.get("/demo-assets/thumb/:id", (req, res) => {
    const id = String(req.params.id).replace(/\.svg$/, "");
    if (!/^[A-Za-z0-9_-]{6,40}$/.test(id)) return res.status(400).end();
    res.type("image/svg+xml").set("Cache-Control", "public, max-age=86400").send(demoThumbSvg(id));
  });

  // ── Accounts ───────────────────────────────────────────────────────────
  api.use(attachUser);
  const setSession = (res: Response, userId: string, version: number, remember: boolean) => {
    const ttl = remember ? REMEMBER_TTL_MS : SESSION_TTL_MS;
    res.cookie(SESSION_COOKIE, createSessionToken(userId, version, ttl), { httpOnly: true, sameSite: "lax", secure: env.isProduction, path: "/", ...(remember ? { maxAge: ttl } : {}) });
  };
  const clearSession = (res: Response) => res.clearCookie(SESSION_COOKIE, { path: "/", httpOnly: true, sameSite: "lax", secure: env.isProduction });

  api.get("/auth/status", h(async (req) => ({ authenticated: Boolean(req.user), user: req.user ?? null, signupOpen: await signupOpen() })));
  api.post(
    "/auth/signup",
    loginLimiter,
    h(async (req, res) => {
      const { user, sessionVersion } = await signup(req.body);
      setSession(res, user.id, sessionVersion, false);
      res.status(201);
      return { authenticated: true, user };
    }),
  );
  api.post(
    "/auth/login",
    loginLimiter,
    h(async (req, res) => {
      const { user, sessionVersion, remember } = await login(req.body);
      setSession(res, user.id, sessionVersion, remember);
      return { authenticated: true, user };
    }),
  );
  api.post("/auth/logout", (_req, res) => {
    clearSession(res);
    res.json({ authenticated: false });
  });
  api.post(
    "/auth/logout-all",
    requireAuth,
    h(async (req, res) => {
      await signOutEverywhere(uid(req));
      clearSession(res);
      return { authenticated: false };
    }),
  );
  api.post(
    "/auth/change-password",
    loginLimiter,
    requireAuth,
    h(async (req, res) => {
      const { sessionVersion } = await changePassword(uid(req), req.body);
      setSession(res, uid(req), sessionVersion, false);
      return { changed: true };
    }),
  );

  // ── Everything below requires a signed-in account ───────────────────────
  api.use(requireAuth);

  // Unified intelligent search
  api.post("/search", searchLimiter, h(async (req) => runSearch(uid(req), tzOf(req), searchRequestSchema.parse(req.body ?? {}))));

  // YouTube: videos search pagination (Load more)
  api.get(
    "/youtube/search/videos",
    searchLimiter,
    h(async (req) => {
      const q = z
        .object({
          q: z.string().trim().max(200).optional(),
          channelId: z.string().regex(YT_CHANNEL_ID_RE).optional(),
          order: z.enum(["relevance", "date", "viewCount", "rating"]).default("relevance"),
          publishedAfter: z.string().max(30).optional(),
          publishedBefore: z.string().max(30).optional(),
          videoDuration: z.enum(["any", "short", "medium", "long"]).optional(),
          eventType: z.enum(["live", "upcoming", "completed"]).optional(),
          pageToken: z.string().regex(PAGE_TOKEN_RE).optional(),
          sort: z.string().max(20).default("relevance"),
        })
        .parse(req.query);
      if (!q.q && !q.channelId) throw new AppError("INVALID_QUERY");
      const f = searchFiltersSchema.parse({ content: "all", minViews: req.query.minViews, minLikes: req.query.minLikes, minComments: req.query.minComments });
      const r = await videoSearch({ ...q, maxResults: 24 }, f, q.sort);
      await recordDiscoveries(uid(req), "VIDEO", r.items.map((v) => v.id));
      return r;
    }),
  );

  // Channels
  api.get(
    "/youtube/channels/search",
    searchLimiter,
    h(async (req) => {
      const q = z.string().trim().min(1).max(100).parse(req.query.q);
      const r = await yt.resolveChannel({ name: q }, { withCandidates: true });
      const items = [r.channel, ...r.candidates].map((c) => ({ ...c }));
      await recordDiscoveries(uid(req), "CHANNEL", items.map((c) => c.youtubeId));
      return { items: await Promise.all(items.map((c) => yt.channelDTO(c.youtubeId))) };
    }),
  );
  api.get(
    "/youtube/channels/:id",
    h(async (req) => {
      const c = await yt.channelDTO(channelIdParam(req), { refresh: req.query.refresh === "1" });
      await recordDiscoveries(uid(req), "CHANNEL", [c.id]);
      return c;
    }),
  );
  api.get(
    "/youtube/channels/:id/videos",
    h(async (req) => {
      const id = channelIdParam(req);
      const f = videoFilterSchema.parse(req.query);
      const p = paging.parse(req.query);
      const r = await yt.listChannelVideos(id, f, p.page, p.pageSize);
      await recordDiscoveries(uid(req), "VIDEO", r.items.map((v) => v.id));
      return r;
    }),
  );
  api.post("/youtube/channels/:id/videos/more", searchLimiter, h(async (req) => yt.loadMoreUploads(channelIdParam(req))));
  api.get(
    "/youtube/channels/:id/playlists",
    h(async (req) => {
      const r = await yt.channelPlaylists(channelIdParam(req), pageToken(req.query.pageToken));
      await recordDiscoveries(uid(req), "PLAYLIST", r.items.map((p) => p.id));
      return r;
    }),
  );
  api.get("/youtube/channels/:id/analytics", h(async (req) => analytics.creatorAnalytics(uid(req), channelIdParam(req))));
  api.get(
    "/youtube/channels/:id/searches",
    h(async (req) => research.listHistory(uid(req), research.historyQuerySchema.parse({ ...req.query, channel: channelIdParam(req) }))),
  );

  // Videos
  api.get(
    "/youtube/videos/:id",
    h(async (req) => {
      const v = await yt.getVideo(videoIdParam(req));
      await recordDiscoveries(uid(req), "VIDEO", [v.id]);
      return v;
    }),
  );
  api.get("/youtube/videos/:id/related", h(async (req) => yt.relatedContent(videoIdParam(req))));
  api.get(
    "/youtube/videos/:id/comments",
    h(async (req) => {
      const q = z
        .object({
          order: z.enum(["relevance", "time"]).default("relevance"),
          pageToken: z.string().regex(PAGE_TOKEN_RE).optional(),
          q: z.string().trim().max(100).optional(),
        })
        .parse(req.query);
      return yt.videoComments(videoIdParam(req), { order: q.order, pageToken: q.pageToken, searchTerms: q.q || undefined });
    }),
  );
  api.get(
    "/youtube/comments/:id/replies",
    h(async (req) => {
      const id = String(req.params.id);
      if (!/^[A-Za-z0-9_.-]{5,120}$/.test(id)) throw new AppError("INVALID_INPUT", "Invalid comment ID.");
      return yt.commentReplies(id, pageToken(req.query.pageToken));
    }),
  );
  api.post(
    "/youtube/videos/:id/play",
    h(async (req, res) => {
      const id = videoIdParam(req);
      const v = await prisma.video.findUnique({ where: { youtubeId: id } });
      await recordEvent(uid(req), tzOf(req), "VIDEO_PLAY", { videoYoutubeId: id, channelYoutubeId: v?.channelYoutubeId, channelTitle: v?.channelTitle, contentType: v?.contentType });
      res.status(201);
      return { ok: true };
    }),
  );

  // Playlists
  api.get(
    "/youtube/playlists/search",
    searchLimiter,
    h(async (req) => {
      const q = z.string().trim().min(1).max(200).parse(req.query.q);
      const r = await yt.searchPlaylists(q, pageToken(req.query.pageToken));
      await recordDiscoveries(uid(req), "PLAYLIST", r.items.map((p) => p.id));
      return r;
    }),
  );
  api.get(
    "/youtube/playlists/:id",
    h(async (req) => {
      const r = await yt.getPlaylist(playlistIdParam(req), pageToken(req.query.pageToken));
      await recordDiscoveries(uid(req), "PLAYLIST", [r.playlist.id]);
      await recordDiscoveries(uid(req), "VIDEO", r.items.map((v) => v.id));
      return r;
    }),
  );

  // Web research
  api.get(
    "/web/search",
    searchLimiter,
    h(async (req) => {
      const q = z.string().trim().min(1).max(200).parse(req.query.q);
      const items = await webSearch(q, { videos: req.query.videos === "1" });
      await recordEvent(uid(req), tzOf(req), "WEB_SEARCH", {});
      return { items };
    }),
  );

  // Library (this user's discoveries)
  api.get(
    "/library/videos",
    h(async (req) => {
      const p = paging.parse(req.query);
      return research.libraryVideos(uid(req), videoFilterSchema.parse(req.query), p.page, p.pageSize);
    }),
  );
  api.get("/library/channels", h(async (req) => ({ items: await research.libraryChannels(uid(req), typeof req.query.q === "string" ? req.query.q.slice(0, 100) : undefined) })));
  api.get(
    "/library/playlists",
    h(async (req) => ({
      items: await research.libraryPlaylists(uid(req), typeof req.query.q === "string" ? req.query.q.slice(0, 100) : undefined, typeof req.query.channel === "string" && YT_CHANNEL_ID_RE.test(req.query.channel) ? req.query.channel : undefined),
    })),
  );

  // Search history
  api.get("/history", h(async (req) => research.listHistory(uid(req), research.historyQuerySchema.parse(req.query))));
  api.get("/history/recent", h(async (req) => ({ items: await research.recentSearches(uid(req), 8) })));
  api.delete("/history/:id", h(async (req) => research.deleteHistory(uid(req), String(req.params.id))));

  // Saved
  api.get("/saved", h(async (req) => research.listSaved(uid(req))));
  api.get("/saved/ids", h(async (req) => research.savedIds(uid(req))));
  const idBody = (kind: "video" | "channel" | "playlist") => (req: Request) => {
    const re = kind === "video" ? YT_VIDEO_ID_RE : kind === "channel" ? YT_CHANNEL_ID_RE : YT_PLAYLIST_ID_RE;
    return z.object({ id: z.string().regex(re, `Invalid ${kind} ID.`), note: z.string().max(500).optional() }).parse(req.body ?? {});
  };
  api.post("/saved/videos", h(async (req, res) => (res.status(201), research.saveVideo(uid(req), tzOf(req), idBody("video")(req).id, idBody("video")(req).note))));
  api.delete("/saved/videos/:id", h(async (req) => research.unsaveVideo(uid(req), videoIdParam(req))));
  api.post("/saved/channels", h(async (req, res) => (res.status(201), research.saveChannel(uid(req), tzOf(req), idBody("channel")(req).id))));
  api.delete("/saved/channels/:id", h(async (req) => research.unsaveChannel(uid(req), channelIdParam(req))));
  api.post("/saved/playlists", h(async (req, res) => (res.status(201), research.savePlaylist(uid(req), tzOf(req), idBody("playlist")(req).id))));
  api.delete("/saved/playlists/:id", h(async (req) => research.unsavePlaylist(uid(req), playlistIdParam(req))));
  api.post("/saved/research", h(async (req, res) => (res.status(201), research.saveResearch(uid(req), tzOf(req), research.savedResearchSchema.parse(req.body ?? {})))));
  api.delete("/saved/research/:id", h(async (req) => research.deleteSavedResearch(uid(req), String(req.params.id))));

  // Research workspace
  api.get("/research/sessions", h(async (req) => ({ items: await research.listSessions(uid(req)) })));
  api.post("/research/sessions", h(async (req, res) => (res.status(201), research.createSession(uid(req), research.sessionSchema.parse(req.body ?? {})))));
  api.patch("/research/sessions/:id", h(async (req) => research.updateSession(uid(req), String(req.params.id), research.sessionSchema.partial().parse(req.body ?? {}))));
  api.delete("/research/sessions/:id", h(async (req) => research.deleteSession(uid(req), String(req.params.id))));
  api.post("/research/sessions/:id/items", h(async (req, res) => (res.status(201), research.addItem(uid(req), tzOf(req), String(req.params.id), research.itemSchema.parse(req.body ?? {})))));
  api.delete("/research/sessions/:id/items/:itemId", h(async (req) => research.removeItem(uid(req), String(req.params.id), String(req.params.itemId))));
  api.get(
    "/research/sessions/:id/compare",
    h(async (req) => {
      const ids = await research.sessionChannelIds(uid(req), String(req.params.id));
      if (!ids.length) return { days: 30, since: null, creators: [] };
      const days = z.coerce.number().int().min(1).max(365).default(30).parse(req.query.days);
      return analytics.compareCreators(ids, days);
    }),
  );

  // Analytics
  api.get("/analytics/summary", h(async (req) => analytics.getSummary(uid(req), rangeOf(req))));
  api.get(
    "/analytics/activity",
    h(async (req) => analytics.getActivity(uid(req), rangeOf(req), z.enum(["day", "week", "month", "year"]).default("day").parse(req.query.granularity))),
  );
  api.get("/analytics/distribution", h(async (req) => analytics.getDistribution(uid(req), z.enum(analytics.DIMENSIONS).parse(req.query.dimension ?? "searchesByCreator"), rangeOf(req))));
  api.get("/analytics/creators", h(async (req) => ({ items: await analytics.searchedCreators(uid(req)) })));

  // Calendar
  api.get(
    "/calendar",
    h(async (req) => {
      const today = dayKey(new Date(), tzOf(req));
      return getCalendarRange(uid(req), String(req.query.from ?? `${today.slice(0, 7)}-01`), String(req.query.to ?? today));
    }),
  );
  api.get("/calendar/day/:date", h(async (req) => getCalendarDay(uid(req), String(req.params.date))));

  // AI Intelligence Agent
  api.post("/agent/chat", agentLimiter, h(async (req) => ai.chat(uid(req), tzOf(req), ai.agentRequestSchema.parse(req.body ?? {}))));
  api.get("/agent/sessions", h(async (req) => ({ items: await ai.listSessions(uid(req)) })));
  api.get("/agent/sessions/:id", h(async (req) => ai.getSession(uid(req), String(req.params.id))));
  api.delete("/agent/sessions/:id", h(async (req) => ai.deleteSession(uid(req), String(req.params.id))));

  // Settings
  api.get("/settings/chart-colors", h(async (req) => ({ colors: await getChartColors(uid(req)), defaults: DEFAULT_CHART_COLORS })));
  api.put("/settings/chart-colors", h(async (req) => ({ colors: await updateChartColors(uid(req), chartColorsPatchSchema.parse(req.body ?? {})) })));
  api.post("/settings/chart-colors/reset", h(async (req) => ({ colors: await resetChartColors(uid(req)) })));
  api.get("/settings/config", h(async () => getConfigOverview()));

  // System status & notifications
  api.get("/system/status", h(async () => getSystemStatus()));
  api.get(
    "/notifications",
    h(async (req) => {
      const since = new Date(Date.now() - 24 * 3600_000);
      const [errors, status, failed] = await Promise.all([
        prisma.apiUsage.groupBy({ by: ["provider", "errorCode"], where: { ok: false, createdAt: { gte: since } }, _count: true, _max: { createdAt: true } }),
        getSystemStatus(),
        prisma.searchHistory.findMany({ where: { userId: uid(req), status: { in: ["ERROR", "QUOTA_EXCEEDED"] }, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 5 }),
      ]);
      const items: { id: string; level: "info" | "warning" | "error"; title: string; detail: string; at: string }[] = [];
      const pct = status.quota.usedToday / status.quota.dailyLimit;
      if (status.dataSource === "youtube" && pct >= 0.8)
        items.push({ id: "quota", level: pct >= 1 ? "error" : "warning", title: "YouTube quota", detail: `${status.quota.usedToday.toLocaleString()} of ${status.quota.dailyLimit.toLocaleString()} units used today (UTC).`, at: status.checkedAt });
      if (status.dataSource === "mock") items.push({ id: "demo", level: "info", title: "Demo mode", detail: "YOUTUBE_API_KEY is not set — results are labelled demo data.", at: status.checkedAt });
      for (const e of errors) items.push({ id: `${e.provider}-${e.errorCode}`, level: "error", title: `${e.provider === "youtube" ? "YouTube API" : e.provider === "web" ? "Web search" : "AI provider"} error`, detail: `${e.errorCode ?? "Error"} × ${e._count} in the last 24h`, at: (e._max.createdAt ?? new Date()).toISOString() });
      for (const f of failed) items.push({ id: f.id, level: "warning", title: "Search failed", detail: `“${f.query}” — ${f.errorCode ?? f.status}`, at: f.createdAt.toISOString() });
      return { items: items.sort((a, b) => b.at.localeCompare(a.at)) };
    }),
  );

  return api;
}
