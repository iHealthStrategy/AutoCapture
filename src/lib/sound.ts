// Synthesized camera-shutter "click" — no audio asset, runs entirely in
// Web Audio. Cheap enough to fire on every capture.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    ctx = new AC();
  }
  return ctx;
}

export function playShutterSound(volume = 0.45) {
  try {
    const c = getCtx();
    if (c.state === "suspended") c.resume().catch(() => {});

    const now = c.currentTime;
    const dur = 0.07;
    const len = Math.floor(c.sampleRate * dur);

    // Pink-ish noise burst with a steep decay envelope.
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, 3);
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const source = c.createBufferSource();
    source.buffer = buf;

    // Highpass to remove low rumble, bandpass that sweeps down — gives the
    // characteristic metallic shutter "snap".
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 900;

    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(4200, now);
    bp.frequency.exponentialRampToValueAtTime(1400, now + dur);
    bp.Q.value = 1.6;

    const gain = c.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur + 0.04);

    source.connect(hp);
    hp.connect(bp);
    bp.connect(gain);
    gain.connect(c.destination);

    source.start(now);
    source.stop(now + dur + 0.05);
  } catch (e) {
    console.error("playShutterSound", e);
  }
}
