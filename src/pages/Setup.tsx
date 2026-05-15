import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  getCurrentWindow,
  availableMonitors,
  LogicalPosition,
  LogicalSize,
} from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { api } from "../api";
import AppHeader from "../components/AppHeader";
import AppFooter from "../components/AppFooter";
import ScreenPermissionModal from "../components/ScreenPermissionModal";
import { openRecordingWindows } from "../lib/recordingWindows";
import { loadSettings, saveSettings } from "../lib/settings";
import { useScreenPermission } from "../lib/useScreenPermission";
import type { Region } from "../types";

interface DesktopBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function computeVirtualDesktopBounds(): Promise<DesktopBounds> {
  const monitors = await availableMonitors();
  if (monitors.length === 0) {
    throw new Error("未检测到任何显示器");
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxR = -Infinity;
  let maxB = -Infinity;
  for (const m of monitors) {
    const scale = m.scaleFactor || 1;
    const lx = m.position.x / scale;
    const ly = m.position.y / scale;
    const lw = m.size.width / scale;
    const lh = m.size.height / scale;
    minX = Math.min(minX, lx);
    minY = Math.min(minY, ly);
    maxR = Math.max(maxR, lx + lw);
    maxB = Math.max(maxB, ly + lh);
  }
  return {
    x: Math.round(minX),
    y: Math.round(minY),
    width: Math.round(maxR - minX),
    height: Math.round(maxB - minY),
  };
}

export default function Setup() {
  const navigate = useNavigate();
  const [meetingName, setMeetingName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [autoDetect, setAutoDetect] = useState(() => loadSettings().autoDetect);
  const { granted: permGranted, recheck: permRecheck } = useScreenPermission();
  const [permModalOpen, setPermModalOpen] = useState(false);

  const toggleAutoDetect = (next: boolean) => {
    setAutoDetect(next);
    saveSettings({ autoDetect: next });
  };

  // Real-time validation: block illegal chars at the input level.
  const onNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Strip illegal chars silently rather than show error every keystroke;
    // but warn the user.
    const filtered = raw.replace(/[<>:"/\\|?*]/g, "");
    setMeetingName(filtered);
    if (filtered !== raw) {
      setNameError('已自动移除非法字符: < > : " / \\ | ? *');
    } else {
      setNameError(null);
    }
  };

  const onNameBlur = async () => {
    const v = meetingName.trim();
    if (!v) return;
    try {
      await api.validateMeetingName(v);
      setNameError(null);
    } catch (e) {
      setNameError(String(e));
    }
  };

  useEffect(() => {
    const unlisten = listen<Region>("region-selected", (event) => {
      setRegion(event.payload);
      setSelecting(false);
    });
    const unlistenCancel = listen("region-cancelled", () => {
      setSelecting(false);
    });
    return () => {
      unlisten.then((f) => f());
      unlistenCancel.then((f) => f());
    };
  }, []);

  const openRegionSelector = async () => {
    setSelecting(true);
    try {
      const existing = await WebviewWindow.getByLabel("region-select");
      if (existing) {
        await existing.close();
      }
      const bounds = await computeVirtualDesktopBounds();
      console.log("[region-select] virtual desktop bounds (logical):", bounds);
      // Hide main window during selection so it doesn't get in the way.
      await getCurrentWindow().hide();
      // Use a manually-positioned borderless transparent window covering the
      // virtual desktop union — avoids macOS fullscreen Space switch.
      const win = new WebviewWindow("region-select", {
        url: "index.html#/region-select",
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        alwaysOnTop: true,
        decorations: false,
        transparent: true,
        skipTaskbar: true,
        focus: true,
        resizable: false,
        title: "选择区域",
      });
      // Ensure position & size are applied even if some macOS constraint
      // rejected the initial values (e.g. menu-bar overlap).
      win.once("tauri://created", async () => {
        try {
          await win.setPosition(new LogicalPosition(bounds.x, bounds.y));
          await win.setSize(new LogicalSize(bounds.width, bounds.height));
        } catch (e) {
          console.error("region window resize error", e);
        }
      });
      win.once("tauri://error", (e) => {
        console.error("region window error", e);
        setSelecting(false);
        getCurrentWindow().show();
      });
    } catch (e) {
      console.error(e);
      setSelecting(false);
      try {
        await getCurrentWindow().show();
      } catch {
        /* ignore */
      }
      alert(`打开区域选择器失败: ${e}`);
    }
  };

  // When region-select closes, restore main window.
  useEffect(() => {
    const unlisten = listen("region-window-closed", () => {
      getCurrentWindow().show();
      getCurrentWindow().setFocus();
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const canStart =
    meetingName.trim().length > 0 && !nameError && region !== null;

  const handleStart = async () => {
    if (!region) return;
    // Hard gate: without Screen Recording permission, captures only see the
    // wallpaper. Re-check live (not the cached state) in case the user just
    // granted it without us seeing the focus event.
    const ok = await permRecheck();
    if (!ok) {
      setPermModalOpen(true);
      return;
    }
    try {
      await api.validateMeetingName(meetingName);
      await api.startRecording(meetingName, region);
      navigate("/review");
      await openRecordingWindows(region);
      await getCurrentWindow().hide();
    } catch (e) {
      alert(`启动失败: ${e}`);
    }
  };

  return (
    <div className="app-container">
      <AppHeader />
      <main className="app-content">
      <h1 className="app-title">新建录制</h1>
      <p className="app-subtitle">命名会议，框选 PPT 区域，按快捷键开始截图</p>

      <div className="card">
        <div className="field">
          <label>会议名称</label>
          <input
            type="text"
            value={meetingName}
            onChange={onNameChange}
            onBlur={onNameBlur}
            placeholder="例如：季度总结会"
            className={nameError ? "error" : ""}
            autoFocus
          />
          {nameError ? (
            <div className="error-text">{nameError}</div>
          ) : (
            <div className="hint">
              不允许的字符: {"< > : \" / \\ | ? *"}
            </div>
          )}
        </div>

        <div className="field">
          <label>录制区域</label>
          {region ? (
            <div className="row">
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {region.width} × {region.height} @ ({region.x}, {region.y})
              </span>
              <button className="secondary" onClick={openRegionSelector}>
                重新选择
              </button>
            </div>
          ) : (
            <button className="secondary" onClick={openRegionSelector} disabled={selecting}>
              {selecting ? "请在屏幕上拖动选择…" : "选择屏幕区域"}
            </button>
          )}
        </div>

        <label className="toggle-row">
          <div className="toggle-text">
            <div className="toggle-title">自动翻页检测</div>
            <div className="toggle-hint">检测到 PPT 翻页时自动截图</div>
          </div>
          <input
            type="checkbox"
            className="toggle-switch"
            checked={autoDetect}
            onChange={(e) => toggleAutoDetect(e.target.checked)}
          />
        </label>
      </div>

      {permGranted === false && (
        <div className="hint" style={{ color: "var(--danger, #d33)" }}>
          ⚠️ 未授予屏幕录制权限，截屏将只能看到桌面壁纸。
          <button
            className="ghost"
            style={{ marginLeft: 8, padding: "2px 8px" }}
            onClick={() => setPermModalOpen(true)}
          >
            去授权
          </button>
        </div>
      )}

      <div className="row">
        <button onClick={handleStart} disabled={!canStart}>
          开始录制
        </button>
        <button className="secondary" onClick={() => navigate("/")}>
          取消
        </button>
      </div>

      </main>
      <AppFooter />

      <ScreenPermissionModal
        open={permModalOpen}
        onClose={() => setPermModalOpen(false)}
        onRecheck={permRecheck}
      />
    </div>
  );
}
