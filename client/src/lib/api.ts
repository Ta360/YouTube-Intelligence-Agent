/**
 * Typed client for the dashboard API. Every request goes to our own server — API keys for
 * YouTube, web search and the LLM never reach the browser.
 */
import type {
  Activity,
  AgentReply,
  AgentSessionSummary,
  AuthStatus,
  AuthUser,
  CalendarDayDetail,
  CalendarRange,
  Channel,
  ChannelVideosPage,
  ChartColors,
  Comparison,
  Comment,
  CommentThread,
  ConfigOverview,
  CreatorAnalytics,
  Dimension,
  Distribution,
  Granularity,
  HistoryRow,
  NotificationItem,
  Paged,
  Playlist,
  ResearchItem,
  ResearchSession,
  SavedAll,
  SavedIds,
  SearchFilters,
  SearchResponse,
  Summary,
  SystemStatus,
  Video,
  VideoFilters,
  WebResult,
  AgentMessage,
} from "./types";
import { browserTimeZone } from "./dates";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

export function qs(q: Query = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ tz: browserTimeZone(), ...q })) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

async function request<T>(path: string, init: RequestInit & { query?: Query } = {}): Promise<T> {
  const { query, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`/api${path}${qs(query)}`, {
      credentials: "include",
      ...rest,
      headers: { Accept: "application/json", "X-Timezone": browserTimeZone(), ...(rest.body ? { "Content-Type": "application/json" } : {}), ...rest.headers },
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", "Unable to reach the dashboard server. Check that it is running.", 0);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const e = body?.error;
    if (res.status === 401 && !path.startsWith("/auth/")) window.dispatchEvent(new Event("yia:unauthorized"));
    throw new ApiError(e?.code ?? "INTERNAL", e?.message ?? "Something went wrong.", res.status);
  }
  return body as T;
}

const json = (b: unknown) => JSON.stringify(b);
const enc = encodeURIComponent;
export type RangeQuery = { from: string; to: string; channel?: string; content?: string };

let clientSessionId = "";
function sessionId() {
  if (!clientSessionId) {
    try {
      clientSessionId = sessionStorage.getItem("yia-sid") ?? "";
      if (!clientSessionId) {
        clientSessionId = crypto.randomUUID();
        sessionStorage.setItem("yia-sid", clientSessionId);
      }
    } catch {
      clientSessionId = "anon";
    }
  }
  return clientSessionId;
}

export const api = {
  // auth
  authStatus: () => request<AuthStatus>("/auth/status"),
  signup: (b: { name: string; email: string; password: string }) => request<{ user: AuthUser }>("/auth/signup", { method: "POST", body: json(b) }),
  login: (b: { email: string; password: string; remember: boolean }) => request<{ user: AuthUser }>("/auth/login", { method: "POST", body: json(b) }),
  logout: () => request<{ authenticated: boolean }>("/auth/logout", { method: "POST" }),
  logoutAll: () => request<{ authenticated: boolean }>("/auth/logout-all", { method: "POST" }),
  changePassword: (b: { currentPassword: string; newPassword: string }) => request<{ changed: boolean }>("/auth/change-password", { method: "POST", body: json(b) }),

  // search
  search: (b: { query: string; filters: SearchFilters; source: "GLOBAL_SEARCH" | "SEARCH_PAGE" | "HISTORY" | "RESEARCH"; contextChannelId?: string }) =>
    request<SearchResponse>("/search", { method: "POST", body: json({ ...b, clientSessionId: sessionId() }) }),
  moreVideos: (params: Query) => request<{ items: Video[]; nextPageToken: string | null; total: number | null }>("/youtube/search/videos", { query: params }),

  // channels
  channelSearch: (q: string) => request<{ items: Channel[] }>("/youtube/channels/search", { query: { q } }),
  channel: (id: string, refresh = false) => request<Channel>(`/youtube/channels/${enc(id)}`, { query: { refresh: refresh ? 1 : undefined } }),
  channelVideos: (id: string, f: Partial<VideoFilters> & { page?: number; pageSize?: number }) => request<ChannelVideosPage>(`/youtube/channels/${enc(id)}/videos`, { query: f as Query }),
  loadMoreUploads: (id: string) => request<{ added: number; exhausted: boolean }>(`/youtube/channels/${enc(id)}/videos/more`, { method: "POST" }),
  channelPlaylists: (id: string, pageToken?: string) => request<{ items: Playlist[]; nextPageToken: string | null; total: number | null }>(`/youtube/channels/${enc(id)}/playlists`, { query: { pageToken } }),
  creatorAnalytics: (id: string) => request<CreatorAnalytics>(`/youtube/channels/${enc(id)}/analytics`),
  creatorSearches: (id: string) => request<Paged<HistoryRow>>(`/youtube/channels/${enc(id)}/searches`, { query: { pageSize: 50 } }),

  // videos & playlists
  video: (id: string) => request<Video>(`/youtube/videos/${enc(id)}`),
  related: (id: string) => request<{ videos: Video[]; playlists: Playlist[] }>(`/youtube/videos/${enc(id)}/related`),
  comments: (id: string, q: { order: "relevance" | "time"; pageToken?: string; q?: string }) =>
    request<{ items: CommentThread[]; nextPageToken: string | null; dataSource: string }>(`/youtube/videos/${enc(id)}/comments`, { query: q }),
  replies: (commentId: string, pageToken?: string) => request<{ items: Comment[]; nextPageToken: string | null }>(`/youtube/comments/${enc(commentId)}/replies`, { query: { pageToken } }),
  logPlay: (id: string) => request<{ ok: boolean }>(`/youtube/videos/${enc(id)}/play`, { method: "POST" }).catch(() => null),
  playlistSearch: (q: string, pageToken?: string) => request<{ items: Playlist[]; nextPageToken: string | null; total: number | null }>("/youtube/playlists/search", { query: { q, pageToken } }),
  playlist: (id: string, pageToken?: string) =>
    request<{ playlist: Playlist; items: Video[]; unavailable: number; nextPageToken: string | null; total: number | null }>(`/youtube/playlists/${enc(id)}`, { query: { pageToken } }),
  webSearch: (q: string, videos = false) => request<{ items: WebResult[] }>("/web/search", { query: { q, videos: videos ? 1 : undefined } }),

  // library
  libraryVideos: (f: Partial<VideoFilters> & { page?: number; pageSize?: number }) => request<Paged<Video>>("/library/videos", { query: f as Query }),
  libraryChannels: (q?: string) => request<{ items: Channel[] }>("/library/channels", { query: { q } }),
  libraryPlaylists: (q?: string, channel?: string) => request<{ items: Playlist[] }>("/library/playlists", { query: { q, channel } }),

  // history
  history: (q: Query) => request<Paged<HistoryRow>>("/history", { query: q }),
  recentSearches: () => request<{ items: { query: string; searchType: string; entityName: string | null; createdAt: string }[] }>("/history/recent"),
  deleteHistory: (id: string) => request<{ removed: boolean }>(`/history/${enc(id)}`, { method: "DELETE" }),

  // saved
  saved: () => request<SavedAll>("/saved"),
  savedIds: () => request<SavedIds>("/saved/ids"),
  saveVideo: (id: string) => request<{ saved: boolean }>("/saved/videos", { method: "POST", body: json({ id }) }),
  unsaveVideo: (id: string) => request<{ saved: boolean }>(`/saved/videos/${enc(id)}`, { method: "DELETE" }),
  saveChannel: (id: string) => request<{ saved: boolean }>("/saved/channels", { method: "POST", body: json({ id }) }),
  unsaveChannel: (id: string) => request<{ saved: boolean }>(`/saved/channels/${enc(id)}`, { method: "DELETE" }),
  savePlaylist: (id: string) => request<{ saved: boolean }>("/saved/playlists", { method: "POST", body: json({ id }) }),
  unsavePlaylist: (id: string) => request<{ saved: boolean }>(`/saved/playlists/${enc(id)}`, { method: "DELETE" }),
  saveResearch: (b: { kind: "SEARCH" | "AI_SESSION" | "RESEARCH_SESSION" | "CREATOR" | "NOTE"; title: string; query?: string; refId?: string; payload?: Record<string, unknown> }) =>
    request<{ id: string }>("/saved/research", { method: "POST", body: json(b) }),
  deleteSavedResearch: (id: string) => request<{ removed: boolean }>(`/saved/research/${enc(id)}`, { method: "DELETE" }),

  // research workspace
  researchSessions: () => request<{ items: ResearchSession[] }>("/research/sessions"),
  createResearchSession: (b: { name: string; description?: string }) => request<ResearchSession>("/research/sessions", { method: "POST", body: json(b) }),
  updateResearchSession: (id: string, b: { name?: string; description?: string }) => request<ResearchSession>(`/research/sessions/${enc(id)}`, { method: "PATCH", body: json(b) }),
  deleteResearchSession: (id: string) => request<{ removed: boolean }>(`/research/sessions/${enc(id)}`, { method: "DELETE" }),
  addResearchItem: (sessionId: string, b: { kind: "CHANNEL" | "VIDEO" | "PLAYLIST"; youtubeId: string }) =>
    request<ResearchItem>(`/research/sessions/${enc(sessionId)}/items`, { method: "POST", body: json(b) }),
  removeResearchItem: (sessionId: string, itemId: string) => request<{ removed: boolean }>(`/research/sessions/${enc(sessionId)}/items/${enc(itemId)}`, { method: "DELETE" }),
  compareSession: (sessionId: string, days: number) => request<Comparison>(`/research/sessions/${enc(sessionId)}/compare`, { query: { days } }),

  // analytics & calendar
  summary: (r: RangeQuery) => request<Summary>("/analytics/summary", { query: r }),
  activity: (r: RangeQuery & { granularity: Granularity }) => request<Activity>("/analytics/activity", { query: r }),
  distribution: (r: RangeQuery & { dimension: Dimension }) => request<Distribution>("/analytics/distribution", { query: r }),
  searchedCreators: () => request<{ items: { id: string; title: string; searches: number }[] }>("/analytics/creators"),
  calendar: (from: string, to: string) => request<CalendarRange>("/calendar", { query: { from, to } }),
  calendarDay: (day: string) => request<CalendarDayDetail>(`/calendar/day/${enc(day)}`),

  // agent
  agentChat: (b: { message: string; sessionId?: string; context: { channelId?: string; videoId?: string } }) => request<AgentReply>("/agent/chat", { method: "POST", body: json(b) }),
  agentSessions: () => request<{ items: AgentSessionSummary[] }>("/agent/sessions"),
  agentSession: (id: string) => request<{ id: string; title: string; day: string; messages: AgentMessage[] }>(`/agent/sessions/${enc(id)}`),
  deleteAgentSession: (id: string) => request<{ removed: boolean }>(`/agent/sessions/${enc(id)}`, { method: "DELETE" }),

  // settings & system
  chartColors: () => request<{ colors: ChartColors; defaults: ChartColors }>("/settings/chart-colors"),
  updateChartColors: (patch: Partial<ChartColors>) => request<{ colors: ChartColors }>("/settings/chart-colors", { method: "PUT", body: json(patch) }),
  resetChartColors: () => request<{ colors: ChartColors }>("/settings/chart-colors/reset", { method: "POST" }),
  config: () => request<ConfigOverview>("/settings/config"),
  status: () => request<SystemStatus>("/system/status"),
  notifications: () => request<{ items: NotificationItem[] }>("/notifications"),
};
