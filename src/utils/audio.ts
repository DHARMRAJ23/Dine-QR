/**
 * Synthesizes a premium double-note POS chime using the browser's Web Audio API.
 * This does not require loading any external audio assets, ensuring 100% reliability.
 */
export const playNewOrderChime = () => {
  if (typeof window === "undefined") return;

  const AudioContextClass =
    window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return;

  try {
    const ctx = new AudioContextClass();

    // Note 1: Warm initial chime (D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();

    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5

    gain1.gain.setValueAtTime(0.15, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    // Note 2: Harmonic delay chime (A5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();

    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.08); // A5

    gain2.gain.setValueAtTime(0.2, ctx.currentTime + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    // Start and stop
    osc1.start();
    osc1.stop(ctx.currentTime + 0.4);

    osc2.start(ctx.currentTime + 0.08);
    osc2.stop(ctx.currentTime + 0.7);
  } catch (error) {
    console.warn("Audio context play block by browser policy or error:", error);
  }
};
