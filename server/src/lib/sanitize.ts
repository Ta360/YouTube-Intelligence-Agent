/** Strips control characters and collapses whitespace in free-text user input. */
export function cleanText(input: unknown, max = 200): string {
  if (typeof input !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export const YT_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
export const YT_CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;
export const YT_PLAYLIST_ID_RE = /^(PL|UU|LL|FL|OL|RD|UL|PU)[A-Za-z0-9_-]{10,40}$/;
export const YT_HANDLE_RE = /^@[A-Za-z0-9._-]{3,30}$/;
export const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

/** BigInt-safe number conversion for JSON responses. */
export const num = (v: bigint | number | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));
