import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Bot, Eye, Trash2 } from "lucide-react";
import { useAskAgent } from "@/components/agent/AIAgentPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { fmtDay } from "@/lib/dates";
import { SEARCH_TYPE_LABEL, SOURCE_LABEL, time } from "@/lib/format";
import type { HistoryRow, SearchStatus } from "@/lib/types";
import { toast } from "./toast";

const STATUS: Record<SearchStatus, { label: string; variant: "success" | "warning" | "danger" | "secondary" }> = {
  SUCCESS: { label: "Success", variant: "success" },
  NO_RESULTS: { label: "No results", variant: "secondary" },
  ERROR: { label: "Error", variant: "danger" },
  QUOTA_EXCEEDED: { label: "Quota exceeded", variant: "warning" },
  INVALID: { label: "Invalid", variant: "warning" },
};

export function StatusBadge({ status }: { status: SearchStatus }) {
  const s = STATUS[status];
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

function useRowActions() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const send = useAskAgent();
  const del = useMutation({
    mutationFn: (id: string) => api.deleteHistory(id),
    onSuccess: () => {
      toast.success("Search removed from history");
      void qc.invalidateQueries({ queryKey: ["history"] });
      void qc.invalidateQueries({ queryKey: ["analytics"] });
      void qc.invalidateQueries({ queryKey: ["recentSearches"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return {
    view: (r: HistoryRow) => (r.channelYoutubeId && r.status === "SUCCESS" && ["PERSON", "CHANNEL", "CHANNEL_ID", "HANDLE"].includes(r.searchType) ? navigate(`/channels/${r.channelYoutubeId}`) : navigate(`/search?q=${encodeURIComponent(r.query)}&src=history`)),
    research: (r: HistoryRow) => send(r.searchType === "TOPIC" ? `Research ${r.query} on YouTube` : `Research ${r.entityName ?? r.query}: videos and playlists`),
    remove: (r: HistoryRow) => del.mutate(r.id),
    deleting: del.isPending ? del.variables : null,
  };
}

export function HistoryTable({ rows, showSource = true }: { rows: HistoryRow[]; showSource?: boolean }) {
  const a = useRowActions();
  return (
    <>
      {/* Desktop / tablet table */}
      <div className="hidden overflow-x-auto rounded-xl border md:block scrollbar-thin">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 font-medium">Date</th>
              <th className="px-3 py-2.5 font-medium">Time</th>
              <th className="px-3 py-2.5 font-medium">Search Query</th>
              <th className="px-3 py-2.5 font-medium">Person / Channel</th>
              <th className="px-3 py-2.5 font-medium">Search Type</th>
              <th className="px-3 py-2.5 text-right font-medium">Results</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t hover:bg-accent/40">
                <td className="whitespace-nowrap px-3 py-2">{fmtDay(r.day)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{time(r.createdAt)}</td>
                <td className="max-w-64 px-3 py-2">
                  <p className="truncate font-medium" title={r.query}>
                    {r.query}
                  </p>
                  {showSource && <p className="text-[11px] text-muted-foreground">{SOURCE_LABEL[r.source]}</p>}
                </td>
                <td className="max-w-48 truncate px-3 py-2">{r.entityName ?? "—"}</td>
                <td className="px-3 py-2">
                  <Badge variant="outline">{SEARCH_TYPE_LABEL[r.searchType]}</Badge>
                </td>
                <td className="px-3 py-2 text-right tabular-nums" title={`${r.videosFound} videos · ${r.playlistsFound} playlists · ${r.channelsFound} channels`}>
                  {r.resultCount}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => a.view(r)} aria-label={`View results for ${r.query}`}>
                      <Eye /> View
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => a.research(r)} aria-label={`Research ${r.query} with AI`}>
                      <Bot /> Research
                    </Button>
                    <Button size="icon-sm" variant="ghost" onClick={() => a.remove(r)} disabled={a.deleting === r.id} aria-label={`Delete search ${r.query}`} className="hover:text-danger">
                      <Trash2 />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="space-y-2 md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="glass rounded-xl p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{r.query}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtDay(r.day)} · {time(r.createdAt)} · {SEARCH_TYPE_LABEL[r.searchType]}
                </p>
                {r.entityName && <p className="truncate text-xs">{r.entityName}</p>}
              </div>
              <StatusBadge status={r.status} />
            </div>
            <div className="mt-2 flex items-center gap-1">
              <span className="mr-auto text-xs text-muted-foreground">{r.resultCount} results</span>
              <Button size="sm" variant="outline" onClick={() => a.view(r)}>
                <Eye /> View
              </Button>
              <Button size="sm" variant="outline" onClick={() => a.research(r)}>
                <Bot /> Research
              </Button>
              <Button size="icon-sm" variant="ghost" onClick={() => a.remove(r)} aria-label="Delete">
                <Trash2 />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
