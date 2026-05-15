import { useCallback, useEffect, useMemo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { listen } from "@tauri-apps/api/event";
import { api } from "../api";
import ConfirmModal from "../components/ConfirmModal";
import {
  IconArrowLeft,
  IconChevronRight,
  IconTrash,
} from "../components/icons";
import type { ScreenshotInfo } from "../types";

function parseInitialPath(): string | null {
  const hash = window.location.hash;
  const qIdx = hash.indexOf("?");
  if (qIdx < 0) return null;
  const params = new URLSearchParams(hash.substring(qIdx + 1));
  const p = params.get("path");
  return p ? decodeURIComponent(p) : null;
}

function dirOf(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx < 0 ? "" : path.substring(0, idx);
}

function filenameOf(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx < 0 ? path : path.substring(idx + 1);
}

export default function Viewer() {
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [siblings, setSiblings] = useState<ScreenshotInfo[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const index = useMemo(() => {
    if (!currentPath) return -1;
    return siblings.findIndex((s) => s.path === currentPath);
  }, [siblings, currentPath]);

  const filename = currentPath ? filenameOf(currentPath) : "";

  const refreshSiblings = useCallback(async (path: string) => {
    const dir = dirOf(path);
    if (!dir) {
      setSiblings([]);
      return;
    }
    try {
      const list = await api.listScreenshots(dir);
      setSiblings(list);
    } catch (e) {
      console.error("listScreenshots", e);
      setSiblings([]);
    }
  }, []);

  // Initial load from URL.
  useEffect(() => {
    const initial = parseInitialPath();
    if (initial) {
      setCurrentPath(initial);
      refreshSiblings(initial);
    }
  }, [refreshSiblings]);

  // Allow other windows to re-target this viewer to a new file.
  useEffect(() => {
    const u = listen<string>("viewer-load", async (e) => {
      if (typeof e.payload === "string") {
        setCurrentPath(e.payload);
        await refreshSiblings(e.payload);
      }
    });
    return () => {
      u.then((f) => f()).catch(() => {});
    };
  }, [refreshSiblings]);

  // Update window title to current filename.
  useEffect(() => {
    if (filename) {
      getCurrentWindow()
        .setTitle(filename)
        .catch(() => {});
    }
  }, [filename]);

  const goto = useCallback(
    (newIndex: number) => {
      if (newIndex < 0 || newIndex >= siblings.length) return;
      setCurrentPath(siblings[newIndex].path);
    },
    [siblings],
  );

  const prev = useCallback(() => goto(index - 1), [goto, index]);
  const next = useCallback(() => goto(index + 1), [goto, index]);

  const requestDelete = useCallback(() => {
    if (currentPath) setConfirmDelete(true);
  }, [currentPath]);

  const doDelete = useCallback(async () => {
    if (!currentPath) {
      setConfirmDelete(false);
      return;
    }
    const deletedPath = currentPath;
    // Capture the old index from the current siblings BEFORE we mutate state,
    // so the "where do we land after delete" math is unaffected by closure timing.
    const oldIndex = siblings.findIndex((s) => s.path === deletedPath);
    setConfirmDelete(false);
    try {
      const count = await api.deleteScreenshots([deletedPath]);
      if (count === 0) {
        alert("文件不存在或已被删除");
      }
      // Notify main window so the Review grid refreshes.
      const main = await WebviewWindow.getByLabel("main");
      if (main) await main.emit("recording-stopped");

      // Refresh sibling list from disk and navigate sensibly.
      const dir = dirOf(deletedPath);
      const fresh = dir ? await api.listScreenshots(dir) : [];

      if (fresh.length === 0) {
        setSiblings([]);
        setCurrentPath(null);
        await getCurrentWindow().close();
        return;
      }

      // Where to land: try the same slot; if we deleted the last one, step back.
      const clamped = Math.min(
        Math.max(oldIndex, 0),
        fresh.length - 1,
      );
      const nextPath = fresh[clamped]?.path ?? fresh[0].path;

      // Update BOTH atomically. React 18+ batches setState inside async callbacks.
      setSiblings(fresh);
      setCurrentPath(nextPath);
    } catch (e) {
      alert(`删除失败: ${e}`);
    }
  }, [currentPath, siblings]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        getCurrentWindow().close();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        requestDelete();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, requestDelete]);

  if (!currentPath) {
    return <div className="viewer-root viewer-empty">加载中…</div>;
  }

  const canPrev = index > 0;
  const canNext = index >= 0 && index < siblings.length - 1;

  return (
    <div className="viewer-root">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <span className="viewer-filename" title={filename}>
            {filename}
          </span>
          {siblings.length > 0 && index >= 0 && (
            <span className="viewer-position">
              {index + 1} / {siblings.length}
            </span>
          )}
        </div>
        <div className="viewer-toolbar-actions">
          <button
            className="viewer-btn"
            onClick={prev}
            disabled={!canPrev}
            title="上一张 ←"
            aria-label="上一张"
          >
            <IconArrowLeft />
          </button>
          <button
            className="viewer-btn"
            onClick={next}
            disabled={!canNext}
            title="下一张 →"
            aria-label="下一张"
          >
            <IconChevronRight />
          </button>
          <button
            className="viewer-btn viewer-btn-danger"
            onClick={requestDelete}
            title="删除 Delete"
            aria-label="删除"
          >
            <IconTrash />
          </button>
        </div>
      </div>

      <div className="viewer-image-wrap">
        <img
          key={currentPath}
          src={convertFileSrc(currentPath)}
          alt={filename}
        />
      </div>

      <ConfirmModal
        open={confirmDelete}
        title="删除这张截图"
        message={`确定删除 "${filename}"？此操作不可撤销。`}
        confirmText="删除"
        danger
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
