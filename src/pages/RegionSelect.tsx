import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit } from "@tauri-apps/api/event";
import type { Region } from "../types";

interface Pos {
  x: number;
  y: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_SIZE = 10;

export default function RegionSelect() {
  const [start, setStart] = useState<Pos | null>(null);
  const [end, setEnd] = useState<Pos | null>(null);
  const [dragging, setDragging] = useState(false);
  const [winOffset, setWinOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const win = getCurrentWindow();
        const pos = await win.outerPosition();
        const scale = await win.scaleFactor();
        setWinOffset({ x: pos.x / scale, y: pos.y / scale });
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const rect: Rect | null = useMemo(() => {
    if (!start || !end) return null;
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);
    return { x, y, w, h };
  }, [start, end]);

  const isValid = rect !== null && rect.w >= MIN_SIZE && rect.h >= MIN_SIZE;

  const cancel = async () => {
    await emit("region-cancelled");
    await emit("region-window-closed");
    await getCurrentWindow().close();
  };

  const confirm = async () => {
    if (!isValid || !rect) return;
    const region: Region = {
      x: Math.round(winOffset.x + rect.x),
      y: Math.round(winOffset.y + rect.y),
      width: Math.round(rect.w),
      height: Math.round(rect.h),
    };
    await emit("region-selected", region);
    await emit("region-window-closed");
    await getCurrentWindow().close();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
      else if (e.key === "Enter" && isValid) confirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isValid, rect]);

  const onMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".region-toolbar")) return;
    setStart({ x: e.clientX, y: e.clientY });
    setEnd({ x: e.clientX, y: e.clientY });
    setDragging(true);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    setEnd({ x: e.clientX, y: e.clientY });
  };

  const onMouseUp = () => {
    setDragging(false);
  };

  // Position the toolbar smartly: below the selection if it fits, else above,
  // else overlap inside near the bottom.
  const toolbarStyle = useMemo<React.CSSProperties | null>(() => {
    if (!rect || dragging) return null;
    const margin = 12;
    const toolbarW = 240;
    const toolbarH = 40;
    const winW = window.innerWidth;
    const winH = window.innerHeight;

    let top = rect.y + rect.h + margin;
    if (top + toolbarH > winH) {
      top = rect.y - margin - toolbarH;
      if (top < margin) {
        top = Math.max(margin, rect.y + rect.h - toolbarH - margin);
      }
    }
    let left = rect.x + (rect.w - toolbarW) / 2;
    left = Math.max(margin, Math.min(winW - toolbarW - margin, left));
    return { top, left, width: toolbarW };
  }, [rect, dragging]);

  return (
    <div
      ref={rootRef}
      className="region-root"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      {/* Dim mask: 4 strips around the selection (or full dim if no selection). */}
      {rect ? (
        <>
          <div
            className="dim"
            style={{ left: 0, top: 0, right: 0, height: rect.y }}
          />
          <div
            className="dim"
            style={{
              left: 0,
              top: rect.y + rect.h,
              right: 0,
              bottom: 0,
            }}
          />
          <div
            className="dim"
            style={{
              left: 0,
              top: rect.y,
              width: rect.x,
              height: rect.h,
            }}
          />
          <div
            className="dim"
            style={{
              left: rect.x + rect.w,
              top: rect.y,
              right: 0,
              height: rect.h,
            }}
          />
          <div
            className="region-selection"
            style={{
              left: rect.x,
              top: rect.y,
              width: rect.w,
              height: rect.h,
            }}
          />
          <div
            className="region-size-label"
            style={{
              left: rect.x,
              top: Math.max(0, rect.y - 22),
            }}
          >
            {Math.round(rect.w)} × {Math.round(rect.h)}
          </div>
        </>
      ) : (
        <>
          <div className="dim-full" />
          <div className="region-hint">拖动鼠标框选 PPT 区域</div>
        </>
      )}

      {toolbarStyle && (
        <div
          className="region-toolbar"
          style={toolbarStyle}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className="ghost-light"
            onClick={() => {
              setStart(null);
              setEnd(null);
            }}
          >
            重新选择
          </button>
          <button className="secondary-light" onClick={cancel}>
            取消
          </button>
          <button onClick={confirm} disabled={!isValid}>
            确认 (Enter)
          </button>
        </div>
      )}
    </div>
  );
}
