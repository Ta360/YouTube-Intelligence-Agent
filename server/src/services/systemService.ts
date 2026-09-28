/** systemService — real-time status of YouTube API, web search, AI agent and database. */
import { env } from "../config/env.js";
import { errorMessage } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { lastCall, unitsUsedToday, usageByDay } from "./apiUsageService.js";
import { llmConfigured } from "./ai/llmProvider.js";
import { getYouTubeProvider } from "./youtube/provider.js";

type State = "connected" | "error" | "not_configured" | "demo" | "online" | "local";
export interface ServiceStatus {
  state: State;
  label: string;
  detail: string;
}

let pingCache: { at: number; status: ServiceStatus } | null = null;

async function youtubeStatus(): Promise<ServiceStatus> {
  const p = getYouTubeProvider();
  if (p.dataSource === "mock") return { state: "demo", label: "Demo data", detail: "YOUTUBE_API_KEY is not set — showing labelled demo data." };
  // A recent real call tells us the state without spending quota.
  const last = await lastCall("youtube");
  if (last && Date.now() - last.createdAt.getTime() < 10 * 60_000) {
    return last.ok
      ? { state: "connected", label: "Connected", detail: "YouTube Data API v3 responding." }
      : { state: "error", label: "API Error", detail: describe(last.errorCode) };
  }
  if (pingCache && Date.now() - pingCache.at < 5 * 60_000) return pingCache.status;
  let status: ServiceStatus;
  try {
    await p.ping();
    status = { state: "connected", label: "Connected", detail: "YouTube Data API v3 responding." };
  } catch (err) {
    status = { state: "error", label: "API Error", detail: errorMessage(err) };
  }
  pingCache = { at: Date.now(), status };
  return status;
}

function describe(code: string | null) {
  switch (code) {
    case "QUOTA_EXCEEDED":
      return "Daily YouTube quota exceeded — cached results only until it resets.";
    case "API_KEY_INVALID":
      return "The YouTube API key was rejected.";
    case "RATE_LIMITED":
      return "YouTube is rate-limiting requests.";
    case "NETWORK_ERROR":
      return "YouTube could not be reached.";
    default:
      return "The last YouTube request failed.";
  }
}

async function webStatus(): Promise<ServiceStatus> {
  if (!env.web.apiKey) return { state: "not_configured", label: "Not configured", detail: "Set WEB_SEARCH_API_KEY to enable web research." };
  const last = await lastCall("web");
  if (last && !last.ok) return { state: "error", label: "API Error", detail: `Last ${env.web.provider} request failed.` };
  return { state: "connected", label: "Connected", detail: `Provider: ${env.web.provider}` };
}

async function dbStatus(): Promise<ServiceStatus> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { state: "connected", label: "Connected", detail: "PostgreSQL" };
  } catch {
    return { state: "error", label: "Error", detail: "Database unreachable" };
  }
}

export async function getSystemStatus() {
  const [youtube, web, database, quota] = await Promise.all([youtubeStatus(), webStatus(), dbStatus(), unitsUsedToday("youtube").catch(() => ({ units: 0, calls: 0 }))]);
  const ai: ServiceStatus = llmConfigured()
    ? { state: "online", label: "Online", detail: `LLM: OpenAI ${env.llm.openaiModel}` }
    : { state: "local", label: "Online (local)", detail: "No LLM key — built-in language parser runs the same research workflow." };
  return {
    youtube,
    web,
    ai,
    database,
    dataSource: getYouTubeProvider().dataSource,
    quota: { usedToday: quota.units, callsToday: quota.calls, dailyLimit: env.youtube.dailyQuota },
    checkedAt: new Date().toISOString(),
  };
}

/** Which environment variables are required/optional and whether each is set (never the values). */
export async function getConfigOverview() {
  const set = (v: unknown) => Boolean(v);
  return {
    variables: [
      { name: "YOUTUBE_API_KEY", required: true, set: set(env.youtube.apiKey), purpose: "YouTube Data API v3 — channels, videos, playlists, search." },
      { name: "YOUTUBE_API_MODE", required: false, set: true, value: env.youtube.mode, purpose: "auto | youtube | mock" },
      { name: "YOUTUBE_DAILY_QUOTA", required: false, set: true, value: String(env.youtube.dailyQuota), purpose: "Your project's daily quota (units)." },
      { name: "WEB_SEARCH_API_KEY", required: false, set: set(env.web.apiKey), purpose: `Web research for the AI agent (${env.web.provider}).` },
      { name: "WEB_SEARCH_PROVIDER", required: false, set: true, value: env.web.provider, purpose: "serper | tavily" },
      { name: "OPENAI_API_KEY", required: false, set: set(env.llm.openaiKey), purpose: "LLM for the AI agent (falls back to the built-in parser)." },
      { name: "OPENAI_MODEL", required: false, set: true, value: env.llm.openaiModel, purpose: "OpenAI chat model." },
      { name: "DATABASE_URL", required: true, set: true, purpose: "PostgreSQL connection string." },
      { name: "SESSION_SECRET", required: true, set: env.auth.sessionSecret !== "dev-only-insecure-session-secret", purpose: "Signs dashboard session cookies (32+ chars)." },
    ],
    quotaHistory: await usageByDay("youtube", 14),
    quotaCosts: [
      { call: "Search (channels, videos, playlists)", units: 100 },
      { call: "Channel / video / playlist details", units: 1 },
      { call: "Playlist items (channel uploads, 50 per page)", units: 1 },
    ],
  };
}
