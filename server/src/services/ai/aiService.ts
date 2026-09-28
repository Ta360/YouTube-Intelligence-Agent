/**
 * aiService — the AI Intelligence Agent.
 *
 * Workflow for every request:
 *  1. understand the request (LLM JSON plan, or the local parser)
 *  2–5. identify the channel and retrieve its public videos / playlists via the YouTube Data API
 *  6. search the web only when the user asks for broader research
 *  7–8. de-duplicate and rank
 *  9. return a structured ResearchResult the dashboard renders as cards (PLAY loads the player)
 *  10–11. record the search + AI session (analytics, calendar, history)
 */
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { AppError, errorMessage } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { recordEvent, recordSearch } from "../activityService.js";
import { compareCreators, getSummary } from "../analyticsService.js";
import { recentSearches } from "../researchService.js";
import { getYouTubeProvider } from "../youtube/provider.js";
import { serializeChannel, serializeVideo, type ChannelDTO, type PlaylistDTO, type VideoDTO } from "../youtube/serializers.js";
import type { SearchOrder } from "../youtube/types.js";
import { applyVideoFilters, videoFilterSchema } from "../youtube/videoFilters.js";
import * as yt from "../youtube/youtubeService.js";
import { webSearch, webSearchConfigured, type WebResult } from "../web/webSearchService.js";
import { getLlm, type LlmMessage } from "./llmProvider.js";
import { planRequest, todayFor, type AgentContext, type ResearchPlan } from "./planner.js";

export const agentRequestSchema = z.object({
  message: z.string().trim().min(1, "Type a message.").max(1000),
  sessionId: z.string().max(40).optional(),
  context: z
    .object({
      channelId: z.string().regex(/^UC[A-Za-z0-9_-]{22}$/).optional(),
      videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/).optional(),
    })
    .default({}),
});

export type ResultSource = "YouTube" | "Web Search" | "Playlist" | "Channel";
export type SourcedVideo = VideoDTO & { source: ResultSource };
export type SourcedPlaylist = PlaylistDTO & { source: ResultSource };

export interface ResearchResult {
  kind: "research";
  title: string;
  person: string | null;
  channel: ChannelDTO | null;
  candidates: ChannelDTO[];
  videosFound: number;
  videosShown: number;
  playlistsFound: number;
  latestVideo: SourcedVideo | null;
  videos: SourcedVideo[];
  playlists: SourcedPlaylist[];
  web: WebResult[];
  filters: string[];
  warnings: string[];
  dataSource: "youtube" | "mock";
}
export interface CompareResult {
  kind: "compare";
  title: string;
  comparison: Awaited<ReturnType<typeof compareCreators>>;
  warnings: string[];
  dataSource: "youtube" | "mock";
}
export interface ActivityResult {
  kind: "activity";
  title: string;
  summary: Awaited<ReturnType<typeof getSummary>>;
  recent: Awaited<ReturnType<typeof recentSearches>>;
}
export type AgentPayload = ResearchResult | CompareResult | ActivityResult | { kind: "help" };

const ORDER: Record<string, SearchOrder> = { relevance: "relevance", newest: "date", oldest: "date", views: "viewCount", likes: "rating", comments: "relevance" };
const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "n/a" : Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n));

export const HELP_TEXT = [
  "I can research YouTube (and the web when you ask). Try:",
  "- Find all videos from MrBeast",
  "- Show me the latest videos from this creator",
  "- Find playlists related to this person",
  "- Find the most viewed videos from this channel",
  "- Find videos about AI from this creator",
  "- Compare this creator's videos over the last 30 days",
  "- Search YouTube and the web for Taylor Swift",
  "- What did I search this week?",
].join("\n");

// ─── Workflow ────────────────────────────────────────────────────────────────
async function research(userId: string, tz: string, plan: ResearchPlan, ctx: AgentContext, rawMessage: string): Promise<ResearchResult> {
  const dataSource = getYouTubeProvider().dataSource;
  const result: ResearchResult = {
    kind: "research",
    title: "Research Result",
    person: null,
    channel: null,
    candidates: [],
    videosFound: 0,
    videosShown: 0,
    playlistsFound: 0,
    latestVideo: null,
    videos: [],
    playlists: [],
    web: [],
    filters: [],
    warnings: [],
    dataSource,
  };
  const sort = plan.sort ?? "relevance";
  if (plan.dateFrom || plan.dateTo) result.filters.push(`Published ${plan.dateFrom ?? "…"} → ${plan.dateTo ?? "…"}`);
  if (plan.contentType) result.filters.push(plan.contentType === "short" ? "Shorts only" : "Live only");
  if (plan.sort && plan.sort !== "relevance") result.filters.push(`Sorted by ${plan.sort}`);
  if (plan.topic) result.filters.push(`Topic: ${plan.topic}`);

  // 1–3) Identify the entity/channel.
  let channel: ChannelDTO | null = null;
  const entity = plan.entity?.trim() || null;
  if (entity || plan.useContext) {
    try {
      let resolved: yt.ResolvedChannel;
      if (!entity && plan.useContext) {
        if (!ctx.channelId) throw new AppError("INVALID_QUERY", "Which creator do you mean? Open a creator first, or name them in your message.");
        resolved = await yt.resolveChannel({ channelId: ctx.channelId });
      } else {
        const i = entity!;
        resolved = await yt.resolveChannel(/^UC[A-Za-z0-9_-]{22}$/.test(i) ? { channelId: i } : i.startsWith("@") ? { handle: i } : { name: i });
      }
      channel = await yt.channelDTO(resolved.channel.youtubeId);
      result.channel = channel;
      result.candidates = resolved.candidates.slice(0, 4).map((c) => serializeChannel(c));
      result.person = entity ?? channel.title;
    } catch (err) {
      if (err instanceof AppError && err.code === "CHANNEL_NOT_FOUND") {
        result.warnings.push(`No YouTube channel clearly matched “${entity}”. Showing videos that mention it instead.`);
        result.person = entity;
      } else throw err;
    }
  }

  const contentFilter = plan.contentType === "short" ? "short" : plan.contentType === "live" ? "live" : "all";
  const publishedAfter = plan.dateFrom ? `${plan.dateFrom}T00:00:00Z` : undefined;
  const publishedBefore = plan.dateTo ? `${plan.dateTo}T23:59:59Z` : undefined;
  const postSort = (vs: Awaited<ReturnType<typeof yt.searchVideos>>["videos"]) =>
    applyVideoFilters(vs, videoFilterSchema.parse({ sort: sort === "relevance" ? "relevance" : sort, content: contentFilter }));

  // 4) Videos.
  if (plan.wantVideos) {
    if (channel) {
      const plain = !plan.topic && !publishedAfter && !publishedBefore && plan.contentType !== "live";
      if (plain && sort === "views") {
        // Channel-wide "most viewed": YouTube's viewCount search merged with loaded uploads, ranked by real views.
        const vs = await yt.topChannelVideosByViews(channel.id, 24, contentFilter === "short" ? "short" : "all");
        result.videos = vs.map((v) => ({ ...serializeVideo(v), source: "YouTube" as const }));
        result.videosFound = channel.videoCount ?? vs.length;
        result.filters.push("Ranked channel-wide by view count");
      } else if (!plain) {
        // Topic, date window or live: search YouTube scoped to the channel (loaded uploads only cover recent videos).
        const r = await yt.searchVideos({
          channelId: channel.id,
          q: plan.topic ?? undefined,
          order: plan.topic ? (ORDER[sort] ?? "relevance") : ORDER[sort] === "relevance" ? "date" : ORDER[sort],
          publishedAfter,
          publishedBefore,
          eventType: plan.contentType === "live" ? "live" : undefined,
          maxResults: 24,
        });
        const vs = postSort(r.videos);
        result.videos = vs.map((v) => ({ ...serializeVideo(v), source: "YouTube" as const }));
        result.videosFound = r.total ?? vs.length;
      } else {
        const list = await yt.listChannelVideos(channel.id, videoFilterSchema.parse({ sort: sort === "relevance" ? "newest" : sort, content: contentFilter }), 1, 24);
        result.videos = list.items.map((v) => ({ ...v, source: "YouTube" as const }));
        result.videosFound = channel.videoCount ?? list.total;
        if (list.canLoadMore) result.warnings.push(`Showing ${list.items.length} of ${fmt(channel.videoCount)} videos (sorted among the ${list.loaded} most recent uploads). Open the creator profile and use Load more for older uploads.`);
        channel = await yt.channelDTO(channel.id);
        result.channel = channel;
      }
    } else {
      const q = [plan.topic, entity].filter(Boolean).join(" ").trim() || rawMessage;
      const r = await yt.searchVideos({ q, order: ORDER[sort] ?? "relevance", publishedAfter, publishedBefore, videoDuration: plan.contentType === "short" ? "short" : undefined, eventType: plan.contentType === "live" ? "live" : undefined, maxResults: 24 });
      const vs = postSort(r.videos);
      result.videos = vs.map((v) => ({ ...serializeVideo(v), source: "YouTube" as const }));
      result.videosFound = r.total ?? vs.length;
    }
  }

  // 5) Playlists.
  if (plan.wantPlaylists || channel) {
    try {
      if (channel) {
        const pl = await yt.channelPlaylists(channel.id);
        result.playlists = pl.items.map((p) => ({ ...p, source: "Channel" as const }));
        result.playlistsFound = pl.total ?? pl.items.length;
      }
      if (plan.wantPlaylists && (!channel || plan.topic)) {
        const q = [channel?.title ?? entity, plan.topic].filter(Boolean).join(" ") || rawMessage;
        const pl = await yt.searchPlaylists(q);
        result.playlists.push(...pl.items.map((p) => ({ ...p, source: "Playlist" as const })));
        result.playlistsFound += pl.items.length;
      }
    } catch (err) {
      result.warnings.push(`Playlists: ${errorMessage(err)}`);
    }
  }

  // 6) Web research — only when explicitly requested.
  if (plan.wantWeb) {
    if (!webSearchConfigured()) {
      result.warnings.push("Web search is not configured (WEB_SEARCH_API_KEY), so only YouTube was searched.");
    } else {
      const subject = [channel?.title ?? entity, plan.topic].filter(Boolean).join(" ") || rawMessage;
      try {
        const [pages, videos] = await Promise.all([webSearch(subject), webSearch(subject, { videos: true }).catch(() => [] as WebResult[])]);
        result.web = [...videos, ...pages];
        await recordEvent(userId, tz, "WEB_SEARCH", { channelYoutubeId: channel?.id, channelTitle: channel?.title ?? entity });
        // YouTube videos discovered on the web become playable dashboard cards (1 quota unit).
        const ytIds = [...new Set(result.web.map((w) => w.youtube?.videoId).filter((x): x is string => Boolean(x)))].filter((id) => !result.videos.some((v) => v.id === id)).slice(0, 20);
        if (ytIds.length) {
          const recs = await getYouTubeProvider().getVideos(ytIds);
          const stored = await yt.upsertVideos(recs);
          result.videos.push(...stored.map((v) => ({ ...serializeVideo(v), source: "Web Search" as const })));
        }
      } catch (err) {
        result.warnings.push(errorMessage(err));
      }
    }
  }

  // 7–8) De-duplicate (first occurrence wins, so YouTube ranking is preserved).
  const seenV = new Set<string>();
  result.videos = result.videos.filter((v) => (seenV.has(v.id) ? false : (seenV.add(v.id), true)));
  const seenP = new Set<string>();
  result.playlists = result.playlists.filter((p) => (seenP.has(p.id) ? false : (seenP.add(p.id), true)));
  const seenW = new Set<string>();
  result.web = result.web.filter((w) => (seenW.has(w.url) ? false : (seenW.add(w.url), true)));
  result.videosShown = result.videos.length;
  result.videosFound = Math.max(result.videosFound, result.videos.length);
  result.playlistsFound = Math.max(result.playlistsFound, result.playlists.length);
  result.latestVideo = [...result.videos].filter((v) => v.publishedAt).sort((a, b) => Date.parse(b.publishedAt!) - Date.parse(a.publishedAt!))[0] ?? null;
  result.title = channel ? `Research: ${channel.title}` : `Research: ${plan.topic ?? entity ?? rawMessage}`.slice(0, 120);
  return result;
}

async function compare(plan: ResearchPlan, ctx: AgentContext): Promise<CompareResult> {
  const ids: string[] = [];
  const warnings: string[] = [];
  if (plan.useContext) {
    if (ctx.channelId) ids.push(ctx.channelId);
    else warnings.push("No creator is open, so “this creator” could not be included.");
  }
  for (const name of plan.compareEntities ?? []) {
    try {
      const r = await yt.resolveChannel(/^UC[A-Za-z0-9_-]{22}$/.test(name) ? { channelId: name } : name.startsWith("@") ? { handle: name } : { name });
      if (!ids.includes(r.channel.youtubeId)) ids.push(r.channel.youtubeId);
    } catch (err) {
      warnings.push(`${name}: ${errorMessage(err)}`);
    }
  }
  if (!ids.length) throw new AppError("INVALID_QUERY", "Tell me which creators to compare, e.g. “Compare MrBeast and Veritasium over the last 30 days”.");
  const comparison = await compareCreators(ids, plan.days ?? 30);
  return {
    kind: "compare",
    title: comparison.creators.length === 1 ? `${comparison.creators[0]!.title}: last ${comparison.days} days` : `Comparison: ${comparison.creators.map((c) => c.title).join(" vs ")}`,
    comparison,
    warnings,
    dataSource: getYouTubeProvider().dataSource,
  };
}

// ─── Replies ─────────────────────────────────────────────────────────────────
function templateReply(p: AgentPayload): string {
  if (p.kind === "help") return HELP_TEXT;
  if (p.kind === "activity") {
    const c = p.summary.current;
    return `Between ${p.summary.range.from} and ${p.summary.range.to} you ran ${c.totalSearches} searches, researched ${c.creatorsResearched} creators, found ${c.videosFound} videos and ${c.playlistsFound} playlists, saved ${c.savedVideos} videos and held ${c.aiSessions} AI research sessions.${p.recent.length ? ` Recent: ${p.recent.slice(0, 5).map((r) => `“${r.query}”`).join(", ")}.` : ""}`;
  }
  if (p.kind === "compare") {
    return p.comparison.creators
      .map(
        (c) =>
          `${c.title}: ${fmt(c.subscriberCount)} subscribers · ${c.window.count} uploads in the last ${p.comparison.days} days (${c.window.shorts} Shorts) · avg ${fmt(c.window.avgViews)} views · engagement ${c.window.avgEngagement ?? "n/a"}%${c.topVideo ? ` · top: “${c.topVideo.title}” (${fmt(c.topVideo.viewCount)} views)` : ""}`,
      )
      .join("\n");
  }
  const lines: string[] = [];
  if (p.channel) lines.push(`Identified channel ${p.channel.title}${p.channel.handle ? ` (${p.channel.handle})` : ""} — ${fmt(p.channel.subscriberCount)} subscribers, ${fmt(p.channel.videoCount)} videos.`);
  lines.push(`Found ${fmt(p.videosFound)} videos (showing ${p.videosShown}) and ${p.playlistsFound} playlists.`);
  if (p.latestVideo) lines.push(`Latest: “${p.latestVideo.title}”.`);
  if (p.web.length) lines.push(`Web search returned ${p.web.length} results — these are third-party sources and are not verified.`);
  if (p.candidates.length) lines.push(`Other possible channels: ${p.candidates.map((c) => c.title).join(", ")}.`);
  return lines.join(" ");
}

async function llmReply(message: string, p: AgentPayload): Promise<string | null> {
  const llm = getLlm();
  if (!llm || p.kind === "help") return null;
  const condensed =
    p.kind === "research"
      ? {
          channel: p.channel && { title: p.channel.title, handle: p.channel.handle, subscribers: p.channel.subscriberCount, videos: p.channel.videoCount, views: p.channel.viewCount },
          otherPossibleChannels: p.candidates.map((c) => c.title),
          videosFound: p.videosFound,
          playlistsFound: p.playlistsFound,
          filters: p.filters,
          videos: p.videos.slice(0, 10).map((v) => ({ title: v.title, channel: v.channelTitle, published: v.publishedAt?.slice(0, 10), views: v.viewCount, source: v.source })),
          playlists: p.playlists.slice(0, 5).map((x) => ({ title: x.title, items: x.itemCount })),
          webResults_UNVERIFIED: p.web.slice(0, 6).map((w) => ({ title: w.title, domain: w.domain, snippet: w.snippet.slice(0, 200) })),
          warnings: p.warnings,
          demoData: p.dataSource === "mock",
        }
      : p;
  try {
    const text = await llm.complete(
      [
        {
          role: "system",
          content:
            "You are the AI Intelligence Agent in a YouTube research dashboard. Summarize the research data you are given in 2–5 short sentences of plain text (no Markdown headings or tables). Use ONLY the provided data; never invent numbers, videos or facts. Web results are third-party and unverified — attribute them to their domain and never present them as verified facts. If demoData is true say the data is demo data. The dashboard already shows the result cards, so don't list every video.",
        },
        { role: "user", content: `Request: ${message}\n\nData: ${JSON.stringify(condensed).slice(0, 12_000)}` },
      ],
      { maxTokens: 350, temperature: 0.3 },
    );
    return text.trim() || null;
  } catch (err) {
    logger.warn("agent.reply_failed", { error: String((err as Error)?.message ?? err) });
    return null;
  }
}

// ─── Sessions ────────────────────────────────────────────────────────────────
async function sessionFor(userId: string, tz: string, sessionId: string | undefined, message: string) {
  if (sessionId) {
    const s = await prisma.aiSession.findFirst({ where: { id: sessionId, userId } });
    if (s) return s;
  }
  const s = await prisma.aiSession.create({ data: { userId, title: message.slice(0, 80), day: todayFor(tz) } });
  await recordEvent(userId, tz, "AI_SESSION", {});
  return s;
}

export async function chat(userId: string, tz: string, input: z.infer<typeof agentRequestSchema>) {
  const session = await sessionFor(userId, tz, input.sessionId, input.message);
  const history = await prisma.aiMessage.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: "desc" }, take: 8 });
  await prisma.aiMessage.create({ data: { sessionId: session.id, role: "user", content: input.message } });

  const ctx: AgentContext = { today: todayFor(tz), tz, channelId: input.context.channelId, videoId: input.context.videoId };
  if (ctx.channelId) {
    const ch = await prisma.channel.findUnique({ where: { youtubeId: ctx.channelId }, select: { title: true } });
    ctx.channelTitle = ch?.title;
  }
  const llmHistory: LlmMessage[] = history.reverse().map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content.slice(0, 1500) }));
  const { plan, engine } = await planRequest(input.message, llmHistory, ctx);
  await recordEvent(userId, tz, "AI_QUERY", { category: plan.action, channelYoutubeId: ctx.channelId ?? null });

  let payload: AgentPayload;
  let error: string | null = null;
  try {
    if (plan.action === "help") payload = { kind: "help" };
    else if (plan.action === "activity") {
      const to = ctx.today;
      const days = plan.days ?? 7;
      const from = new Date(Date.parse(`${to}T00:00:00Z`) - (days - 1) * 86_400_000).toISOString().slice(0, 10);
      payload = { kind: "activity", title: `Your activity: last ${days} day${days === 1 ? "" : "s"}`, summary: await getSummary(userId, { from, to, content: "all" }), recent: await recentSearches(userId, 8) };
    } else if (plan.action === "compare") payload = await compare(plan, ctx);
    else payload = await research(userId, tz, plan, ctx, input.message);
  } catch (err) {
    error = errorMessage(err);
    payload = { kind: "help" };
    if (plan.action === "research") {
      await recordSearch({ userId, tz, query: input.message, searchType: "TOPIC", source: "AI_AGENT", status: err instanceof AppError && err.code === "QUOTA_EXCEEDED" ? "QUOTA_EXCEEDED" : "ERROR", errorCode: err instanceof AppError ? err.code : "INTERNAL" });
    }
  }

  // 10–11) Record the research as a search (history, analytics, calendar).
  if (!error && payload.kind === "research") {
    await recordSearch({
      userId,
      tz,
      query: input.message,
      searchType: payload.channel ? (plan.topic || plan.wantVideos ? "VIDEO" : "CHANNEL") : plan.wantPlaylists && !plan.wantVideos ? "PLAYLIST" : "TOPIC",
      source: "AI_AGENT",
      status: payload.videos.length || payload.playlists.length || payload.channel ? "SUCCESS" : "NO_RESULTS",
      entityName: payload.channel?.title ?? payload.person,
      channelYoutubeId: payload.channel?.id ?? null,
      channelTitle: payload.channel?.title ?? null,
      videoIds: payload.videos.map((v) => v.id),
      playlistIds: payload.playlists.map((p) => p.id),
      channelIds: payload.candidates.map((c) => c.id),
    });
  }

  const reply = error ?? (await llmReply(input.message, payload)) ?? templateReply(payload);
  const replyEngine = error ? "error" : getLlm() && payload.kind !== "help" ? "llm" : "local";
  const saved = await prisma.aiMessage.create({
    data: { sessionId: session.id, role: "assistant", content: reply, engine: `${engine}/${replyEngine}`, payload: payload as unknown as Prisma.InputJsonValue },
  });
  await prisma.aiSession.update({ where: { id: session.id }, data: { updatedAt: new Date() } });
  return {
    sessionId: session.id,
    sessionTitle: session.title,
    plan,
    engine,
    message: { id: saved.id, role: "assistant" as const, content: reply, payload, error: Boolean(error), createdAt: saved.createdAt.toISOString() },
  };
}

export async function listSessions(userId: string) {
  const rows = await prisma.aiSession.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 50, include: { _count: { select: { messages: true } } } });
  return rows.map((s) => ({ id: s.id, title: s.title, day: s.day, messages: s._count.messages, updatedAt: s.updatedAt.toISOString() }));
}

export async function getSession(userId: string, id: string) {
  const s = await prisma.aiSession.findFirst({ where: { id, userId }, include: { messages: { orderBy: { createdAt: "asc" } } } });
  if (!s) throw new AppError("NOT_FOUND", "AI session not found.");
  return {
    id: s.id,
    title: s.title,
    day: s.day,
    messages: s.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, payload: m.payload, createdAt: m.createdAt.toISOString() })),
  };
}

export async function deleteSession(userId: string, id: string) {
  const r = await prisma.aiSession.deleteMany({ where: { id, userId } });
  if (!r.count) throw new AppError("NOT_FOUND", "AI session not found.");
  return { removed: true };
}
