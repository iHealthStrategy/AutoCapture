import { useEffect, useState } from "react";
import { prettyHotkey } from "../lib/settings";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

const MODIFIER_KEYS = new Set([
  "Control",
  "Shift",
  "Alt",
  "Meta",
  "OS",
  "Hyper",
  "Super",
]);

function buildAccelerator(e: KeyboardEvent): string | null {
  const parts: string[] = [];
  // Cmd on Mac, Meta on Win/Linux — accept either via CommandOrControl when
  // user pressed only one of them, else split.
  if (e.metaKey || (e.ctrlKey && !navigator.platform.toLowerCase().includes("mac"))) {
    parts.push("CommandOrControl");
  } else if (e.ctrlKey) {
    parts.push("Control");
  }
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");

  // The main key.
  let key = e.key;
  if (MODIFIER_KEYS.has(key)) return null; // waiting for a real key

  if (key === " ") key = "Space";
  else if (key.length === 1) key = key.toUpperCase();
  else if (/^F\d{1,2}$/.test(key)) {
    // F-keys: as is
  } else if (key.startsWith("Arrow")) {
    // ArrowUp, etc.
  } else {
    // Other: capitalize first letter as a best effort.
    key = key.charAt(0).toUpperCase() + key.slice(1);
  }

  // Require at least one modifier — bare keys are too easy to fire by accident.
  if (parts.length === 0) return null;

  parts.push(key);
  return parts.join("+");
}

export default function HotkeyInput({ value, onChange }: Props) {
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(false);
        return;
      }
      const accel = buildAccelerator(e);
      if (accel) {
        onChange(accel);
        setRecording(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, onChange]);

  return (
    <button
      className={`hotkey-input ${recording ? "recording" : ""}`}
      onClick={() => setRecording(!recording)}
      type="button"
    >
      {recording ? "请按下快捷键…（Esc 取消）" : prettyHotkey(value)}
    </button>
  );
}
