import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Region } from "../types";

export interface PageFlipDetectorOptions {
  region: Region | null;
  enabled: boolean;
  onFlip: () => void;
  /** Poll interval while idle (waiting for a change). Default 280ms. */
  idleIntervalMs?: number;
  /** Poll interval while a change is in progress (chasing stability). Default 80ms. */
  activeIntervalMs?: number;
  /** Poll interval during cooldown after a fire. Default 500ms. */
  cooldownIntervalMs?: number;
  /** Longest side of the downscaled thumbnail. Default 32. */
  thumbDim?: number;
  /** MAD (mean absolute difference) above which a frame counts as "changed". 0–255 scale. */
  changeThreshold?: number;
  /** MAD below which a frame counts as "stable". 0–255 scale. */
  stableThreshold?: number;
  /** Consecutive stable frames required after a change to fire the flip. */
  stableFrames?: number;
  /** Peak MAD seen during the change must reach this before we allow firing —
   *  filters out tiny blips (cursor, caret) without forcing extra stable frames. */
  minPeakMad?: number;
  /** After firing, ignore further changes for this many ms. */
  cooldownMs?: number;
}

export interface PageFlipDebug {
  mad: number;
  phase: "idle" | "changing" | "cooldown";
  stableStreak: number;
}

type Phase = "idle" | "changing" | "cooldown";

export function usePageFlipDetector(opts: PageFlipDetectorOptions) {
  const {
    region,
    enabled,
    onFlip,
    idleIntervalMs = 280,
    activeIntervalMs = 60,
    cooldownIntervalMs = 500,
    thumbDim = 32,
    changeThreshold = 3,
    stableThreshold = 1.2,
    stableFrames = 1,
    minPeakMad = 8,
    cooldownMs = 1200,
  } = opts;

  const lastFrameRef = useRef<Uint8Array | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const stableCountRef = useRef(0);
  const peakMadRef = useRef(0);
  const cooldownUntilRef = useRef(0);
  const onFlipRef = useRef(onFlip);
  onFlipRef.current = onFlip;

  const [debug, setDebug] = useState<PageFlipDebug | null>(null);

  useEffect(() => {
    if (!enabled || !region) {
      lastFrameRef.current = null;
      phaseRef.current = "idle";
      stableCountRef.current = 0;
      setDebug(null);
      return;
    }
    let cancelled = false;
    let timer: number | null = null;

    const tick = async () => {
      if (cancelled) return;
      try {
        const t = await api.captureThumbnail(region, thumbDim);
        if (cancelled) return;
        const cur = new Uint8Array(t.gray);
        const prev = lastFrameRef.current;
        if (prev && prev.length === cur.length) {
          let sum = 0;
          for (let i = 0; i < cur.length; i++) {
            const d = cur[i] - prev[i];
            sum += d < 0 ? -d : d;
          }
          const mad = sum / cur.length;
          const now = performance.now();
          let phase = phaseRef.current;

          if (now < cooldownUntilRef.current) {
            phase = "cooldown";
          } else if (phase === "cooldown") {
            phase = "idle";
            stableCountRef.current = 0;
          }

          if (phase === "idle") {
            if (mad >= changeThreshold) {
              phase = "changing";
              stableCountRef.current = 0;
              peakMadRef.current = mad;
            }
          } else if (phase === "changing") {
            if (mad > peakMadRef.current) peakMadRef.current = mad;
            if (mad <= stableThreshold) {
              stableCountRef.current += 1;
              const peakOk = peakMadRef.current >= minPeakMad;
              if (peakOk && stableCountRef.current >= stableFrames) {
                phase = "cooldown";
                cooldownUntilRef.current = now + cooldownMs;
                stableCountRef.current = 0;
                peakMadRef.current = 0;
                try {
                  onFlipRef.current();
                } catch (err) {
                  console.error("onFlip threw", err);
                }
              }
            } else if (mad >= changeThreshold) {
              stableCountRef.current = 0;
            }
          }

          phaseRef.current = phase;
          setDebug({ mad, phase, stableStreak: stableCountRef.current });
        }
        lastFrameRef.current = cur;
      } catch (e) {
        console.error("pageflip thumbnail", e);
      } finally {
        if (!cancelled) {
          const next =
            phaseRef.current === "changing"
              ? activeIntervalMs
              : phaseRef.current === "cooldown"
                ? cooldownIntervalMs
                : idleIntervalMs;
          timer = window.setTimeout(tick, next);
        }
      }
    };
    tick();

    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [
    enabled,
    region?.x,
    region?.y,
    region?.width,
    region?.height,
    idleIntervalMs,
    activeIntervalMs,
    cooldownIntervalMs,
    thumbDim,
    changeThreshold,
    stableThreshold,
    stableFrames,
    minPeakMad,
    cooldownMs,
  ]);

  /** Drop the baseline and enter cooldown — call after a manual capture so the
   *  next frame doesn't immediately re-trigger. */
  const resetBaseline = () => {
    lastFrameRef.current = null;
    stableCountRef.current = 0;
    peakMadRef.current = 0;
    phaseRef.current = "cooldown";
    cooldownUntilRef.current = performance.now() + cooldownMs;
  };

  return { debug, resetBaseline };
}
