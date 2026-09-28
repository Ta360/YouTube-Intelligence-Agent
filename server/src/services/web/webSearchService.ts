/**
 * Web research (Serper.dev or Tavily). Results are third-party, unverified content: the UI
 * labels them "Web Search" and shows the source domain. YouTube links found on the web are
 * recognised so they can be played inside the dashboard.
 */
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { TtlCache } from "../../lib/ttlCache.js";
import { recordApiUsage } from "../apiUsageService.js";
import { classifyQuery } from "../queryIntent.js";

export interface WebResult {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  date: string | null;
  imageUrl: string | null;
  kind: "web" | "video";
  /** Set when the URL is a YouTube video/playlist/channel. */
  youtube: { videoId?: string; playlistId?: string; channelId?: string; handle?: string } | null;
  source: "Web Search";
}

const cache = new TtlCache<WebResult[]>(15 * 60_000, 300);

export const webSearchConfigured = () => Boolean(env.web.apiKey);

function youtubeRef(url: string): WebResult["youtube"] {
  const i = classifyQuery(url);
  if (i.videoId) return { videoId: i.videoId };
  if (i.playlistId) return { playlistId: i.playlistId };
  if (i.channelId) return { channelId: i.channelId };
  if (i.handle) return { handle: i.handle };
  return null;
}

const domainOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

function toResult(r: { title?: string; link?: string; url?: string; snippet?: string; content?: string; date?: string; imageUrl?: string; thumbnailUrl?: string }, kind: WebResult["kind"]): WebResult | null {
  const url = r.link ?? r.url;
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return {
    title: (r.title ?? url).slice(0, 200),
    url,
    domain: domainOf(url),
    snippet: (r.snippet ?? r.content ?? "").slice(0, 400),
    date: r.date ?? null,
    imageUrl: r.imageUrl ?? r.thumbnailUrl ?? null,
    kind,
    youtube: youtubeRef(url),
    source: "Web Search",
  };
}

async function serper(query: string, videos: boolean): Promise<WebResult[]> {
  const res = await fetch(`https://google.serper.dev/${videos ? "videos" : "search"}`, {
    method: "POST",
    headers: { "X-API-KEY": env.web.apiKey!, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num: 10 }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`SERPER_HTTP_${res.status}`);
  const body = (await res.json()) as { organic?: unknown[]; videos?: unknown[] };
  return ((videos ? body.videos : body.organic) ?? []).map((r) => toResult(r as never, videos ? "video" : "web")).filter((r): r is WebResult => Boolean(r));
}

async function tavily(query: string): Promise<WebResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.web.apiKey}` },
    body: JSON.stringify({ query, max_results: 10, search_depth: "basic" }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`TAVILY_HTTP_${res.status}`);
  const body = (await res.json()) as { results?: unknown[] };
  return (body.results ?? []).map((r) => toResult(r as never, "web")).filter((r): r is WebResult => Boolean(r));
}

/** Searches the web (and, with Serper, web videos). Dedupes by URL. */
export async function webSearch(query: string, opts: { videos?: boolean } = {}): Promise<WebResult[]> {
  if (!env.web.apiKey) throw new AppError("WEB_SEARCH_NOT_CONFIGURED");
  const key = `${env.web.provider}:${opts.videos ? "v" : "w"}:${query.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit) return hit.value;
  try {
    let results: WebResult[];
    if (env.web.provider === "tavily") results = await tavily(opts.videos ? `${query} video` : query);
    else results = await serper(query, Boolean(opts.videos));
    await recordApiUsage("web", env.web.provider, 1, true);
    const seen = new Set<string>();
    results = results.filter((r) => (seen.has(r.url) ? false : (seen.add(r.url), true)));
    cache.set(key, results);
    return results;
  } catch (err) {
    await recordApiUsage("web", env.web.provider, 1, false, "WEB_SEARCH_FAILED");
    logger.warn("web.search_failed", { provider: env.web.provider, error: String((err as Error)?.message ?? err) });
    throw new AppError("WEB_SEARCH_FAILED");
  }
}
