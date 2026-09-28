import type { SearchStatus } from "@prisma/client";

export type ErrorCode =
  | "INVALID_INPUT"
  | "INVALID_QUERY"
  | "NOT_FOUND"
  | "CHANNEL_NOT_FOUND"
  | "VIDEO_UNAVAILABLE"
  | "PLAYLIST_NOT_FOUND"
  | "COMMENTS_DISABLED"
  | "NO_RESULTS"
  | "API_KEY_INVALID"
  | "API_NOT_CONFIGURED"
  | "QUOTA_EXCEEDED"
  | "RATE_LIMITED"
  | "NETWORK_ERROR"
  | "WEB_SEARCH_FAILED"
  | "WEB_SEARCH_NOT_CONFIGURED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "INTERNAL";

/** User-facing messages. Raw upstream errors and secrets never reach the client. */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  INVALID_INPUT: "The request was invalid.",
  INVALID_QUERY: "Enter a person, channel, @handle, channel ID, video/playlist link or topic.",
  NOT_FOUND: "The requested item could not be found.",
  CHANNEL_NOT_FOUND: "No YouTube channel matched that search.",
  VIDEO_UNAVAILABLE: "This video is unavailable — it may be private, deleted or restricted.",
  PLAYLIST_NOT_FOUND: "This playlist could not be found — it may be private or deleted.",
  COMMENTS_DISABLED: "Comments are turned off for this video.",
  NO_RESULTS: "No results found. Try a different spelling or a broader query.",
  API_KEY_INVALID: "The YouTube API key is invalid. Check YOUTUBE_API_KEY in server/.env.",
  API_NOT_CONFIGURED: "The YouTube Data API is not configured. Add YOUTUBE_API_KEY to server/.env.",
  QUOTA_EXCEEDED: "The daily YouTube API quota has been used up. Cached results are still available; new searches work again after the quota resets (midnight Pacific Time).",
  RATE_LIMITED: "Too many requests right now. Please wait a moment and try again.",
  NETWORK_ERROR: "Unable to reach YouTube. Check your internet connection and try again.",
  WEB_SEARCH_FAILED: "Web search failed. YouTube results are still shown.",
  WEB_SEARCH_NOT_CONFIGURED: "Web search is not configured. Add WEB_SEARCH_API_KEY to server/.env to enable it.",
  UNAUTHORIZED: "Sign in to use the dashboard.",
  FORBIDDEN: "You do not have access to this action.",
  CONFLICT: "This item already exists.",
  INTERNAL: "Something went wrong. Please try again.",
};

const HTTP_STATUS: Record<ErrorCode, number> = {
  INVALID_INPUT: 400,
  INVALID_QUERY: 400,
  NOT_FOUND: 404,
  CHANNEL_NOT_FOUND: 404,
  VIDEO_UNAVAILABLE: 404,
  PLAYLIST_NOT_FOUND: 404,
  COMMENTS_DISABLED: 403,
  NO_RESULTS: 404,
  API_KEY_INVALID: 502,
  API_NOT_CONFIGURED: 503,
  QUOTA_EXCEEDED: 429,
  RATE_LIMITED: 429,
  NETWORK_ERROR: 502,
  WEB_SEARCH_FAILED: 502,
  WEB_SEARCH_NOT_CONFIGURED: 503,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  CONFLICT: 409,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly userMessage: string;
  readonly retryAfterSeconds?: number;

  constructor(code: ErrorCode, userMessage?: string, opts: { retryAfterSeconds?: number; cause?: unknown } = {}) {
    super(userMessage ?? ERROR_MESSAGES[code], { cause: opts.cause });
    this.code = code;
    this.status = HTTP_STATUS[code];
    this.userMessage = userMessage ?? ERROR_MESSAGES[code];
    this.retryAfterSeconds = opts.retryAfterSeconds;
  }
}

export function toSearchStatus(code: ErrorCode): SearchStatus {
  switch (code) {
    case "NO_RESULTS":
    case "CHANNEL_NOT_FOUND":
    case "VIDEO_UNAVAILABLE":
    case "PLAYLIST_NOT_FOUND":
    case "COMMENTS_DISABLED":
    case "NOT_FOUND":
      return "NO_RESULTS";
    case "QUOTA_EXCEEDED":
      return "QUOTA_EXCEEDED";
    case "INVALID_INPUT":
    case "INVALID_QUERY":
      return "INVALID";
    default:
      return "ERROR";
  }
}

export const errorMessage = (err: unknown) => (err instanceof AppError ? err.userMessage : ERROR_MESSAGES.INTERNAL);
