import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { save } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import { openRecordingWindows } from "../lib/recordingWindows";
import ConfirmModal from "../components/ConfirmModal";
import ScreenPermissionModal from "../components/ScreenPermissionModal";
import AppHeader from "../components/AppHeader";
import AppFooter from "../components/AppFooter";
import { useScreenPermission } from "../lib/useScreenPermission";
import {
  IconCamera,
  IconDownload,
  IconFolder,
  IconTrash,
} from "../components/icons";
import type { RecordingEntry, Session } from "../types";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

type ConfirmAction =
  | { kind: "discard"; resumable: Session }
  | { kind: "delete"; entry: RecordingEntry };

export default function Home() {
  const navigate = useNavigate();
  const [resumable, setResumable] = useState<Session | null>(null);
  const [recordings, setRecordings] = useState<RecordingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<ConfirmAction | null>(null);
  const [exportMenuDir, setExportMenuDir] = useState<string | null>(null);
  const [exportingDir, setExportingDir] = useState<string | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const [postExport, setPostExport] = useState<{
    dir: string;
    meetingName: string;
    outputPath: string;
    count: number;
  } | null>(null);
  const { granted: permGranted, recheck: permRecheck } = useScreenPermission();
  const [permDismissed, setPermDismissed] = useState(false);
  const showPermModal = permGranted === false && !permDismissed;

  useEffect(() => {
    if (!exportMenuDir) return;
    const onClick = (e: MouseEvent) => {
      if (!exportMenuRef.current?.contains(e.target as Node)) {
        setExportMenuDir(null);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [exportMenuDir]);

  const handleExport = async (r: RecordingEntry, kind: "pdf" | "pptx") => {
    setExportMenuDir(null);
    const ext = kind === "pdf" ? "pdf" : "pptx";
    try {
      const outputPath = await save({
        defaultPath: `${r.meeting_name}_${r.date}.${ext}`,
        filters: [
          kind === "pdf"
            ? { name: "PDF", extensions: ["pdf"] }
            : { name: "PowerPoint", extensions: ["pptx"] },
        ],
        title: kind === "pdf" ? "导出为 PDF" : "导出为 PPTX",
      });
      if (!outputPath) return;
      setExportingDir(r.dir);
      const shots = await api.listScreenshots(r.dir);
      const paths = shots.map((s) => s.path);
      if (paths.length === 0) {
        alert("此录制没有可导出的截图");
        return;
      }
      if (kind === "pdf") {
        await api.exportPdf(paths, outputPath);
      } else {
        await api.exportPptx(paths, outputPath, r.meeting_name);
      }
      setPostExport({
        dir: r.dir,
        meetingName: r.meeting_name,
        outputPath,
        count: paths.length,
      });
    } catch (e) {
      alert(`导出失败: ${e}`);
    } finally {
      setExportingDir(null);
    }
  };

  const handlePostExportDelete = async () => {
    if (!postExport) return;
    const dir = postExport.dir;
    setPostExport(null);
    try {
      await api.deleteRecording(dir);
      await load();
    } catch (e) {
      alert(`删除失败: ${e}`);
    }
  };

  const load = useCallback(async () => {
    try {
      const [s, list] = await Promise.all([
        api.checkResumable(),
        api.listRecordings(),
      ]);
      setResumable(s);
      setRecordings(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleResume = async () => {
    if (!resumable) return;
    try {
      await api.resumeSession();
      navigate("/review");
      await openRecordingWindows(resumable.region);
      await getCurrentWindow().hide();
    } catch (e) {
      alert(`恢复失败: ${e}`);
    }
  };

  const handleEnd = async () => {
    try {
      await api.endSession();
      navigate("/review");
    } catch (e) {
      alert(`结束失败: ${e}`);
    }
  };

  const handleOpenFolder = async (dir: string) => {
    try {
      await api.openOutputDir(dir);
    } catch (e) {
      console.error(e);
    }
  };

  const confirmAction = async () => {
    if (!pending) return;
    try {
      if (pending.kind === "discard") {
        await api.discardSession();
      } else {
        await api.deleteRecording(pending.entry.dir);
      }
      setPending(null);
      await load();
    } catch (e) {
      setPending(null);
      alert(`操作失败: ${e}`);
    }
  };

  if (loading) {
    return (
      <div className="app-container">
        <p style={{ color: "var(--text-tertiary)" }}>正在加载…</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      <AppHeader onRefresh={load} />
      <main className="app-content">

      {resumable && (
        <div className="card resume-card">
          <div style={{ marginBottom: 12 }}>
            <strong>发现未完成的录制</strong>
            <p className="hint" style={{ marginTop: 6 }}>
              会议：{resumable.meeting_name} · 已捕获 {resumable.captured_count} 张
              · 开始于 {new Date(resumable.started_at).toLocaleString("zh-CN")}
            </p>
          </div>
          <div className="row">
            <button onClick={handleResume}>恢复录制</button>
            <button className="secondary" onClick={handleEnd}>
              结束并整理
            </button>
            <button
              className="ghost danger-text"
              onClick={() => setPending({ kind: "discard", resumable })}
            >
              丢弃
            </button>
          </div>
        </div>
      )}

      <div className="section-title">历史录制</div>
      {recordings.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-glyph">
            <IconCamera />
          </div>
          <div>尚无录制记录</div>
          <div className="hint" style={{ marginTop: 0 }}>
            从上方"新建录制"开始第一次
          </div>
        </div>
      ) : (
        <div className="recording-list">
          {recordings.map((r) => (
            <div
              key={r.dir}
              className="recording-item"
              role="button"
              tabIndex={0}
              onClick={(e) => {
                if (
                  (e.target as HTMLElement).closest(
                    "button, .recording-actions, .export-menu",
                  )
                )
                  return;
                if (r.status === "in_progress") return;
                navigate("/review", {
                  state: {
                    dir: r.dir,
                    meetingName: r.meeting_name,
                  },
                });
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                if (r.status === "in_progress") return;
                e.preventDefault();
                navigate("/review", {
                  state: {
                    dir: r.dir,
                    meetingName: r.meeting_name,
                  },
                });
              }}
            >
              <div className="recording-icon">
                <IconCamera />
              </div>
              <div className="recording-info">
                <div className="recording-name">
                  {r.meeting_name}
                  {r.status === "in_progress" && (
                    <span className="badge badge-progress">录制中</span>
                  )}
                </div>
                <div className="recording-meta">
                  {r.date}
                  {r.created_at ? ` · ${formatDate(r.created_at)}` : ""}
                </div>
              </div>
              <span className="recording-count">{r.count} 张</span>
              <div className="recording-actions">
                <div
                  className="export-wrap"
                  ref={
                    exportMenuDir === r.dir
                      ? (el) => {
                          exportMenuRef.current = el;
                        }
                      : undefined
                  }
                >
                  <button
                    className="ghost icon"
                    onClick={() =>
                      setExportMenuDir(
                        exportMenuDir === r.dir ? null : r.dir,
                      )
                    }
                    disabled={
                      r.status === "in_progress" ||
                      r.count === 0 ||
                      exportingDir !== null
                    }
                    title={
                      exportingDir === r.dir
                        ? "正在导出…"
                        : "导出为 PDF / PPTX"
                    }
                    aria-label="导出"
                  >
                    <IconDownload />
                  </button>
                  {exportMenuDir === r.dir && (
                    <div className="export-menu">
                      <button
                        className="export-menu-item"
                        onClick={() => handleExport(r, "pdf")}
                      >
                        导出为 PDF
                      </button>
                      <button
                        className="export-menu-item"
                        onClick={() => handleExport(r, "pptx")}
                      >
                        导出为 PPTX
                      </button>
                    </div>
                  )}
                </div>
                <button
                  className="ghost icon"
                  onClick={() => handleOpenFolder(r.dir)}
                  title="在文件夹中打开"
                  aria-label="打开文件夹"
                >
                  <IconFolder />
                </button>
                <button
                  className="ghost icon danger-text"
                  onClick={() => setPending({ kind: "delete", entry: r })}
                  disabled={r.status === "in_progress"}
                  title={
                    r.status === "in_progress"
                      ? "录制中，不能删除"
                      : "删除整个录制"
                  }
                  aria-label="删除"
                >
                  <IconTrash />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      </main>
      <AppFooter />

      <ConfirmModal
        open={pending?.kind === "discard"}
        title="丢弃未完成的录制"
        message={
          pending?.kind === "discard"
            ? `会议 "${pending.resumable.meeting_name}" 已捕获 ${pending.resumable.captured_count} 张截图。丢弃将删除整个录制目录，此操作不可撤销。`
            : ""
        }
        confirmText="丢弃"
        danger
        onConfirm={confirmAction}
        onCancel={() => setPending(null)}
      />

      <ConfirmModal
        open={pending?.kind === "delete"}
        title="删除录制"
        message={
          pending?.kind === "delete"
            ? `确定删除录制 "${pending.entry.meeting_name}"（${pending.entry.count} 张截图）？此操作不可撤销。`
            : ""
        }
        confirmText="删除"
        danger
        onConfirm={confirmAction}
        onCancel={() => setPending(null)}
      />

      <ScreenPermissionModal
        open={showPermModal}
        onClose={() => setPermDismissed(true)}
        onRecheck={() => {
          setPermDismissed(false);
          permRecheck();
        }}
      />

      <ConfirmModal
        open={postExport !== null}
        title="导出成功"
        message={
          postExport
            ? `已导出 ${postExport.count} 张截图到 ${postExport.outputPath}。是否删除"${postExport.meetingName}"的原始截图目录？`
            : ""
        }
        confirmText="删除截图"
        cancelText="保留"
        danger
        onConfirm={handlePostExportDelete}
        onCancel={() => setPostExport(null)}
      />
    </div>
  );
}
