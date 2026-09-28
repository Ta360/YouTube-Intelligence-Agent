/**
 * Client UI state. Server data (search results, history, analytics, saved items) lives in
 * React Query's cache — it is NOT duplicated here. This store only holds what the user is
 * currently looking at / doing.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { presetRange, type RangePreset } from "@/lib/dates";
import type { AgentMessage, SearchFilters, Video } from "@/lib/types";

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "buffering" | "ended" | "error";

export interface AppState {
  // selection
  selectedCreatorId: string | null;
  selectedVideo: Video | null; // the video loaded in the dashboard player
  selectedPlaylistId: string | null;
  detailsVideoId: string | null; // video shown in the details panel
  commentsOpen: boolean; // comments reader under the player
  // search
  searchQuery: string;
  filters: SearchFilters;
  // analytics date range (drives every chart and KPI)
  dateRange: { preset: RangePreset; from: string; to: string };
  // AI agent conversation (current session)
  aiSessionId: string | null;
  aiMessages: AgentMessage[];
  aiBusy: boolean;
  // research workspace
  researchSessionId: string | null;
  // player
  playerState: { status: PlayerStatus; error: string | null; minimized: boolean; autoplay: boolean };
  // layout
  ui: { mobileNavOpen: boolean; sidebarCollapsed: boolean; agentOpen: boolean };

  setSelectedCreator: (id: string | null) => void;
  playVideo: (v: Video) => void;
  closePlayer: () => void;
  setPlayerState: (p: Partial<AppState["playerState"]>) => void;
  setSelectedPlaylist: (id: string | null) => void;
  openDetails: (id: string | null) => void;
  setCommentsOpen: (open: boolean) => void;
  setSearchQuery: (q: string) => void;
  setFilters: (f: Partial<SearchFilters>) => void;
  resetFilters: () => void;
  setDateRange: (preset: RangePreset, custom?: { from: string; to: string }) => void;
  setAiSession: (id: string | null, messages?: AgentMessage[]) => void;
  pushAiMessage: (m: AgentMessage) => void;
  replaceAiMessage: (id: string, m: AgentMessage) => void;
  setResearchSession: (id: string | null) => void;
  setUi: (p: Partial<AppState["ui"]>) => void;
}

export const DEFAULT_FILTERS: SearchFilters = { date: "any", content: "all" };

const safeStorage = createJSONStorage(() => {
  try {
    const k = "__yia_probe";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    const mem = new Map<string, string>();
    return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) };
  }
});

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      selectedCreatorId: null,
      selectedVideo: null,
      selectedPlaylistId: null,
      detailsVideoId: null,
      commentsOpen: false,
      searchQuery: "",
      filters: DEFAULT_FILTERS,
      dateRange: { preset: "30d", ...presetRange("30d") },
      aiSessionId: null,
      aiMessages: [],
      aiBusy: false,
      researchSessionId: null,
      playerState: { status: "idle", error: null, minimized: false, autoplay: true },
      ui: { mobileNavOpen: false, sidebarCollapsed: false, agentOpen: true },

      setSelectedCreator: (id) => set({ selectedCreatorId: id }),
      playVideo: (v) => set((s) => ({ selectedVideo: v, playerState: { ...s.playerState, status: "loading", error: null, minimized: false } })),
      closePlayer: () => set((s) => ({ selectedVideo: null, playerState: { ...s.playerState, status: "idle", error: null } })),
      setPlayerState: (p) => set((s) => ({ playerState: { ...s.playerState, ...p } })),
      setSelectedPlaylist: (id) => set({ selectedPlaylistId: id }),
      openDetails: (id) => set({ detailsVideoId: id }),
      setCommentsOpen: (open) => set((st) => ({ commentsOpen: open, playerState: open ? { ...st.playerState, minimized: false } : st.playerState })),
      setSearchQuery: (q) => set({ searchQuery: q }),
      setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
      resetFilters: () => set({ filters: DEFAULT_FILTERS }),
      setDateRange: (preset, custom) => set({ dateRange: { preset, ...(preset === "custom" && custom ? custom : presetRange(preset)) } }),
      setAiSession: (id, messages = []) => set({ aiSessionId: id, aiMessages: messages }),
      pushAiMessage: (m) => set((s) => ({ aiMessages: [...s.aiMessages, m] })),
      replaceAiMessage: (id, m) => set((s) => ({ aiMessages: s.aiMessages.map((x) => (x.id === id ? m : x)) })),
      setResearchSession: (id) => set({ researchSessionId: id }),
      setUi: (p) => set((s) => ({ ui: { ...s.ui, ...p } })),
    }),
    {
      name: "yia-ui",
      storage: safeStorage,
      version: 1,
      // Persist conveniences only. Relative presets are recomputed on load so "Last 7 days" stays current.
      partialize: (s) => ({ dateRange: s.dateRange, researchSessionId: s.researchSessionId, aiSessionId: s.aiSessionId, ui: { ...s.ui, mobileNavOpen: false }, selectedCreatorId: s.selectedCreatorId }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        const dr = p.dateRange && p.dateRange.preset !== "custom" ? { preset: p.dateRange.preset, ...presetRange(p.dateRange.preset) } : (p.dateRange ?? current.dateRange);
        return { ...current, ...p, dateRange: dr, ui: { ...current.ui, ...(p.ui ?? {}) } };
      },
    },
  ),
);
