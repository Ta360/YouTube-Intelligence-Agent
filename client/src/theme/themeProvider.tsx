import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import { applyTheme, THEME, type ThemeTokens } from "./theme";

type Mode = "dark" | "light";
const ThemeContext = createContext<{ mode: Mode; tokens: ThemeTokens; toggle: () => void }>({ mode: "dark", tokens: THEME.dark, toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>(() => (document.documentElement.classList.contains("dark") ? "dark" : "light"));
  useLayoutEffect(() => {
    applyTheme(mode);
    try {
      localStorage.setItem("yia-theme", mode);
    } catch {
      /* storage unavailable */
    }
  }, [mode]);
  return <ThemeContext.Provider value={{ mode, tokens: THEME[mode], toggle: () => setMode((m) => (m === "dark" ? "light" : "dark")) }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
