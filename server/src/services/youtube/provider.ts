import { env } from "../../config/env.js";
import { MockYouTubeProvider } from "./mockProvider.js";
import type { YouTubeProvider } from "./types.js";
import { YouTubeApiProvider } from "./youtubeApiProvider.js";

let provider: YouTubeProvider | null = null;

/** Live YouTube Data API when configured, otherwise the labelled demo provider. */
export function getYouTubeProvider(): YouTubeProvider {
  return (provider ??= env.youtube.live ? new YouTubeApiProvider() : new MockYouTubeProvider());
}
