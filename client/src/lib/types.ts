import type { ChartColors } from "@/theme/chartTheme";

export type DataSource = "youtube" | "mock";
export type ContentType = "VIDEO" | "SHORT" | "LIVE" | "UPCOMING";
export type SearchType = "PERSON" | "CHANNEL" | "CHANNEL_ID" | "HANDLE" | "VIDEO" | "PLAYLIST" | "TOPIC";
export type SearchStatus = "SUCCESS" | "NO_RESULTS" | "ERROR" | "QUOTA_EXCEEDED" | "INVALID";
export type SearchSource = "GLOBAL_SEARCH" | "SEARCH_PAGE" | "AI_AGENT" | "HISTORY" | "RESEARCH";
export type ResultSource = "YouTube" | "Web Search" | "Playlist" | "Channel";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  lastLoginAt: string | null;
}
export interface AuthStatus {
  authenticated: boolean;
  user: AuthUser | null;
  signupOpen: boolean;
}

export interface Channel {
  id: string;
  title: string;
  handle: string | null;
  customUrl: string | null;
  url: string;
  description: string;
  thumbnailUrl: string | null;
  bannerUrl: string | null;
  country: string | null;
  publishedAt: string | null;
  subscriberCount: number | null;
  hiddenSubscriberCount: boolean;
  videoCount: number | null;
  viewCount: number | null;
  verified: null;
  topicCategories: string[];
  keywords: string | null;
  dataSource: DataSource;
  fetchedAt: string;
  storedVideoCount?: number;
  uploadsExhausted: boolean;
  lastSeenAt?: string;
  searches?: number;
}

export interface Video {
  id: string;
  url: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  channelId: string;
  channelTitle: string;
  publishedAt: string | null;
  durationSeconds: number | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  tags: string[];
  categoryId: string | null;
  categoryName: string | null;
  contentType: ContentType;
  embeddable: boolean | null;
  privacyStatus: string | null;
  defaultLanguage: string | null;
  dataSource: DataSource;
  playlists?: { id: string; title: string }[];
  source?: ResultSource;
}

export interface Comment {
  id: string;
  authorName: string;
  authorAvatarUrl: string | null;
  authorChannelUrl: string | null;
  text: string;
  likeCount: number;
  publishedAt: string | null;
  updatedAt: string | null;
}
export interface CommentThread extends Comment {
  replyCount: number;
  replies: Comment[];
}

export interface Playlist {
  id: string;
  url: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  channelId: string;
  channelTitle: string;
  itemCount: number | null;
  publishedAt: string | null;
  dataSource: DataSource;
  source?: ResultSource;
  lastSeenAt?: string;
}

export interface QueryIntent {
  type: SearchType;
  label: string;
  raw: string;
  entity?: string;
  channelId?: string;
  handle?: string;
  videoId?: string;
  playlistId?: string;
  topic?: string;
  wants: { videos: boolean; playlists: boolean; channels: boolean };
  sort?: string;
  year?: number;
  contentType?: "short" | "live";
  usesContext: boolean;
}

export interface SearchFilters {
  date: "any" | "today" | "yesterday" | "7d" | "30d" | "custom";
  from?: string;
  to?: string;
  content: "all" | "video" | "short" | "live" | "playlist" | "channel";
  sort?: "relevance" | "newest" | "oldest" | "views" | "likes" | "comments" | "engagement";
  minViews?: number;
  minLikes?: number;
  minComments?: number;
}

export interface SearchResponse {
  searchId: string | null;
  query: string;
  intent: QueryIntent;
  dataSource: DataSource;
  creator: Channel | null;
  candidates: Channel[];
  channels: Channel[];
  videos: { items: Video[]; nextPageToken: string | null; mode: "uploads" | "search"; total: number | null; params?: Record<string, string | number | undefined> };
  playlists: { items: Playlist[]; nextPageToken: string | null; total: number | null };
  video: Video | null;
  playlist: Playlist | null;
  warnings: string[];
}

export interface VideoFilters {
  sort: "relevance" | "newest" | "oldest" | "views" | "likes" | "comments" | "engagement";
  content: "all" | "video" | "short" | "live";
  from?: string;
  to?: string;
  duration: "any" | "short" | "medium" | "long";
  minViews?: number;
  minLikes?: number;
  minComments?: number;
  minEngagement?: number;
  q?: string;
  channelId?: string;
}

export interface ChannelVideosPage {
  items: Video[];
  total: number;
  loaded: number;
  page: number;
  pageSize: number;
  canLoadMore: boolean;
  channelVideoCount: number | null;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface HistoryRow {
  id: string;
  query: string;
  searchType: SearchType;
  entityName: string | null;
  channelYoutubeId: string | null;
  resultCount: number;
  videosFound: number;
  playlistsFound: number;
  channelsFound: number;
  source: SearchSource;
  status: SearchStatus;
  errorCode: string | null;
  clientSessionId: string | null;
  userId: string;
  dataSource: DataSource;
  day: string;
  createdAt: string;
}

export interface Kpis {
  totalSearches: number;
  creatorsResearched: number;
  videosFound: number;
  playlistsFound: number;
  savedVideos: number;
  aiSessions: number;
  videoPlays: number;
}
export interface Summary {
  range: { from: string; to: string };
  previousRange: { from: string; to: string };
  current: Kpis;
  previous: Kpis;
  saved: { videos: number; channels: number; playlists: number; research: number };
}
export type Granularity = "day" | "week" | "month" | "year";
export interface ActivityPoint {
  bucket: string;
  searches: number;
  videosFound: number;
  channelsFound: number;
  playlistsFound: number;
  aiQueries: number;
  creators: number;
}
export interface Activity {
  granularity: Granularity;
  range: { from: string; to: string };
  points: ActivityPoint[];
}
export type Dimension = "searchesByCreator" | "videosByCreator" | "videosByContentType" | "searchCategories" | "savedVideos" | "playlistsDiscovered";
export interface Distribution {
  dimension: Dimension;
  total: number;
  slices: { key: string; label: string; value: number; percent: number }[];
}

export interface CreatorAnalytics {
  channelId: string;
  title: string;
  subscriberCount: number | null;
  channelVideoCount: number | null;
  channelViewCount: number | null;
  stats: { count: number; totalViews: number; avgViews: number | null; avgEngagement: number | null };
  uploadsByMonth: { month: string; uploads: number; views: number }[];
  contentTypes: { type: string; label: string; count: number }[];
  topVideos: Video[];
  yourSearches: number;
  lastSearchedAt: string | null;
}

export interface CompareCreator {
  channelId: string;
  title: string;
  thumbnailUrl: string | null;
  subscriberCount: number | null;
  channelViewCount: number | null;
  channelVideoCount: number | null;
  loadedVideos: number;
  window: { days: number; count: number; totalViews: number; avgViews: number | null; avgEngagement: number | null; shorts: number };
  allLoaded: { count: number; totalViews: number; avgViews: number | null; avgEngagement: number | null };
  topVideo: Video | null;
}
export interface Comparison {
  days: number;
  since: string | null;
  creators: CompareCreator[];
}

export interface CalendarDay {
  day: string;
  searches: number;
  creators: number;
  videos: number;
  playlists: number;
  savedVideos: number;
  aiSessions: number;
  aiQueries: number;
  plays: number;
}
export interface CalendarRange {
  from: string;
  to: string;
  days: CalendarDay[];
  totals: { searches: number; creators: number; videos: number; playlists: number; savedVideos: number; aiSessions: number };
  activeDays: number;
}
export interface CalendarDayDetail {
  day: string;
  counters: CalendarDay;
  searches: HistoryRow[];
  aiSessions: { id: string; title: string; messages: number; createdAt: string }[];
  events: { id: string; type: string; channelTitle: string | null; channelId: string | null; videoId: string | null; playlistId: string | null; createdAt: string }[];
}

export interface WebResult {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  date: string | null;
  imageUrl: string | null;
  kind: "web" | "video";
  youtube: { videoId?: string; playlistId?: string; channelId?: string; handle?: string } | null;
  source: "Web Search";
}

export interface ResearchResult {
  kind: "research";
  title: string;
  person: string | null;
  channel: Channel | null;
  candidates: Channel[];
  videosFound: number;
  videosShown: number;
  playlistsFound: number;
  latestVideo: Video | null;
  videos: Video[];
  playlists: Playlist[];
  web: WebResult[];
  filters: string[];
  warnings: string[];
  dataSource: DataSource;
}
export type AgentPayload =
  | ResearchResult
  | { kind: "compare"; title: string; comparison: Comparison; warnings: string[]; dataSource: DataSource }
  | { kind: "activity"; title: string; summary: Summary; recent: { query: string; searchType: SearchType; entityName: string | null; createdAt: string }[] }
  | { kind: "help" };

export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  payload?: AgentPayload | null;
  error?: boolean;
  createdAt: string;
  pending?: boolean;
}
export interface AgentReply {
  sessionId: string;
  sessionTitle: string;
  engine: "llm" | "local";
  message: AgentMessage;
}
export interface AgentSessionSummary {
  id: string;
  title: string;
  day: string;
  messages: number;
  updatedAt: string;
}

export interface SavedAll {
  videos: { savedAt: string; note: string | null; video: Video }[];
  channels: { savedAt: string; channel: Channel }[];
  playlists: { savedAt: string; playlist: Playlist }[];
  research: { id: string; kind: string; title: string; query: string | null; refId: string | null; payload: unknown; createdAt: string }[];
}
export interface SavedIds {
  videos: string[];
  channels: string[];
  playlists: string[];
}

export interface ResearchItem {
  id: string;
  sessionId: string;
  kind: "CHANNEL" | "VIDEO" | "PLAYLIST";
  youtubeId: string;
  title: string;
  thumbnailUrl: string | null;
  addedAt: string;
}
export interface ResearchSession {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  items: ResearchItem[];
}

export interface ServiceStatus {
  state: "connected" | "error" | "not_configured" | "demo" | "online" | "local";
  label: string;
  detail: string;
}
export interface SystemStatus {
  youtube: ServiceStatus;
  web: ServiceStatus;
  ai: ServiceStatus;
  database: ServiceStatus;
  dataSource: DataSource;
  quota: { usedToday: number; callsToday: number; dailyLimit: number };
  checkedAt: string;
}
export interface ConfigOverview {
  variables: { name: string; required: boolean; set: boolean; value?: string; purpose: string }[];
  quotaHistory: { day: string; units: number; calls: number }[];
  quotaCosts: { call: string; units: number }[];
}
export interface NotificationItem {
  id: string;
  level: "info" | "warning" | "error";
  title: string;
  detail: string;
  at: string;
}

export type { ChartColors };
