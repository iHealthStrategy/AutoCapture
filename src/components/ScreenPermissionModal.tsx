import { useEffect } from "react";
import { api } from "../api";

interface Props {
  open: boolean;
  onClose: () => void;
  onRecheck: () => void;
}

export default function ScreenPermissionModal({
  open,
  onClose,
  onRecheck,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleGrant = async () => {
    // First call registers the app with TCC (so it appears in the Screen
    // Recording list) and on the very first run shows the system prompt.
    // After that the call is a no-op silent state read — so we also open
    // System Settings directly to cover the "previously denied" case.
    try {
      await api.requestScreenRecordingPermission();
    } catch (e) {
      console.error("requestScreenRecordingPermission failed", e);
    }
    try {
      await api.openScreenRecordingSettings();
    } catch (e) {
      console.error("openScreenRecordingSettings failed", e);
    }
    onRecheck();
  };

  const handleRelaunch = async () => {
    try {
      await api.relaunchApp();
    } catch (e) {
      console.error("relaunchApp failed", e);
      alert(
        "自动重启失败，请手动 ⌘Q 完全退出本 App 后再重新打开。",
      );
    }
  };

  const handleReset = async () => {
    if (
      !confirm(
        "将清除 macOS 上「屏幕录制」对本 App 的全部授权记录，然后重新打开授权流程。继续？",
      )
    ) {
      return;
    }
    try {
      await api.resetScreenRecordingPermission();
    } catch (e) {
      console.error("resetScreenRecordingPermission failed", e);
      alert(`重置失败：${e}\n\n请尝试在终端手动执行：\ntccutil reset ScreenCapture com.ihealth.autocapture`);
      return;
    }
    // Re-register the app with TCC and open System Settings.
    try {
      await api.requestScreenRecordingPermission();
    } catch (e) {
      console.error("requestScreenRecordingPermission failed", e);
    }
    try {
      await api.openScreenRecordingSettings();
    } catch (e) {
      console.error("openScreenRecordingSettings failed", e);
    }
    onRecheck();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">需要"屏幕录制"权限</div>
        <div className="modal-message">
          macOS 没有授予屏幕录制权限时，截屏只能看到桌面壁纸，PPT 窗口的内容会被系统过滤掉。
          <br />
          <br />
          点击"去授权"将打开{" "}
          <strong>系统设置 → 隐私与安全性 → 屏幕录制</strong>
          ，请在列表中勾选 <strong>AutoCapture</strong>。
          <br />
          <br />
          <strong>授权完毕后</strong>，因为 macOS 只在 App 启动时读一次权限，
          需要点下面的<strong>"已授权，重启"</strong>让权限生效。
        </div>
        <div className="modal-actions">
          <button className="secondary" onClick={onClose}>
            稍后
          </button>
          <button className="secondary" onClick={handleGrant}>
            去授权
          </button>
          <button onClick={handleRelaunch} autoFocus>
            已授权，重启
          </button>
        </div>
        <div className="modal-footnote">
          授权一直不生效？
          <button className="link-button" onClick={handleReset}>
            清除权限记录后重试
          </button>
        </div>
      </div>
    </div>
  );
}
