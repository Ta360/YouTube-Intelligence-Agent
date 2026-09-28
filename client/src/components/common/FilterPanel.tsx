import { useEffect, useState } from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/primitives";
import { todayKey } from "@/lib/dates";
import type { SearchFilters, VideoFilters } from "@/lib/types";
import { cn } from "@/lib/utils";

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground", className)}>
      {label}
      {children}
    </label>
  );
}

/** Numeric input that commits on blur/Enter (avoids a request per keystroke). */
function NumberField({ label, value, onCommit, placeholder, step }: { label: string; value?: number; onCommit: (v?: number) => void; placeholder?: string; step?: number }) {
  const [v, setV] = useState(value?.toString() ?? "");
  useEffect(() => setV(value?.toString() ?? ""), [value]);
  const commit = () => {
    const n = v.trim() === "" ? undefined : Math.max(0, Number(v));
    if (n === undefined || Number.isFinite(n)) onCommit(n);
  };
  return (
    <Field label={label}>
      <Input type="number" inputMode="numeric" min={0} step={step ?? 1} value={v} placeholder={placeholder ?? "Any"} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} />
    </Field>
  );
}

// ─── Search result filters (search page) ───────────────────────────────────────
export function SearchFilterPanel({ filters, onChange, onReset }: { filters: SearchFilters; onChange: (f: Partial<SearchFilters>) => void; onReset: () => void }) {
  return (
    <div className="glass grid grid-cols-2 gap-3 rounded-xl p-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-8" aria-label="Search filters">
      <Field label="Date">
        <Select value={filters.date} onChange={(e) => onChange({ date: e.target.value as SearchFilters["date"] })}>
          <option value="any">Any time</option>
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="custom">Custom date</option>
        </Select>
      </Field>
      {filters.date === "custom" && (
        <>
          <Field label="From">
            <Input type="date" value={filters.from ?? ""} max={filters.to ?? todayKey()} onChange={(e) => onChange({ from: e.target.value || undefined })} />
          </Field>
          <Field label="To">
            <Input type="date" value={filters.to ?? ""} min={filters.from} max={todayKey()} onChange={(e) => onChange({ to: e.target.value || undefined })} />
          </Field>
        </>
      )}
      <Field label="Content">
        <Select value={filters.content} onChange={(e) => onChange({ content: e.target.value as SearchFilters["content"] })}>
          <option value="all">All</option>
          <option value="video">Videos</option>
          <option value="short">Shorts</option>
          <option value="live">Live</option>
          <option value="playlist">Playlists</option>
          <option value="channel">Channels</option>
        </Select>
      </Field>
      <Field label="Sort">
        <Select value={filters.sort ?? "relevance"} onChange={(e) => onChange({ sort: e.target.value as SearchFilters["sort"] })}>
          <option value="relevance">Relevance</option>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="views">Most viewed</option>
          <option value="likes">Most liked</option>
          <option value="comments">Most commented</option>
        </Select>
      </Field>
      <NumberField label="Min views" value={filters.minViews} onCommit={(v) => onChange({ minViews: v })} />
      <NumberField label="Min likes" value={filters.minLikes} onCommit={(v) => onChange({ minLikes: v })} />
      <NumberField label="Min comments" value={filters.minComments} onCommit={(v) => onChange({ minComments: v })} />
      <div className="flex items-end">
        <Button variant="ghost" size="sm" onClick={onReset} className="h-9">
          <RotateCcw /> Reset
        </Button>
      </div>
    </div>
  );
}

// ─── Video list filters (creator videos, library) ─────────────────────────────
export const DEFAULT_VIDEO_FILTERS: VideoFilters = { sort: "newest", content: "all", duration: "any" };

export function VideoFilterBar({ filters, onChange, showContent = true, className }: { filters: VideoFilters; onChange: (f: VideoFilters) => void; showContent?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const set = (p: Partial<VideoFilters>) => onChange({ ...filters, ...p });
  const active = [filters.from, filters.to, filters.minViews, filters.minEngagement, filters.minLikes, filters.minComments, filters.duration !== "any" ? 1 : undefined].filter((x) => x !== undefined && x !== "").length;
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Sort videos" value={filters.sort} onChange={(e) => set({ sort: e.target.value as VideoFilters["sort"] })} className="w-44">
          <option value="newest">Sort: Newest</option>
          <option value="oldest">Sort: Oldest</option>
          <option value="views">Sort: Most viewed</option>
          <option value="likes">Sort: Most liked</option>
          <option value="comments">Sort: Most commented</option>
          <option value="engagement">Sort: Highest engagement</option>
          <option value="relevance">Sort: Most relevant</option>
        </Select>
        {showContent && (
          <Select aria-label="Content type" value={filters.content} onChange={(e) => set({ content: e.target.value as VideoFilters["content"] })} className="w-36">
            <option value="all">All types</option>
            <option value="video">Videos</option>
            <option value="short">Shorts</option>
            <option value="live">Live</option>
          </Select>
        )}
        <Input aria-label="Filter by keyword" placeholder="Keyword…" defaultValue={filters.q ?? ""} onKeyDown={(e) => e.key === "Enter" && set({ q: (e.target as HTMLInputElement).value.trim() || undefined, sort: (e.target as HTMLInputElement).value.trim() ? "relevance" : filters.sort })} onBlur={(e) => e.target.value.trim() !== (filters.q ?? "") && set({ q: e.target.value.trim() || undefined })} className="w-40" />
        <Button variant={open || active ? "secondary" : "outline"} size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <SlidersHorizontal /> Filters{active ? ` (${active})` : ""}
        </Button>
        {active > 0 && (
          <Button variant="ghost" size="sm" onClick={() => onChange({ ...DEFAULT_VIDEO_FILTERS, content: filters.content, sort: filters.sort })}>
            <RotateCcw /> Clear
          </Button>
        )}
      </div>
      {open && (
        <div className="grid grid-cols-2 gap-3 rounded-xl border bg-muted/30 p-3 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="Published from">
            <Input type="date" value={filters.from ?? ""} max={filters.to ?? todayKey()} onChange={(e) => set({ from: e.target.value || undefined })} />
          </Field>
          <Field label="Published to">
            <Input type="date" value={filters.to ?? ""} min={filters.from} max={todayKey()} onChange={(e) => set({ to: e.target.value || undefined })} />
          </Field>
          <Field label="Duration">
            <Select value={filters.duration} onChange={(e) => set({ duration: e.target.value as VideoFilters["duration"] })}>
              <option value="any">Any</option>
              <option value="short">Under 4 min</option>
              <option value="medium">4–20 min</option>
              <option value="long">Over 20 min</option>
            </Select>
          </Field>
          <NumberField label="Min views" value={filters.minViews} onCommit={(v) => set({ minViews: v })} />
          <NumberField label="Min likes" value={filters.minLikes} onCommit={(v) => set({ minLikes: v })} />
          <NumberField label="Min engagement %" value={filters.minEngagement} step={0.1} onCommit={(v) => set({ minEngagement: v })} placeholder="e.g. 2" />
        </div>
      )}
    </div>
  );
}
