/**
 * Centralized UI theme. Every color in the interface comes from these tokens: they are written
 * to CSS custom properties at startup (see `applyTheme`) and Tailwind utilities read them
 * (see index.css). Change a value here and the whole dashboard follows.
 */
export interface ThemeTokens {
  background: string;
  surface: string;
  surfaceSecondary: string;
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  danger: string;
  text: string;
  mutedText: string;
  border: string;
}

export const THEME: Record<"dark" | "light", ThemeTokens> = {
  // Dark-first palette (as specified).
  dark: {
    background: "#0B1020",
    surface: "#111827",
    surfaceSecondary: "#1F2937",
    primary: "#6366F1",
    secondary: "#06B6D4",
    success: "#22C55E",
    warning: "#F59E0B",
    danger: "#EF4444",
    text: "#F9FAFB",
    mutedText: "#9CA3AF",
    border: "#374151",
  },
  // Light mode: its own selected steps (not an automatic inversion).
  light: {
    background: "#F4F6FB",
    surface: "#FFFFFF",
    surfaceSecondary: "#EEF1F7",
    primary: "#4F46E5",
    secondary: "#0891B2",
    success: "#16A34A",
    warning: "#D97706",
    danger: "#DC2626",
    text: "#0F172A",
    mutedText: "#5B6477",
    border: "#D8DEE9",
  },
};

const toVar = (k: string) => `--${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;

/** Writes the theme tokens for `mode` to :root as CSS custom properties. */
export function applyTheme(mode: "dark" | "light") {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(THEME[mode])) root.style.setProperty(toVar(k), v);
  root.classList.toggle("dark", mode === "dark");
}
