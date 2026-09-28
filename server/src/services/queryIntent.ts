/**
 * Classifies a free-text search into what the user most likely means:
 * a person, a channel, a channel ID, an @handle, a video, a playlist or a general topic —
 * plus modifiers (wants videos/playlists, sort, year, Shorts/live, topic within a creator).
 */
import type { SearchType } from "@prisma/client";
import { cleanText, YT_CHANNEL_ID_RE, YT_HANDLE_RE, YT_PLAYLIST_ID_RE, YT_VIDEO_ID_RE } from "../lib/sanitize.js";

export type IntentSort = "relevance" | "newest" | "oldest" | "views" | "likes" | "comments";

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
  sort?: IntentSort;
  year?: number;
  contentType?: "short" | "live";
  /** Query refers to "this creator/channel" and needs the current context. */
  usesContext: boolean;
}

const LABELS: Record<SearchType, string> = {
  PERSON: "Person / creator",
  CHANNEL: "YouTube channel",
  CHANNEL_ID: "Channel ID",
  HANDLE: "@handle",
  VIDEO: "Videos",
  PLAYLIST: "Playlists",
  TOPIC: "General topic",
};

function fromUrl(q: string): Partial<QueryIntent> | null {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(q) ? q : `https://${q}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m|music)\./, "");
  if (host === "youtu.be") {
    const id = u.pathname.slice(1, 12);
    return YT_VIDEO_ID_RE.test(id) ? { type: "VIDEO", videoId: id } : null;
  }
  if (host !== "youtube.com" && host !== "youtube-nocookie.com") return null;
  const list = u.searchParams.get("list");
  const v = u.searchParams.get("v");
  if (v && YT_VIDEO_ID_RE.test(v)) return { type: "VIDEO", videoId: v };
  if (list && YT_PLAYLIST_ID_RE.test(list)) return { type: "PLAYLIST", playlistId: list };
  const seg = u.pathname.split("/").filter(Boolean);
  if ((seg[0] === "shorts" || seg[0] === "live" || seg[0] === "embed") && seg[1] && YT_VIDEO_ID_RE.test(seg[1])) return { type: "VIDEO", videoId: seg[1] };
  if (seg[0] === "channel" && seg[1] && YT_CHANNEL_ID_RE.test(seg[1])) return { type: "CHANNEL_ID", channelId: seg[1] };
  if (seg[0]?.startsWith("@") && YT_HANDLE_RE.test(seg[0])) return { type: "HANDLE", handle: seg[0] };
  if ((seg[0] === "c" || seg[0] === "user") && seg[1]) return { type: "CHANNEL", entity: decodeURIComponent(seg[1]) };
  return null;
}

const FILLER = /\b(please|pls|can you|could you|find|show|me|get|search|look up|lookup|give|list|all|every|of all|for|youtube|on youtube|and the web|web|internet|research|display|fetch|i want|want|to see|see|some)\b/gi;
const CONTEXT_REF = /\b(this|that|the same|current|selected)\s+(creator|channel|person|youtuber|artist)\b/i;

export function classifyQuery(input: string): QueryIntent {
  const raw = cleanText(input, 200);
  const intent: QueryIntent = { type: "TOPIC", label: "", raw, wants: { videos: true, playlists: false, channels: false }, usesContext: false };
  const done = (patch: Partial<QueryIntent>): QueryIntent => {
    const r = { ...intent, ...patch };
    r.label = LABELS[r.type];
    return r;
  };
  if (!raw) return done({});

  // 1) Links and IDs are unambiguous.
  const url = fromUrl(raw);
  if (url) return done({ ...url, wants: { videos: url.type !== "PLAYLIST", playlists: url.type === "PLAYLIST", channels: false } });
  if (YT_CHANNEL_ID_RE.test(raw)) return done({ type: "CHANNEL_ID", channelId: raw, wants: { videos: true, playlists: true, channels: false } });
  if (YT_PLAYLIST_ID_RE.test(raw) && raw.length >= 18) return done({ type: "PLAYLIST", playlistId: raw, wants: { videos: false, playlists: true, channels: false } });
  if (YT_HANDLE_RE.test(raw)) return done({ type: "HANDLE", handle: raw, wants: { videos: true, playlists: true, channels: false } });

  let q = ` ${raw} `;
  const lower = raw.toLowerCase();

  // 2) Modifiers.
  const yearMatch = lower.match(/\b(?:from|in|during|of|since)?\s*((?:19|20)\d{2})\b/);
  if (yearMatch) {
    intent.year = Number(yearMatch[1]);
    q = q.replace(new RegExp(`\\b(?:from|in|during|of|since)?\\s*${yearMatch[1]}\\b`, "i"), " ");
  }
  if (/\b(latest|newest|recent|new|last)\b/i.test(lower)) intent.sort = "newest";
  if (/\b(oldest|first|earliest)\b/i.test(lower)) intent.sort = "oldest";
  if (/\b(most viewed|most popular|popular|top|best|viral|most watched)\b/i.test(lower)) intent.sort = "views";
  if (/\bmost liked\b/i.test(lower)) intent.sort = "likes";
  if (/\bmost commented\b/i.test(lower)) intent.sort = "comments";
  if (/\bshorts?\b/i.test(lower)) intent.contentType = "short";
  if (/\b(live|livestreams?|streams?|streaming)\b/i.test(lower)) intent.contentType = "live";
  const wantsPlaylists = /\bplaylists?\b/i.test(lower);
  const wantsVideos = /\b(videos?|shorts?|uploads?|clips?|streams?|content|episodes?)\b/i.test(lower);
  intent.usesContext = CONTEXT_REF.test(lower);
  intent.wants = { videos: wantsVideos || !wantsPlaylists, playlists: wantsPlaylists, channels: /\bchannels?\b/i.test(lower) && !wantsVideos };

  q = q.replace(/\b(latest|newest|recent|oldest|earliest|most viewed|most popular|most watched|most liked|most commented|popular|viral|top|best|new)\b/gi, " ");
  q = q.replace(CONTEXT_REF, " __CTX__ ");

  // 3) "<topic> videos from <entity>"  /  "videos about <topic> from <entity>"
  const noun = "(?:videos?|shorts?|uploads?|clips?|content|playlists?|streams?|livestreams?)";
  let m = q.match(new RegExp(`${noun}\\s+(?:about|on|regarding|related to|featuring)\\s+(.+?)\\s+(?:from|by)\\s+(.+)`, "i"));
  let topic: string | undefined;
  let entity: string | undefined;
  if (m) {
    topic = m[1];
    entity = m[2];
  } else if ((m = q.match(new RegExp(`(.+?)\\s+${noun}\\s+(?:from|by|of|uploaded by)\\s+(.+)`, "i")))) {
    topic = m[1];
    entity = m[2];
  } else if ((m = q.match(new RegExp(`${noun}(?:\\s+and\\s+${noun})?\\s+(?:from|by|of|uploaded by|featuring|with)\\s+(.+)`, "i")))) {
    entity = m[1];
  } else if ((m = q.match(new RegExp(`${noun}(?:\\s+and\\s+${noun})?\\s+(?:about|on|regarding|related to)\\s+(.+)`, "i")))) {
    topic = m[1];
  } else if ((m = q.match(/\b(?:related to|about|featuring)\s+(.+)/i))) {
    // "playlists related to this person"
    entity = m[1];
  }

  const tidy = (s?: string) => {
    const t = (s ?? "")
      .replace(new RegExp(`\\b${noun}\\b`, "gi"), " ")
      .replace(/\b(and|or|with|from|by|about|channel|creator|person|youtuber|videos? and playlists?)\b/gi, " ")
      .replace(FILLER, " ")
      .replace(/[?!.,"]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^(the|a|an)\s+(?=\S+\s+\S)/i, "") // "the latest AI news" → "AI news", but keep "The Weeknd"
      .replace(/^(the|a|an)$/i, "")
      .replace(/\s(the|a|an)$/i, "")
      .trim();
    return t || undefined;
  };

  if (entity !== undefined || topic !== undefined) {
    entity = tidy(entity);
    topic = tidy(topic);
  } else {
    // 4) No explicit structure: remaining words are either a name or a topic.
    const rest = tidy(q);
    if (!rest) return done({ type: intent.usesContext ? "CHANNEL" : "TOPIC", topic: undefined, entity: undefined });
    const words = rest.split(" ");
    const hasTopicWords = /\b(how to|how|what|why|tutorial|guide|review|explained|vs|best way|tips|course|learn|news|music|song|songs|trailer|recipe|recipes|artificial intelligence|ai|about)\b/i.test(rest);
    if (words.length <= 4 && !hasTopicWords) entity = rest;
    else topic = rest;
  }

  if (entity?.includes("__CTX__") || intent.usesContext) {
    intent.usesContext = true;
    entity = entity?.replace("__CTX__", "").trim() || undefined;
  }
  topic = topic?.replace("__CTX__", "").trim() || undefined;

  if (entity || intent.usesContext) {
    let type: SearchType;
    if (intent.wants.playlists && !wantsVideos) type = "PLAYLIST";
    else if (topic || wantsVideos) type = "VIDEO";
    else if (/\bchannel\b/i.test(lower)) type = "CHANNEL";
    else type = entity && /^([A-Z][a-z'’.-]+)(\s[A-Z][a-z'’.-]+){1,2}$/.test(entity) ? "PERSON" : "CHANNEL";
    return done({ type, entity, topic });
  }
  if (intent.wants.playlists && !wantsVideos) return done({ type: "PLAYLIST", topic });
  return done({ type: "TOPIC", topic });
}
