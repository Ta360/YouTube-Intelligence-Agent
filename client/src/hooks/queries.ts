import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { api } from "@/lib/api";
import type { SavedIds, Video } from "@/lib/types";
import { useAppStore } from "@/store/appStore";
import { toast } from "@/components/common/toast";

export const useSystemStatus = () => useQuery({ queryKey: ["status"], queryFn: api.status, refetchInterval: 60_000, staleTime: 30_000 });

export const useSavedIds = () => useQuery({ queryKey: ["savedIds"], queryFn: api.savedIds, staleTime: 60_000 });

export function useRange() {
  const r = useAppStore((s) => s.dateRange);
  return { from: r.from, to: r.to, preset: r.preset };
}

type Kind = "video" | "channel" | "playlist";
const KEY: Record<Kind, keyof SavedIds> = { video: "videos", channel: "channels", playlist: "playlists" };

/** Save / unsave with optimistic "Saved" state; refreshes saved pages, KPIs and calendar. */
export function useToggleSave(kind: Kind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, saved }: { id: string; saved: boolean }) => {
      if (kind === "video") return saved ? api.unsaveVideo(id) : api.saveVideo(id);
      if (kind === "channel") return saved ? api.unsaveChannel(id) : api.saveChannel(id);
      return saved ? api.unsavePlaylist(id) : api.savePlaylist(id);
    },
    onMutate: async ({ id, saved }) => {
      await qc.cancelQueries({ queryKey: ["savedIds"] });
      const prev = qc.getQueryData<SavedIds>(["savedIds"]);
      if (prev) qc.setQueryData<SavedIds>(["savedIds"], { ...prev, [KEY[kind]]: saved ? prev[KEY[kind]].filter((x) => x !== id) : [...prev[KEY[kind]], id] });
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["savedIds"], ctx.prev);
      toast.error((err as Error).message);
    },
    onSuccess: (_r, { saved }) => toast.success(saved ? "Removed from saved" : "Saved"),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["savedIds"] });
      void qc.invalidateQueries({ queryKey: ["saved"] });
      void qc.invalidateQueries({ queryKey: ["analytics"] });
      void qc.invalidateQueries({ queryKey: ["calendar"] });
    },
  });
}

export function useIsSaved(kind: Kind, id: string | undefined) {
  const { data } = useSavedIds();
  return Boolean(id && data?.[KEY[kind]].includes(id));
}

/** Loads a video into the dashboard player (never opens a new tab) and logs the play. */
export function usePlay() {
  const play = useAppStore((s) => s.playVideo);
  const qc = useQueryClient();
  return useCallback(
    (v: Video) => {
      play(v);
      if (v.dataSource === "youtube") {
        void api.logPlay(v.id).then(() => {
          void qc.invalidateQueries({ queryKey: ["analytics"] });
          void qc.invalidateQueries({ queryKey: ["calendar"] });
        });
      }
      document.getElementById("main-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [play, qc],
  );
}

export const useResearchSessions = () => useQuery({ queryKey: ["research"], queryFn: api.researchSessions, staleTime: 30_000 });

export function useAddToResearch() {
  const qc = useQueryClient();
  const sessionId = useAppStore((s) => s.researchSessionId);
  const setSession = useAppStore((s) => s.setResearchSession);
  return useMutation({
    mutationFn: async (item: { kind: "CHANNEL" | "VIDEO" | "PLAYLIST"; youtubeId: string; sessionId?: string }) => {
      let sid = item.sessionId ?? sessionId;
      if (sid) {
        const list = qc.getQueryData<{ items: { id: string }[] }>(["research"]) ?? (await api.researchSessions());
        if (!list.items.some((s) => s.id === sid)) sid = null;
      }
      if (!sid) {
        const s = await api.createResearchSession({ name: `Research ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}` });
        sid = s.id;
        setSession(sid);
      }
      return api.addResearchItem(sid, { kind: item.kind, youtubeId: item.youtubeId });
    },
    onSuccess: (r) => {
      toast.success(`Added “${r.title.slice(0, 40)}” to research`);
      void qc.invalidateQueries({ queryKey: ["research"] });
      void qc.invalidateQueries({ queryKey: ["calendar"] });
    },
    onError: (err) => toast.error((err as Error).message),
  });
}
