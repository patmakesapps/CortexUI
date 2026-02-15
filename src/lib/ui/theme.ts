export type UiSkinId = "light" | "dark";

export type UiSkinOption = {
  id: UiSkinId;
  label: string;
  enabled: boolean;
};

export const UI_SKIN_STORAGE_KEY = "cortex-ui-skin";
export const DEFAULT_UI_SKIN: UiSkinId = "dark";

// Toggle skins on/off with 1 (enabled) or 0 (disabled).
export const UI_SKIN_FLAGS: Record<UiSkinId, 0 | 1> = {
  light: 1,
  dark: 1
};

export const UI_SKIN_OPTIONS: UiSkinOption[] = [
  { id: "light", label: "Light", enabled: UI_SKIN_FLAGS.light === 1 },
  { id: "dark", label: "Dark", enabled: UI_SKIN_FLAGS.dark === 1 }
];

export function isUiSkinEnabled(skin: UiSkinId): boolean {
  return UI_SKIN_FLAGS[skin] === 1;
}

export function resolveUiSkin(raw: string | null | undefined): UiSkinId {
  if (raw === "light" || raw === "2") return isUiSkinEnabled("light") ? "light" : DEFAULT_UI_SKIN;
  if (raw === "dark" || raw === "3") return isUiSkinEnabled("dark") ? "dark" : DEFAULT_UI_SKIN;
  return DEFAULT_UI_SKIN;
}

export function enabledUiSkinOptions(): UiSkinOption[] {
  return UI_SKIN_OPTIONS.filter((option) => option.enabled);
}

export function applyUiSkin(skin: UiSkinId): UiSkinId {
  const next = resolveUiSkin(skin);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(UI_SKIN_STORAGE_KEY, next);
    document.documentElement.setAttribute("data-ui-skin", next);
  }
  return next;
}
