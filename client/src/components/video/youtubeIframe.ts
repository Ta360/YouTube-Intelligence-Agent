/**
 * Loader + minimal types for the official YouTube IFrame Player API.
 * https://developers.google.com/youtube/iframe_api_reference
 */
export interface YTPlayer {
  loadVideoById(id: string): void;
  cueVideoById(id: string): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  destroy(): void;
  getIframe(): HTMLIFrameElement;
}
interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId?: string;
      host?: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: { target: YTPlayer }) => void;
        onStateChange?: (e: { data: number; target: YTPlayer }) => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let loading: Promise<YTNamespace> | null = null;

/** Imperative controls for the single dashboard player (set by VideoPlayer). */
export const playerControls: { seek: ((seconds: number) => void) | null } = { seek: null };

export function loadYouTubeIframeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  loading ??= new Promise<YTNamespace>((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT!);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = () => {
      loading = null;
      reject(new Error("The YouTube player could not be loaded. Check your connection or content blockers."));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** Player error codes → user-facing messages. */
export function playerErrorMessage(code: number): { text: string; embeddingBlocked: boolean } {
  switch (code) {
    case 2:
      return { text: "This video ID is invalid.", embeddingBlocked: false };
    case 5:
      return { text: "This video can't be played in the browser's HTML5 player.", embeddingBlocked: false };
    case 100:
      return { text: "This video is unavailable — it may be private or deleted.", embeddingBlocked: false };
    case 101:
    case 150:
    case 153:
      return { text: "The video owner doesn't allow playback on other websites.", embeddingBlocked: true };
    default:
      return { text: "This video couldn't be played.", embeddingBlocked: false };
  }
}

export const PLAYER_STATE: Record<number, "loading" | "ended" | "playing" | "paused" | "buffering"> = { [-1]: "loading", 0: "ended", 1: "playing", 2: "paused", 3: "buffering", 5: "paused" };
