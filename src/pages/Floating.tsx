import { useEffect, useRef, useState } from "react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  register,
  unregister,
  isRegistered,
} from "@tauri-apps/plugin-global-shortcut";
import { api } from "../api";
import { closeRecordingWindows, saveFloatingPosition } from "../lib/recordingWindows";
import { loadSettings, prettyHotkey, FLIP_SENSITIVITY_PRESETS } from "../lib/settings";
import { usePageFlipDetector } from "../lib/usePageFlipDetector";
import { playShutterSound } from "../lib/sound";
import { IconX, IconPause, IconPlay } from "../components/icons";
import owlClose from "../assets/owl/eyes_close.png";
import owlHalf from "../assets/owl/half_open.png";
import owlOpen from "../assets/owl/eye_open.png";
import type { RecorderStatus } from "../types";

const SETTINGS = loadSettings();
const HOTKEY = SETTINGS.hotkey;
const HOTKEY_LABEL = prettyHotkey(HOTKEY);
const FLIP_MIN_PEAK_MAD =
  FLIP_SENSITIVITY_PRESETS[SETTINGS.flipSensitivity].minPeakMad;
// Pixel threshold to distinguish a click from a drag on the owl.
const DRAG_THRESHOLD_PX = 4;

export default function Floating() {
  const [status, setStatus] = useState<RecorderStatus | null>(null);
  const [eyeOpen, setEyeOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const eyeOpenTimerRef = useRef<number | null>(null);
  const resetBaselineRef = useRef<(() => void) | null>(null);
  // Auto-detect is configured in Setup; the floating window only consumes it.
  const autoDetect = SETTINGS.autoDetect;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api.recorderStatus();
        if (!cancelled) setStatus(s);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist position on every move so next session opens at the same place.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    (async () => {
      const win = getCurrentWindow();
      try {
        unlisten = await win.onMoved(async () => {
          try {
            const pos = await win.outerPosition();
            const scale = await win.scaleFactor();
            saveFloatingPosition(pos.x / scale, pos.y / scale);
          } catch {
            /* ignore */
          }
        });
      } catch (e) {
        console.error("onMoved", e);
      }
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (eyeOpenTimerRef.current) window.clearTimeout(eyeOpenTimerRef.current);
    };
  }, []);

  const triggerFlash = () => {
    setEyeOpen(true);
    if (eyeOpenTimerRef.current) window.clearTimeout(eyeOpenTimerRef.current);
    eyeOpenTimerRef.current = window.setTimeout(() => setEyeOpen(false), 500);
    playShutterSound();
    // Tell the region overlay to flash its frame.
    emit("capture-flash").catch((e) => console.error("emit capture-flash", e));
  };

  const handleCapture = async () => {
    if (pausedRef.current) return;
    // Reset detector baseline so the just-captured frame becomes the new
    // reference — otherwise the slide we just shot would keep triggering.
    resetBaselineRef.current?.();
    // Optimistic UI: flash + bump count immediately so the user feels instant
    // feedback; we'll reconcile with the real count once the backend returns.
    triggerFlash();
    setStatus((prev) =>
      prev
        ? { ...prev, captured_count: (prev.captured_count ?? 0) + 1 }
        : prev,
    );
    try {
      const s = await api.captureOne();
      setStatus(s);
    } catch (e) {
      console.error(e);
      // Roll back optimistic increment on failure.
      try {
        const real = await api.recorderStatus();
        setStatus(real);
      } catch {
        /* ignore */
      }
      alert(`截图失败: ${e}`);
    }
  };

  const { debug: flipDebug, resetBaseline } = usePageFlipDetector({
    region: status?.region ?? null,
    enabled: autoDetect && status?.state === "recording" && !paused,
    minPeakMad: FLIP_MIN_PEAK_MAD,
    onFlip: () => {
      handleCapture();
    },
  });
  resetBaselineRef.current = resetBaseline;

  // Icon state: eye_open while a capture just fired (500ms), half_open while the
  // detector sees motion above the noise floor, closed otherwise.
  const dockState: "open" | "half" | "close" = eyeOpen
    ? "open"
    : flipDebug && flipDebug.mad > 0.5
      ? "half"
      : "close";
  const owlSrc =
    dockState === "open" ? owlOpen : dockState === "half" ? owlHalf : owlClose;

  // Mirror the floating-window owl state to the macOS Dock icon.
  useEffect(() => {
    api.setDockIcon(dockState).catch(() => {});
  }, [dockState]);

  // Reset the Dock to the default (close) when the floating window unmounts.
  useEffect(() => {
    return () => {
      api.setDockIcon("close").catch(() => {});
    };
  }, []);

  // Register global shortcut on mount.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const already = await isRegistered(HOTKEY);
        if (already) await unregister(HOTKEY);
        await register(HOTKEY, (event) => {
          if (event.state === "Pressed" && active) {
            handleCapture();
          }
        });
      } catch (e) {
        console.error("register hotkey failed", e);
      }
    })();
    return () => {
      active = false;
      unregister(HOTKEY).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTogglePause = () => {
    setPaused((p) => {
      const next = !p;
      // Resuming: refresh the baseline so the first poll doesn't fire on the
      // accumulated diff since pause started.
      if (!next) resetBaselineRef.current?.();
      return next;
    });
  };

  const handleStop = async () => {
    try {
      await api.stopRecording();
      const main = await WebviewWindow.getByLabel("main");
      if (main) {
        await main.emit("navigate", "/review");
        await main.emit("recording-stopped");
        await main.show();
        await main.setFocus();
      }
      await closeRecordingWindows();
    } catch (e) {
      alert(`停止失败: ${e}`);
    }
  };

  // Owl mousedown: defer between click (capture) and drag (window-move) based
  // on whether the cursor moves past a small threshold before release.
  const handleOwlMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".owl-close")) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let didDrag = false;

    const onMove = (m: MouseEvent) => {
      if (didDrag) return;
      const dx = m.clientX - startX;
      const dy = m.clientY - startY;
      if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
      didDrag = true;
      cleanup();
      getCurrentWindow()
        .startDragging()
        .catch((err) => console.error("startDragging", err));
    };

    const onUp = () => {
      cleanup();
      if (!didDrag) handleCapture();
    };

    const cleanup = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div className="floating-root">
      <div
        className={`owl-capture${paused ? " is-paused" : ""}`}
        onMouseDown={handleOwlMouseDown}
        title={
          paused
            ? "已暂停 · 点击左上角恢复"
            : `截图 (${HOTKEY_LABEL}) · 拖动移动`
        }
      >
        <button
          type="button"
          className="owl-pause"
          onClick={(e) => {
            e.stopPropagation();
            handleTogglePause();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          title={paused ? "恢复录制" : "暂停录制"}
          aria-label={paused ? "恢复录制" : "暂停录制"}
        >
          {paused ? (
            <IconPlay width={10} height={10} />
          ) : (
            <IconPause width={10} height={10} />
          )}
        </button>
        <div className="owl-mascot">
          <img src={owlSrc} alt="" draggable={false} />
        </div>
        <div className="owl-count">
          {paused ? "已暂停" : `${status?.captured_count ?? 0} 张`}
        </div>
        <button
          type="button"
          className="owl-close"
          onClick={(e) => {
            e.stopPropagation();
            handleStop();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          title="结束录制"
          aria-label="结束录制"
        >
          <IconX width={10} height={10} />
        </button>
      </div>
    </div>
  );
}
