import { type Pixel, SUB } from './birds/sprites';
import { DOT_SIZE } from './lettering';
import { SWEEP_BAND } from './sweep';
import type { Water } from './water';

// Dots turn like cards about their vertical axis, in steps.
const FLIP_STEPS = 6; // angles per half turn
const BACK_SHADE = 0.7; // back face brightness relative to the front
// How narrow a dot gets edge-on; letter dots stay wider so the lettering reads.
const LETTER_MIN_FACE = 0.4;
const WATER_MIN_FACE = 0.1;
const VISIBLE = 0.05; // unlit dots turned less than this aren't drawn

interface Palette {
  text: string;
  bird: string;
  tile: string;
  wave: string[];
}

// Where the lettering sits on the canvas, in CSS pixels.
export interface Placement {
  pitch: number;
  left: number;
  top: number;
}

export class Renderer {
  private palette: Palette;
  private place: Placement = { pitch: 0, left: 0, top: 0 };

  constructor(
    private ctx: CanvasRenderingContext2D,
    style: CSSStyleDeclaration,
  ) {
    const read = (name: string) => style.getPropertyValue(name).trim();
    this.palette = {
      text: read('--text'),
      bird: read('--masthead-bird'),
      tile: read('--masthead-tile'),
      wave: [1, 2, 3, 4].map((n) => read(`--masthead-wave-${n}`)),
    };
  }

  resize(width: number, height: number, place: Placement) {
    const dpr = devicePixelRatio || 1;
    this.ctx.canvas.width = Math.round(width * dpr);
    this.ctx.canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.place = place;
  }

  draw(water: Water, sweepFront: number | null, pixels: Pixel[], now: number) {
    const ctx = this.ctx;
    const palette = this.palette;
    const { pitch, left, top } = this.place;
    const size = pitch * DOT_SIZE;
    const inset = (pitch - size) / 2;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    for (let gy = 0; gy < water.rows; gy++) {
      for (let gx = 0; gx < water.cols; gx++) {
        const i = gy * water.cols + gx;
        const letter = water.isLetter[i] === 1;
        const lit = water.litAt(i, now);
        const amount = water.turn(i);
        if (!lit && amount < VISIBLE) continue;

        const col = gx - water.padCols;
        const row = gy - water.padRows;
        const face = Math.cos((Math.round(amount * FLIP_STEPS) / FLIP_STEPS) * Math.PI);
        const shade = face < 0 ? BACK_SHADE : 1;
        if (lit) {
          const band = sweepFront === null ? -1 : col - sweepFront + SWEEP_BAND - 1;
          ctx.fillStyle =
            letter && band >= 0 && band < SWEEP_BAND ? palette.wave[band] : palette.text;
          ctx.globalAlpha = shade;
        } else {
          ctx.fillStyle = palette.tile;
          ctx.globalAlpha = amount * shade;
        }

        const w = size * Math.max(Math.abs(face), letter ? LETTER_MIN_FACE : WATER_MIN_FACE);
        ctx.fillRect(left + col * pitch + (pitch - w) / 2, top + row * pitch + inset, w, size);
      }
    }

    // Birds are solid pixel art; snap their pixels to device pixels so they don't seam.
    const dpr = devicePixelRatio || 1;
    const snap = (v: number) => Math.round(v * dpr) / dpr;
    for (const [x, y, ink, alpha] of pixels) {
      ctx.fillStyle = palette[ink];
      ctx.globalAlpha = alpha;
      const x0 = snap(left + x * pitch);
      const y0 = snap(top + y * pitch);
      ctx.fillRect(
        x0,
        y0,
        snap(left + (x + 1 / SUB) * pitch) - x0,
        snap(top + (y + 1 / SUB) * pitch) - y0,
      );
    }
    ctx.globalAlpha = 1;
  }
}
