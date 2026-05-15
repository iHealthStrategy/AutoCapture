export const DEFAULT_HOTKEY = "CommandOrControl+Shift+G";

const STORAGE_KEY = "app:settings:v1";

export type FlipSensitivity = "very_high" | "high" | "normal" | "strict";

export interface FlipSensitivityPreset {
  label: string;
  hint: string;
  /** Peak MAD threshold passed to the page-flip detector. */
  minPeakMad: number;
}

/// Ordered from most sensitive (catches small changes) to most strict
/// (only fires on big scene cuts). The numeric `minPeakMad` is what the
/// detector actually consumes.
export const FLIP_SENSITIVITY_ORDER: FlipSensitivity[] = [
  "very_high",
  "high",
  "normal",
  "strict",
];

export const FLIP_SENSITIVITY_PRESETS: Record<
  FlipSensitivity,
  FlipSensitivityPreset
> = {
  very_high: { label: "最灵敏", hint: "翻页幅度小、相邻页差异小", minPeakMad: 6 },
  high: { label: "较灵敏", hint: "默认；适合大多数 PPT", minPeakMad: 8 },
  normal: { label: "标准", hint: "过滤光标、字幕条等小扰动", minPeakMad: 11 },
  strict: { label: "严格", hint: "只在画面大幅切换时触发", minPeakMad: 15 },
};

export const DEFAULT_FLIP_SENSITIVITY: FlipSensitivity = "high";

export interface AppSettings {
  hotkey: string;
  autoDetect: boolean;
  flipSensitivity: FlipSensitivity;
}

const DEFAULTS: AppSettings = {
  hotkey: DEFAULT_HOTKEY,
  autoDetect: true,
  flipSensitivity: DEFAULT_FLIP_SENSITIVITY,
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULTS, ...parsed };
    }
  } catch (e) {
    console.error("loadSettings", e);
  }
  return { ...DEFAULTS };
}

export function saveSettings(patch: Partial<AppSettings>) {
  const merged = { ...loadSettings(), ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
}

/** Pretty-print a Tauri accelerator string using macOS-style symbols. */
export function prettyHotkey(accel: string): string {
  const isMac = navigator.platform.toLowerCase().includes("mac");
  return accel
    .split("+")
    .map((k) => {
      const u = k.trim();
      if (u === "CommandOrControl") return isMac ? "⌘" : "Ctrl";
      if (u === "Command" || u === "Cmd" || u === "Meta" || u === "Super")
        return "⌘";
      if (u === "Control" || u === "Ctrl") return isMac ? "⌃" : "Ctrl";
      if (u === "Shift") return "⇧";
      if (u === "Alt" || u === "Option") return isMac ? "⌥" : "Alt";
      if (u === "ArrowUp") return "↑";
      if (u === "ArrowDown") return "↓";
      if (u === "ArrowLeft") return "←";
      if (u === "ArrowRight") return "→";
      if (u === "Space") return "Space";
      return u;
    })
    .join(isMac ? "" : "+");
}
