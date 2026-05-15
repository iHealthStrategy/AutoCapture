import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { Region } from "../types";

// Must match `.region-overlay-frame` border width in styles.css.
// The overlay window is inflated by this many pixels on every side so the
// frame sits OUTSIDE the recording region, keeping the captured area clean.
export const OVERLAY_BORDER = 3;

// Height reserved at the top of the overlay window for the meeting-name label.
// Also sits OUTSIDE the recording region.
export const OVERLAY_LABEL_HEIGHT = 24;

export async function openRecordingWindows(region: Region) {
  const oldFloat = await WebviewWindow.getByLabel("floating");
  if (oldFloat) await oldFloat.close();
  const oldOverlay = await WebviewWindow.getByLabel("region-overlay");
  if (oldOverlay) await oldOverlay.close();

  // Overlay window: inflated by OVERLAY_BORDER on every side, plus extra
  // OVERLAY_LABEL_HEIGHT on top for the meeting-name label. The inner
  // transparent area of the window equals the recording region exactly.
  new WebviewWindow("region-overlay", {
    url: "index.html#/region-overlay",
    x: region.x - OVERLAY_BORDER,
    y: region.y - OVERLAY_BORDER - OVERLAY_LABEL_HEIGHT,
    width: region.width + OVERLAY_BORDER * 2,
    height: region.height + OVERLAY_BORDER * 2 + OVERLAY_LABEL_HEIGHT,
    alwaysOnTop: true,
    decorations: false,
    transparent: true,
    skipTaskbar: true,
    focus: false,
    resizable: false,
    shadow: false,
    title: "录制区域",
  });

  const { x: fx, y: fy } = loadFloatingPosition();
  new WebviewWindow("floating", {
    url: "index.html#/floating",
    width: 96,
    height: 84,
    alwaysOnTop: true,
    decorations: false,
    transparent: true,
    skipTaskbar: true,
    resizable: false,
    shadow: false,
    title: "录制中",
    x: fx,
    y: fy,
  });
}

const FLOATING_POS_KEY = "floating:pos";

export function loadFloatingPosition(): { x: number; y: number } {
  try {
    const raw = localStorage.getItem(FLOATING_POS_KEY);
    if (raw) {
      const v = JSON.parse(raw);
      if (typeof v.x === "number" && typeof v.y === "number") return v;
    }
  } catch {
    /* ignore */
  }
  return { x: 100, y: 100 };
}

export function saveFloatingPosition(x: number, y: number) {
  try {
    localStorage.setItem(FLOATING_POS_KEY, JSON.stringify({ x, y }));
  } catch {
    /* ignore */
  }
}

export async function closeRecordingWindows() {
  const overlay = await WebviewWindow.getByLabel("region-overlay");
  if (overlay) await overlay.close();
  const float = await WebviewWindow.getByLabel("floating");
  if (float) await float.close();
}
