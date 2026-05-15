import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api } from "../api";

/// Tracks macOS Screen Recording permission. Re-checks whenever the window
/// regains focus, so that returning from System Settings refreshes the state
/// without the user having to click anything. `granted === null` means
/// "checking" — used to avoid a flash of the permission modal on launch.
export function useScreenPermission() {
  const [granted, setGranted] = useState<boolean | null>(null);

  const recheck = useCallback(async () => {
    try {
      const ok = await api.checkScreenRecordingPermission();
      setGranted(ok);
      return ok;
    } catch {
      // Fail open: if the command itself failed (e.g. unsupported platform),
      // don't block the user.
      setGranted(true);
      return true;
    }
  }, []);

  useEffect(() => {
    recheck();
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        unlisten = await getCurrentWindow().onFocusChanged(({ payload }) => {
          if (payload) recheck();
        });
      } catch (e) {
        console.error("onFocusChanged failed", e);
      }
    })();
    return () => {
      unlisten?.();
    };
  }, [recheck]);

  return { granted, recheck };
}
