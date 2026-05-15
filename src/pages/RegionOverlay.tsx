import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { api } from "../api";

export default function RegionOverlay() {
  const [name, setName] = useState("");
  const [flash, setFlash] = useState(false);
  const flashTimerRef = useRef<number | null>(null);

  useEffect(() => {
    getCurrentWindow()
      .setIgnoreCursorEvents(true)
      .catch((e) => console.error("setIgnoreCursorEvents", e));

    (async () => {
      try {
        const s = await api.recorderStatus();
        if (s.meeting_name) setName(s.meeting_name);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    (async () => {
      unlisten = await listen("capture-flash", () => {
        if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
        setFlash(true);
        flashTimerRef.current = window.setTimeout(() => setFlash(false), 240);
      });
    })();
    return () => {
      if (unlisten) unlisten();
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    };
  }, []);

  return (
    <>
      {name && <div className="region-overlay-label">{name}</div>}
      <div className={`region-overlay-frame ${flash ? "flash" : ""}`} />
    </>
  );
}
