let ctx: AudioContext | null = null;

function tone(freqs: number[], type: OscillatorType, step = 0.09) {
  if (typeof window === "undefined") return;
  try {
    ctx ??= new AudioContext();
    const t0 = ctx.currentTime;
    freqs.forEach((f, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = type;
      osc.frequency.value = f;
      const s = t0 + i * step;
      gain.gain.setValueAtTime(0.0001, s);
      gain.gain.exponentialRampToValueAtTime(0.18, s + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, s + step + 0.06);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(s);
      osc.stop(s + step + 0.08);
    });
  } catch {
    /* audio unavailable */
  }
}

export const playSuccess = () => tone([660, 880], "sine");
export const playError = () => tone([220, 165], "square", 0.12);
