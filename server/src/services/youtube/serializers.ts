import type { Channel, ContentType, Playlist, Video } from "@prisma/client";
import { num } from "../../lib/sanitize.js";

export interface ChannelDTO {
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
  /** The YouTube Data API does not expose the verification badge. */
  verified: null;
  topicCategories: string[];
  keywords: string | null;
  dataSource: "youtube" | "mock";
  fetchedAt: string;
  storedVideoCount?: number;
  uploadsExhausted: boolean;
}

export interface VideoDTO {
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
  dataSource: "youtube" | "mock";
  playlists?: { id: string; title: string }[];
}

export interface PlaylistDTO {
  id: string;
  url: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  channelId: string;
  channelTitle: string;
  itemCount: number | null;
  publishedAt: string | null;
  dataSource: "youtube" | "mock";
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function channelUrl(c: { youtubeId: string; handle: string | null }) {
  return c.handle ? `https://www.youtube.com/${c.handle}` : `https://www.youtube.com/channel/${c.youtubeId}`;
}

export const serializeChannel = (c: Channel, storedVideoCount?: number): ChannelDTO => ({
  id: c.youtubeId,
  title: c.title,
  handle: c.handle,
  customUrl: c.customUrl,
  url: channelUrl(c),
  description: c.description,
  thumbnailUrl: c.thumbnailUrl,
  bannerUrl: c.bannerUrl,
  country: c.country,
  publishedAt: iso(c.publishedAt),
  subscriberCount: num(c.subscriberCount),
  hiddenSubscriberCount: c.hiddenSubscriberCount,
  videoCount: c.videoCount,
  viewCount: num(c.viewCount),
  verified: null,
  topicCategories: c.topicCategories,
  keywords: c.keywords,
  dataSource: c.dataSource,
  fetchedAt: c.fetchedAt.toISOString(),
  uploadsExhausted: c.uploadsExhausted,
  ...(storedVideoCount !== undefined ? { storedVideoCount } : {}),
});

export const serializeVideo = (v: Video, playlists?: { youtubeId: string; title: string }[]): VideoDTO => ({
  id: v.youtubeId,
  url: `https://www.youtube.com/watch?v=${v.youtubeId}`,
  title: v.title,
  description: v.description,
  thumbnailUrl: v.thumbnailUrl,
  channelId: v.channelYoutubeId,
  channelTitle: v.channelTitle,
  publishedAt: iso(v.publishedAt),
  durationSeconds: v.durationSeconds,
  viewCount: num(v.viewCount),
  likeCount: num(v.likeCount),
  commentCount: num(v.commentCount),
  tags: v.tags,
  categoryId: v.categoryId,
  categoryName: v.categoryName,
  contentType: v.contentType,
  embeddable: v.embeddable,
  privacyStatus: v.privacyStatus,
  defaultLanguage: v.defaultLanguage,
  dataSource: v.dataSource,
  ...(playlists ? { playlists: playlists.map((p) => ({ id: p.youtubeId, title: p.title })) } : {}),
});

export const serializePlaylist = (p: Playlist): PlaylistDTO => ({
  id: p.youtubeId,
  url: `https://www.youtube.com/playlist?list=${p.youtubeId}`,
  title: p.title,
  description: p.description,
  thumbnailUrl: p.thumbnailUrl,
  channelId: p.channelYoutubeId,
  channelTitle: p.channelTitle,
  itemCount: p.itemCount,
  publishedAt: iso(p.publishedAt),
  dataSource: p.dataSource,
});
