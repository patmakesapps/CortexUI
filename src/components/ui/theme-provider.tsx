"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { DEFAULT_UI_SKIN, UI_SKIN_STORAGE_KEY, resolveUiSkin } from "@/lib/ui/theme";

export function UiThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const stored =
      typeof window === "undefined" ? null : window.localStorage.getItem(UI_SKIN_STORAGE_KEY);
    const activeSkin = resolveUiSkin(stored);
    const root = document.documentElement;
    root.setAttribute("data-ui-skin", activeSkin);
    if (!stored) {
      window.localStorage.setItem(UI_SKIN_STORAGE_KEY, DEFAULT_UI_SKIN);
    }
  }, []);

  return children;
}
