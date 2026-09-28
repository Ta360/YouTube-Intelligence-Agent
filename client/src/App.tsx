import { lazy, Suspense, type ComponentType } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthGate } from "@/components/auth/Auth";
import { LoadingGrid } from "@/components/common/states";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ChartThemeProvider } from "@/theme/chartTheme";

const named = <T extends Record<string, unknown>>(loader: () => Promise<T>, name: keyof T) =>
  lazy(() => loader().then((m) => ({ default: m[name] as ComponentType })));

const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const SearchPage = lazy(() => import("@/pages/SearchPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const library = () => import("@/pages/LibraryPages");
const activity = () => import("@/pages/ActivityPages");
const workspace = () => import("@/pages/WorkspacePages");
const ChannelsPage = named(library, "ChannelsPage");
const CreatorPage = named(library, "CreatorPage");
const VideosPage = named(library, "VideosPage");
const PlaylistsPage = named(library, "PlaylistsPage");
const PlaylistPage = named(library, "PlaylistPage");
const HistoryPage = named(activity, "HistoryPage");
const AnalyticsPage = named(activity, "AnalyticsPage");
const CalendarPage = named(activity, "CalendarPage");
const SavedPage = named(workspace, "SavedPage");
const ResearchPage = named(workspace, "ResearchPage");
const AgentPage = named(workspace, "AgentPage");

export default function App() {
  return (
    <BrowserRouter>
      <AuthGate>
        <ChartThemeProvider>
          <DashboardLayout>
            <Suspense fallback={<LoadingGrid />}>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/channels" element={<ChannelsPage />} />
                <Route path="/channels/:id" element={<CreatorPage />} />
                <Route path="/videos" element={<VideosPage />} />
                <Route path="/playlists" element={<PlaylistsPage />} />
                <Route path="/playlists/:id" element={<PlaylistPage />} />
                <Route path="/history" element={<HistoryPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/saved" element={<SavedPage />} />
                <Route path="/research" element={<ResearchPage />} />
                <Route path="/agent" element={<AgentPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </DashboardLayout>
        </ChartThemeProvider>
      </AuthGate>
    </BrowserRouter>
  );
}
