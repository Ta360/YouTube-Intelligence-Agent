import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Toast = { id: number; kind: "success" | "error"; text: string };
let next = 1;
const listeners = new Set<(t: Toast) => void>();
const emit = (kind: Toast["kind"], text: string) => listeners.forEach((l) => l({ id: next++, kind, text }));

export const toast = { success: (t: string) => emit("success", t), error: (t: string) => emit("error", t) };

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const on = (t: Toast) => {
      setItems((s) => [...s.slice(-3), t]);
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== t.id)), 3500);
    };
    listeners.add(on);
    return () => void listeners.delete(on);
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-20 left-1/2 z-[70] flex w-[92vw] max-w-sm -translate-x-1/2 flex-col gap-2 md:bottom-6" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} role="status" className={cn("pointer-events-auto flex items-start gap-2 rounded-xl border bg-card-solid p-3 text-sm shadow-xl animate-fade-up", t.kind === "error" ? "border-danger/40" : "border-success/40")}>
          {t.kind === "error" ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />}
          <span className="flex-1">{t.text}</span>
          <button onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))} aria-label="Dismiss" className="cursor-pointer text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
