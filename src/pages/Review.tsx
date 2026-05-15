import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { save } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import AppHeader from "../components/AppHeader";
import AppFooter from "../components/AppFooter";
import ConfirmModal from "../components/ConfirmModal";
import type { RecorderStatus, ScreenshotInfo } from "../types";

interface ReviewNavState {
  dir?: string;
  meetingName?: string;
}

export default function Review() {
  const navigate = useNavigate();
  const location = useLocation();
  const navState = (location.state as ReviewNavState | null) ?? null;
  const historyDir = navState?.dir ?? null;
  const historyMeeting = navState?.meetingName ?? null;
  const isHistoryMode = historyDir !== null;

  const [status, setStatus] = useState<RecorderStatus | null>(null);
  const [shots, setShots] = useState<ScreenshotInfo[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exporting, setExporting] = useState<null | "pdf" | "pptx">(null);
  const [exportMenu, setExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [postExport, setPostExport] = useState<{
    outputPath: string;
    count: number;
  } | null>(null);

  const effectiveDir = useMemo(
    () => historyDir ?? status?.output_dir ?? null,
    [historyDir, status?.output_dir],
  );
  const effectiveMeeting = useMemo(
    () => historyMeeting ?? status?.meeting_name ?? "AutoCapture",
    [historyMeeting, status?.meeting_name],
  );

  useEffect(() => {
    if (!exportMenu) return;
    const onClick = (e: MouseEvent) => {
      if (!exportMenuRef.current?.contains(e.target as Node)) {
        setExportMenu(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [exportMenu]);

  const load = useCallback(async () => {
    // History mode: ignore active recorder status; load directly from the dir.
    if (historyDir) {
      try {
        const list = await api.listScreenshots(historyDir);
        setShots(list);
      } catch (e) {
        console.error(e);
        setShots([]);
      }
      return;
    }
    const s = await api.recorderStatus();
    setStatus(s);
    if (s.output_dir) {
      const list = await api.listScreenshots(s.output_dir);
      setShots(list);
    } else {
      setShots([]);
    }
  }, [historyDir]);

  useEffect(() => {
    load();
    const unlisten = listen("recording-stopped", () => {
      load();
    });
    return () => {
      unlisten.then((f) => f()).catch(() => {});
    };
  }, [load]);

  const toggle = (seq: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(seq)) next.delete(seq);
      else next.add(seq);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(shots.map((s) => s.seq)));
  const clearSelection = () => setSelected(new Set());

  const doDelete = async () => {
    const toDelete = shots.filter((s) => selected.has(s.seq));
    setConfirmDelete(false);
    if (toDelete.length === 0) return;
    try {
      await api.deleteScreenshots(toDelete.map((s) => s.path));
      setSelected(new Set());
      await load();
    } catch (e) {
      alert(`删除失败: ${e}`);
    }
  };

  const handleFinish = async () => {
    if (isHistoryMode) {
      navigate("/");
      return;
    }
    try {
      await api.finalizeRecording();
      navigate("/");
    } catch (e) {
      alert(`完成失败: ${e}`);
    }
  };

  const handleOpenFolder = async () => {
    if (effectiveDir) {
      try {
        await api.openOutputDir(effectiveDir);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleExport = async (kind: "pdf" | "pptx") => {
    setExportMenu(false);
    if (shots.length === 0) return;
    const ext = kind === "pdf" ? "pdf" : "pptx";
    const meeting = effectiveMeeting;
    // Date from started_at (Local ISO) — slice the YYYY-MM-DD prefix.
    const datePart =
      status?.started_at && /^\d{4}-\d{2}-\d{2}/.test(status.started_at)
        ? status.started_at.slice(0, 10)
        : new Date().toISOString().slice(0, 10);
    try {
      const outputPath = await save({
        defaultPath: `${meeting}_${datePart}.${ext}`,
        filters: [
          kind === "pdf"
            ? { name: "PDF", extensions: ["pdf"] }
            : { name: "PowerPoint", extensions: ["pptx"] },
        ],
        title: kind === "pdf" ? "导出为 PDF" : "导出为 PPTX",
      });
      if (!outputPath) return;
      setExporting(kind);
      const paths = shots.map((s) => s.path);
      if (kind === "pdf") {
        await api.exportPdf(paths, outputPath);
      } else {
        await api.exportPptx(paths, outputPath, meeting);
      }
      setPostExport({ outputPath, count: shots.length });
    } catch (e) {
      alert(`导出失败: ${e}`);
    } finally {
      setExporting(null);
    }
  };

  const handlePostExportDelete = async () => {
    if (!effectiveDir) {
      setPostExport(null);
      return;
    }
    const dir = effectiveDir;
    setPostExport(null);
    try {
      await api.deleteRecording(dir);
      if (!isHistoryMode) {
        await api.finalizeRecording();
      }
      navigate("/");
    } catch (e) {
      alert(`删除失败: ${e}`);
    }
  };

  const openViewer = async (shot: ScreenshotInfo) => {
    try {
      const existing = await WebviewWindow.getByLabel("viewer");
      if (existing) {
        await existing.emit("viewer-load", shot.path);
        await existing.show();
        await existing.setFocus();
        return;
      }
      new WebviewWindow("viewer", {
        url: `index.html#/viewer?path=${encodeURIComponent(shot.path)}`,
        width: 1200,
        height: 800,
        title: shot.filename,
        resizable: true,
      });
    } catch (e) {
      console.error("open viewer", e);
    }
  };

  return (
    <div className="app-container" style={{ maxWidth: 980 }}>
      <AppHeader onRefresh={load} />

      <div className="review-toolbar">
        <button
          className="danger"
          onClick={() => setConfirmDelete(true)}
          disabled={selected.size === 0}
        >
          删除选中 ({selected.size})
        </button>
        <button
          className="secondary"
          onClick={selectAll}
          disabled={shots.length === 0 || selected.size === shots.length}
        >
          全选
        </button>
        <button
          className="secondary"
          onClick={clearSelection}
          disabled={selected.size === 0}
        >
          清除选中
        </button>
        <div style={{ flex: 1 }} />
        <div className="export-wrap" ref={exportMenuRef}>
          <button
            className="secondary"
            onClick={() => setExportMenu((v) => !v)}
            disabled={shots.length === 0 || exporting !== null}
          >
            {exporting === "pdf"
              ? "导出 PDF…"
              : exporting === "pptx"
                ? "导出 PPTX…"
                : "导出 ▾"}
          </button>
          {exportMenu && (
            <div className="export-menu">
              <button
                className="export-menu-item"
                onClick={() => handleExport("pdf")}
              >
                导出为 PDF
              </button>
              <button
                className="export-menu-item"
                onClick={() => handleExport("pptx")}
              >
                导出为 PPTX
              </button>
            </div>
          )}
        </div>
        <button className="ghost" onClick={handleOpenFolder}>
          打开文件夹
        </button>
        <button onClick={handleFinish}>完成</button>
      </div>

      <main className="app-content">
      {shots.length === 0 ? (
        <div className="empty-state">暂无截图</div>
      ) : (
        <div className="review-grid">
          {shots.map((shot) => {
            const isSelected = selected.has(shot.seq);
            return (
              <div
                key={shot.seq}
                className={`thumb ${isSelected ? "selected" : ""}`}
                onClick={(e) => {
                  if (e.shiftKey || e.metaKey || e.ctrlKey) {
                    toggle(shot.seq);
                  } else {
                    openViewer(shot);
                  }
                }}
              >
                <img src={convertFileSrc(shot.path)} alt={shot.filename} />
                <div className="thumb-label">{shot.filename}</div>
                <button
                  className={`thumb-check ${isSelected ? "checked" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(shot.seq);
                  }}
                  title={isSelected ? "取消选择" : "选择"}
                >
                  {isSelected ? "✓" : ""}
                </button>
              </div>
            );
          })}
        </div>
      )}
      </main>

      <ConfirmModal
        open={confirmDelete}
        title="删除选中截图"
        message={`确定删除选中的 ${selected.size} 张截图？此操作不可撤销。`}
        confirmText="删除"
        danger
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(false)}
      />

      <ConfirmModal
        open={postExport !== null}
        title="导出成功"
        message={
          postExport
            ? `已导出 ${postExport.count} 张截图到 ${postExport.outputPath}。是否删除原始截图目录？`
            : ""
        }
        confirmText="删除截图"
        cancelText="保留"
        danger
        onConfirm={handlePostExportDelete}
        onCancel={() => setPostExport(null)}
      />

      <AppFooter />
    </div>
  );
}
