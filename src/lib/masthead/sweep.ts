const SWEEP_MS = 4800;
export const SWEEP_BAND = 4; // columns, one per --masthead-wave-* colour

// A stepped band of colour that crosses the lettering left to right: it enters
// off the left edge and leaves off the right.
export class Sweep {
  private start = -Infinity;

  constructor(private cols: number) {}

  run(now: number) {
    this.start = now;
  }

  running(now: number) {
    return now - this.start < SWEEP_MS;
  }

  // Lettering column of the band's leading edge, or null when no sweep is running.
  front(now: number) {
    const elapsed = now - this.start;
    if (elapsed >= SWEEP_MS) return null;
    return Math.floor((elapsed / SWEEP_MS) * (this.cols + 2 * SWEEP_BAND)) - SWEEP_BAND;
  }
}
