import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, KeyRound, Loader2, Moon, Palette, RotateCcw, Server, Settings, ShieldCheck, Sun } from "lucide-react";
import { useAuth } from "@/components/auth/Auth";
import { SimpleBarChart } from "@/components/charts/Charts";
import { ErrorState, PageHeader, StatusDot } from "@/components/common/states";
import { toast } from "@/components/common/toast";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Skeleton } from "@/components/ui/primitives";
import { useSystemStatus } from "@/hooks/queries";
import { api, ApiError } from "@/lib/api";
import { CATEGORICAL_ORDER, CHART_COLOR_LABELS, HEX_RE, SERIES_COLOR, useChartTheme, type ChartColorKey } from "@/theme/chartTheme";
import { useTheme } from "@/theme/themeProvider";

function ChartColorsCard() {
  const t = useChartTheme();
  const usedBy = (k: ChartColorKey) => Object.entries(SERIES_COLOR).filter(([, v]) => v === k).map(([m]) => m);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="size-4" /> Chart colors
        </CardTitle>
        <CardDescription>One central HEX palette drives every bar, line and donut chart. Changes apply instantly and are saved to your account.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(CHART_COLOR_LABELS) as ChartColorKey[]).map((k) => {
            const raw = t.raw[k];
            const valid = HEX_RE.test(raw);
            return (
              <div key={k} className="flex items-center gap-3 rounded-xl border p-2.5">
                <input type="color" value={valid ? raw : t.colors[k]} onChange={(e) => t.setColor(k, e.target.value.toUpperCase())} aria-label={`${CHART_COLOR_LABELS[k]} color picker`} className="size-10 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {CHART_COLOR_LABELS[k]} {k === "danger" && <span className="text-xs text-muted-foreground">(errors only)</span>}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">{usedBy(k).length ? `Used for: ${usedBy(k).join(", ")}` : CATEGORICAL_ORDER.includes(k) ? `Categorical slot ${CATEGORICAL_ORDER.indexOf(k) + 1}` : "Status color"}</p>
                </div>
                <Input value={raw} onChange={(e) => t.setColor(k, e.target.value.trim())} aria-label={`${CHART_COLOR_LABELS[k]} hex value`} aria-invalid={!valid} className={`w-28 font-mono uppercase ${valid ? "" : "border-danger"}`} maxLength={7} />
              </div>
            );
          })}
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Categorical order (donut slices, comparisons)</p>
          <div className="flex h-8 overflow-hidden rounded-lg">
            {CATEGORICAL_ORDER.map((k) => (
              <div key={k} className="flex-1" style={{ background: t.colors[k] }} title={`${CHART_COLOR_LABELS[k]} ${t.colors[k]}`} />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void t.reset().then(() => toast.success("Chart colors reset"))}>
            <RotateCcw /> Reset to defaults
          </Button>
          {t.saving && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Saving…
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ApiConfigCard() {
  const status = useSystemStatus();
  const cfg = useQuery({ queryKey: ["config"], queryFn: api.config });
  const t = useChartTheme();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="size-4" /> API configuration
        </CardTitle>
        <CardDescription>
          Keys live only in <code className="rounded bg-muted px-1">server/.env</code> on the server and are never sent to the browser. Restart the server after changing them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {status.data && (
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ["YouTube API", status.data.youtube],
              ["Web Search", status.data.web],
              ["AI Agent", status.data.ai],
              ["Database", status.data.database],
            ].map(([k, s]) => {
              const st = s as typeof status.data.youtube;
              return (
                <div key={k as string} className="flex items-start gap-2 rounded-xl border p-2.5">
                  <span className="mt-1.5">
                    <StatusDot state={st.state} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {k as string}: {st.label}
                    </p>
                    <p className="text-xs text-muted-foreground">{st.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {cfg.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : cfg.error ? (
          <ErrorState error={cfg.error} compact />
        ) : cfg.data ? (
          <>
            <div className="overflow-x-auto rounded-xl border scrollbar-thin">
              <table className="w-full min-w-[34rem] text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Environment variable</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  {cfg.data.variables.map((v) => (
                    <tr key={v.name} className="border-t">
                      <td className="px-3 py-2 font-mono text-xs">
                        {v.name} {v.required && <Badge variant="outline">required</Badge>}
                      </td>
                      <td className="px-3 py-2">
                        {v.value ? (
                          <Badge variant="secondary">{v.value}</Badge>
                        ) : v.set ? (
                          <span className="inline-flex items-center gap-1 text-success">
                            <CheckCircle2 className="size-4" /> Set
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 ${v.required ? "text-danger" : "text-muted-foreground"}`}>
                            <CircleAlert className="size-4" /> Not set
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{v.purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-1 text-sm font-semibold">YouTube quota used (last 14 days, UTC)</p>
                {cfg.data.quotaHistory.length ? <SimpleBarChart data={cfg.data.quotaHistory} xKey="day" yKey="units" name="Quota units" color={t.colors.primary} xFormatter={(d) => d.slice(5)} /> : <p className="text-sm text-muted-foreground">No API calls yet.</p>}
              </div>
              <div>
                <p className="mb-1 text-sm font-semibold">Quota cost per call</p>
                <ul className="space-y-1 text-sm">
                  {cfg.data.quotaCosts.map((c) => (
                    <li key={c.call} className="flex justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
                      <span>{c.call}</span>
                      <span className="font-semibold tabular-nums">{c.units}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">Responses are cached and stored, so revisiting a creator, video or playlist costs nothing. The default project quota is 10,000 units/day and resets at midnight Pacific Time.</p>
              </div>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AccountCard() {
  const { user, signOutEverywhere } = useAuth();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.changePassword({ currentPassword: cur, newPassword: next });
      setCur("");
      setNext("");
      toast.success("Password changed — other sessions were signed out");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not change password");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4" /> Account &amp; security
        </CardTitle>
        <CardDescription>
          Signed in as {user.name} ({user.email})
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} placeholder="Current password" autoComplete="current-password" aria-label="Current password" required />
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="New password (8+ chars, letter + number)" autoComplete="new-password" aria-label="New password" required />
          <Button type="submit" disabled={busy || !cur || next.length < 8}>
            {busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Change password
          </Button>
        </form>
        <Button variant="outline" className="text-danger" onClick={() => void signOutEverywhere()}>
          Sign out of all devices
        </Button>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const { mode, toggle } = useTheme();
  return (
    <div className="space-y-5">
      <PageHeader icon={<Settings />} title="Settings" description="Appearance, chart colors, API configuration and your account." />
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>The interface is dark-first. UI colors are defined centrally in src/theme/theme.ts.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={toggle}>
            {mode === "dark" ? <Sun /> : <Moon />} Switch to {mode === "dark" ? "light" : "dark"} mode
          </Button>
        </CardContent>
      </Card>
      <ChartColorsCard />
      <ApiConfigCard />
      <AccountCard />
    </div>
  );
}
