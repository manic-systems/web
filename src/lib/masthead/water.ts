import type { Dot, Lettering } from './lettering';

export const STEP_RATE = 60; // simulation steps per second
const SPEED = 8; // waves travel this many dots per second
const LIFETIME = 0.9; // seconds until a ripple decays to 5% of its height
const FLIP_AT = 0.6; // wave height that turns a dot fully over
const LETTER_GRIP = 2; // letter dots need this much more, keeping the lettering legible
const ECHO = 0.3; // share of the incoming height a flipping letter dot re-emits
const SCRAMBLE = 0.04; // chance a dot crossing the flip threshold lands in a random state
const SCRAMBLE_MS = 300;
const NUDGE = 0.3; // how far a light touch pushes a single dot
const REFRACTORY_MS = 400; // a letter dot echoes at most this often
const REST = 0.004; // below this height everywhere the water counts as still

// How the lattice extends around the lettering, in cells.
export interface Grid {
  padCols: number; // cells left of lettering column 0
  padRows: number; // cells above lettering row 0
  cols: number;
  rows: number;
  bleed: number; // outermost cells that soak waves up
}

// A damped 2D wave equation on the dot lattice, addressed in lettering coordinates.
// Wave height flips dots; letter dots are lit at rest, everything else is not, and
// any dot's lit state can be overridden for a while (scrambles, stolen dots).
export class Water {
  padCols = 0;
  padRows = 0;
  cols = 0;
  rows = 0;
  isLetter = new Uint8Array(0);

  private cur = new Float32Array(0);
  private prev = new Float32Array(0);
  private absorb = new Float32Array(0);
  private threshold = new Float32Array(0); // height that turns a dot fully over
  private flipped = new Uint8Array(0);
  private echoReadyAt = new Float64Array(0);
  private overrideLit = new Uint8Array(0);
  private overrideUntil = new Float64Array(0);

  private c2 = Math.min(SPEED / STEP_RATE, 0.67) ** 2;
  private damping = 0.05 ** (1 / (LIFETIME * STEP_RATE));
  private energy = 0;
  // Echoes draw from energy put in from outside, so ringing always dies out.
  private echoBudget = 0;
  private scrambleEnd = 0;

  resize(lettering: Lettering, { padCols, padRows, cols, rows, bleed }: Grid) {
    this.padCols = padCols;
    this.padRows = padRows;
    this.cols = cols;
    this.rows = rows;
    const size = cols * rows;
    this.cur = new Float32Array(size);
    this.prev = new Float32Array(size);
    this.absorb = new Float32Array(size);
    this.threshold = new Float32Array(size).fill(FLIP_AT);
    this.isLetter = new Uint8Array(size);
    this.flipped = new Uint8Array(size);
    this.echoReadyAt = new Float64Array(size);
    this.overrideLit = new Uint8Array(size);
    this.overrideUntil = new Float64Array(size);
    this.energy = 0;
    this.echoBudget = 0;

    // Sponge layer: the bleed soaks waves up instead of reflecting them.
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const edge = Math.min(x, y, cols - 1 - x, rows - 1 - y);
        this.absorb[y * cols + x] = edge >= bleed ? 1 : 0.8 + (0.2 * edge) / bleed;
      }
    }
    for (const [col, row] of lettering.dots) {
      const i = this.index(col, row);
      this.isLetter[i] = 1;
      this.threshold[i] = FLIP_AT * LETTER_GRIP;
    }
  }

  // The whole lattice, in lettering coordinates.
  bounds() {
    return {
      left: -this.padCols,
      top: -this.padRows,
      right: this.cols - this.padCols,
      bottom: this.rows - this.padRows,
    };
  }

  // Cell index of the dot containing (x, y), or -1 off the lattice.
  index(x: number, y: number) {
    const gx = Math.floor(x) + this.padCols;
    const gy = Math.floor(y) + this.padRows;
    if (gx < 0 || gy < 0 || gx >= this.cols || gy >= this.rows) return -1;
    return gy * this.cols + gx;
  }

  // Touch just the dot at (x, y): enough to turn it, too little to ripple its neighbours.
  nudge(x: number, y: number) {
    const i = this.index(x, y);
    if (i < 0) return;
    this.cur[i] -= NUDGE;
    this.prev[i] -= NUDGE;
    this.energy = Math.max(this.energy, NUDGE);
  }

  disturb(x: number, y: number, amount: number) {
    const cx = Math.floor(x) + this.padCols;
    const cy = Math.floor(y) + this.padRows;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const px = cx + dx;
        const py = cy + dy;
        if (px < 1 || py < 1 || px >= this.cols - 1 || py >= this.rows - 1) continue;
        // Displace both buffers so the impulse starts at rest instead of with velocity.
        const push = amount / 2 ** (Math.abs(dx) + Math.abs(dy));
        this.cur[py * this.cols + px] -= push;
        this.prev[py * this.cols + px] -= push;
      }
    }
    this.energy = Math.max(this.energy, amount);
    // The 3x3 stamp weights sum to 4.
    this.echoBudget += 4 * amount * ECHO;
  }

  step(now: number) {
    const { cols, rows, cur, prev, absorb } = this;
    const c2 = this.c2;
    const damping = this.damping;
    let energy = 0;
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        const i = y * cols + x;
        const lap = cur[i - 1] + cur[i + 1] + cur[i - cols] + cur[i + cols] - 4 * cur[i];
        const next = (2 * cur[i] - prev[i] + c2 * lap) * damping * absorb[i];
        prev[i] = next;
        energy = Math.max(energy, Math.abs(next));
      }
    }
    this.prev = cur;
    this.cur = prev;
    this.energy = energy;

    const heights = this.cur;
    for (let i = 0; i < heights.length; i++) {
      const over = Math.abs(heights[i]) > this.threshold[i] ? 1 : 0;
      if (over && !this.flipped[i]) {
        // Held dots (stolen ones) don't scramble.
        if (Math.random() < SCRAMBLE && this.overrideUntil[i] !== Infinity) {
          this.overrideLit[i] = Math.random() < 0.5 ? 1 : 0;
          this.overrideUntil[i] = now + SCRAMBLE_MS;
          this.scrambleEnd = Math.max(this.scrambleEnd, now + SCRAMBLE_MS);
        }
        // Letter dots re-emit part of the wave, so glyphs throw their own ripples.
        if (this.isLetter[i] && now >= this.echoReadyAt[i] && this.echoBudget > 0) {
          this.echoReadyAt[i] = now + REFRACTORY_MS;
          const kick =
            Math.sign(heights[i]) * Math.min(this.echoBudget, ECHO * Math.abs(heights[i]));
          this.echoBudget -= Math.abs(kick);
          heights[i] += kick;
          this.prev[i] += kick;
        }
      }
      this.flipped[i] = over;
    }
  }

  // How far cell i is turned over, 0–1.
  turn(i: number) {
    return Math.min(1, Math.abs(this.cur[i]) / this.threshold[i]);
  }

  litAt(i: number, now: number) {
    return now < this.overrideUntil[i] ? this.overrideLit[i] === 1 : this.isLetter[i] === 1;
  }

  isLit(col: number, row: number, now: number) {
    const i = this.index(col, row);
    return i >= 0 && this.litAt(i, now);
  }

  // Hold a dot lit or dark until released.
  hold([col, row]: Dot, lit: boolean) {
    const i = this.index(col, row);
    if (i < 0) return;
    this.overrideLit[i] = lit ? 1 : 0;
    this.overrideUntil[i] = Infinity;
  }

  release([col, row]: Dot) {
    const i = this.index(col, row);
    if (i >= 0) this.overrideUntil[i] = 0;
  }

  busy(now: number) {
    return this.energy > REST || now < this.scrambleEnd;
  }

  settle() {
    this.cur.fill(0);
    this.prev.fill(0);
    this.flipped.fill(0);
    this.energy = 0;
    this.echoBudget = 0;
  }
}
