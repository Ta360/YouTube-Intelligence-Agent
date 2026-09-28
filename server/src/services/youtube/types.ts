/** Provider-neutral records returned by a YouTube provider (live API or demo). */
export interface ChannelRecord {
  youtubeId: string;
  title: string;
  handle: string | null;
  customUrl: string | null;
  description: string;
  thumbnailUrl: string | null;
  bannerUrl: string | null;
  country: string | null;
  publishedAt: Date | null;
  subscriberCount: bigint | null;
  hiddenSubscriberCount: boolean;
  videoCount: number | null;
  viewCount: bigint | null;
  uploadsPlaylistId: string | null;
  keywords: string | null;
  topicCategories: string[];
}

export interface VideoRecord {
  youtubeId: string;
  channelYoutubeId: string;
  channelTitle: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  publishedAt: Date | null;
  /** Only present when full details (videos.list) were fetched. */
  details?: {
    durationSeconds: number | null;
    viewCount: bigint | null;
    likeCount: bigint | null;
    commentCount: bigint | null;
    tags: string[];
    categoryId: string | null;
    liveBroadcastContent: string | null;
    embeddable: boolean | null;
    privacyStatus: string | null;
    defaultLanguage: string | null;
  };
}

export interface PlaylistRecord {
  youtubeId: string;
  channelYoutubeId: string;
  channelTitle: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  itemCount: number | null;
  publishedAt: Date | null;
}

export interface CommentRecord {
  id: string;
  authorName: string;
  authorAvatarUrl: string | null;
  authorChannelUrl: string | null;
  text: string;
  likeCount: number;
  publishedAt: string | null;
  updatedAt: string | null;
}

export interface CommentThreadRecord extends CommentRecord {
  replyCount: number;
  /** Up to 5 replies are included by the API; more need comments.list. */
  replies: CommentRecord[];
}

export interface Page<T> {
  items: T[];
  nextPageToken: string | null;
  totalResults?: number | null;
}

export type SearchOrder = "relevance" | "date" | "viewCount" | "rating" | "title" | "videoCount";

export interface VideoSearchParams {
  q?: string;
  channelId?: string;
  order?: SearchOrder;
  publishedAfter?: string; // RFC 3339
  publishedBefore?: string;
  videoDuration?: "any" | "short" | "medium" | "long";
  eventType?: "live" | "upcoming" | "completed";
  pageToken?: string;
  maxResults?: number;
}

export interface YouTubeProvider {
  readonly dataSource: "youtube" | "mock";
  searchChannels(q: string, pageToken?: string, maxResults?: number): Promise<Page<ChannelRecord>>;
  getChannels(by: { ids?: string[]; handle?: string; username?: string }): Promise<ChannelRecord[]>;
  searchVideos(params: VideoSearchParams): Promise<Page<VideoRecord>>;
  getVideos(ids: string[]): Promise<VideoRecord[]>;
  searchPlaylists(q: string, pageToken?: string, channelId?: string): Promise<Page<PlaylistRecord>>;
  getChannelPlaylists(channelId: string, pageToken?: string): Promise<Page<PlaylistRecord>>;
  getPlaylists(ids: string[]): Promise<PlaylistRecord[]>;
  getPlaylistItems(playlistId: string, pageToken?: string, maxResults?: number): Promise<Page<{ videoId: string; position: number }>>;
  getCategories(): Promise<Record<string, string>>;
  getComments(videoId: string, opts: { order: "relevance" | "time"; pageToken?: string; searchTerms?: string }): Promise<Page<CommentThreadRecord>>;
  getReplies(parentId: string, pageToken?: string): Promise<Page<CommentRecord>>;
  ping(): Promise<void>;
}
