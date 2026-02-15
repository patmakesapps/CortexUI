"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  DEFAULT_UI_SKIN,
  applyUiSkin,
  resolveUiSkin,
  UI_SKIN_STORAGE_KEY,
  type UiSkinId
} from "@/lib/ui/theme";
import brainIcon from "../../../brain_icon.png";

export function ThemeSelect() {
  const [skin, setSkin] = useState<UiSkinId>(DEFAULT_UI_SKIN);

  useEffect(() => {
    const stored =
      typeof window === "undefined" ? null : window.localStorage.getItem(UI_SKIN_STORAGE_KEY);
    setSkin(resolveUiSkin(stored));
  }, []);

  const isDark = skin === "dark";
  const nextSkin: UiSkinId = isDark ? "light" : "dark";
  const nextLabel = isDark ? "Switch to light theme" : "Switch to dark theme";

  return (
    <button
      type="button"
      className="ui-button inline-flex h-[34px] w-[34px] items-center justify-center rounded-full p-0 text-xs transition"
      aria-label={nextLabel}
      title={nextLabel}
      onClick={() => setSkin(applyUiSkin(nextSkin))}
    >
      <Image
        src={brainIcon}
        alt=""
        aria-hidden="true"
        className={`h-4 w-4 object-contain ${
          isDark
            ? "[filter:brightness(0)_invert(1)_sepia(1)_saturate(480%)_hue-rotate(168deg)]"
            : "[filter:brightness(0)_invert(0.18)_sepia(1)_saturate(540%)_hue-rotate(14deg)]"
        }`}
      />
    </button>
  );
}
