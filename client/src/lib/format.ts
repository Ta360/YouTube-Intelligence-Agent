export const compact = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: n >= 1000 ? 1 : 0 }).format(n);

export const full = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("en-US"));

export function duration(sec: number | null | undefined) {
  if (sec === null || sec === undefined) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export const dateShort = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
export const dateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
export const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return "";
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  const units: [number, string][] = [
    [60, "minute"],
    [24, "hour"],
    [30, "day"],
    [12, "month"],
    [Infinity, "year"],
  ];
  let v = s / 60;
  for (let i = 0; i < units.length; i++) {
    const [div, name] = units[i]!;
    if (v < div || i === units.length - 1) return `${Math.floor(v)} ${name}${Math.floor(v) === 1 ? "" : "s"} ago`;
    v /= div;
  }
  return "";
}

export function engagement(v: { viewCount: number | null; likeCount: number | null; commentCount: number | null }) {
  if (!v.viewCount) return null;
  return ((v.likeCount ?? 0) + (v.commentCount ?? 0)) / v.viewCount * 100;
}

export const pct = (n: number | null | undefined, digits = 1) => (n === null || n === undefined ? "—" : `${n.toFixed(digits)}%`);

export const SEARCH_TYPE_LABEL: Record<string, string> = {
  PERSON: "Person",
  CHANNEL: "Channel",
  CHANNEL_ID: "Channel ID",
  HANDLE: "@handle",
  VIDEO: "Videos",
  PLAYLIST: "Playlists",
  TOPIC: "Topic",
};
export const SOURCE_LABEL: Record<string, string> = {
  GLOBAL_SEARCH: "Global search",
  SEARCH_PAGE: "Search page",
  AI_AGENT: "AI agent",
  HISTORY: "History",
  RESEARCH: "Research",
};
export const CONTENT_LABEL: Record<string, string> = { VIDEO: "Video", SHORT: "Short", LIVE: "Live", UPCOMING: "Upcoming" };
