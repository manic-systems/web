import { Flock } from './birds/flock';
import { LETTERING } from './lettering';
import { Renderer } from './render';
import { Sweep } from './sweep';
import { STEP_RATE, Water } from './water';

const MAX_STEPS_PER_FRAME = 4;
const SPLASH = 2; // energy of a pointer entering or tapping
const WAKE = 1; // energy per dot of pointer travel at reference speed
const REFERENCE_SPEED = 40; // cursor speed, in dots per second, that yields the base wake
const MAX_WAKE = 3;
const STAMP_SPACING = 0.5; // dots between wake impulses along the cursor path
const MAX_STAMPS = 64;

// Drives the animated masthead: measures the page, turns pointer input into
// water, and runs the frame loop while anything is moving. All positions are
// in lettering coordinates, measured in dots from the lettering's top-left.
export class Masthead {
  private water: Water;
  private sweep: Sweep;
  private flock: Flock;
  private renderer: Renderer;
  private pitch = 0; // CSS pixels per dot; 0 until laid out
  private letterLeft = 0; // lettering origin within the canvas
  private letterTop = 0;
  private pointer: { x: number; y: number; t: number } | null = null;
  private inView = true;
  private frame = 0;
  private lastFrame = -1;
  private pending = 0;

  constructor(
    root: HTMLElement,
    private canvas: HTMLCanvasElement,
    private letters: SVGSVGElement,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d canvas unavailable');
    const style = getComputedStyle(root);
    this.renderer = new Renderer(ctx, style);
    this.water = new Water();
    this.sweep = new Sweep(LETTERING.cols);
    this.flock = new Flock(LETTERING, this.water, this.sweep, {
      pointer: () =>
        this.pointer && { ...this.pointer, idleMs: performance.now() - this.pointer.t },
      visible: () => this.inView && document.visibilityState === 'visible',
      wake: () => this.wake(),
    });
    const bleed = Number(style.getPropertyValue('--bleed'));

    new ResizeObserver(() => this.layout(bleed)).observe(root);
    new IntersectionObserver(([entry]) => {
      this.inView = entry.isIntersecting;
    }).observe(root);
    root.addEventListener('pointerenter', (event) => this.splash(event));
    root.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'mouse') this.splash(event);
    });
    root.addEventListener('pointermove', (event) => this.stroke(event));
    root.addEventListener('pointerleave', () => {
      this.pointer = null;
    });
  }

  // Play the load sweep.
  start() {
    this.sweep.run(performance.now());
    this.wake();
  }

  // Anchor the lattice on the lettering and extend it to cover the canvas.
  private layout(bleed: number) {
    const canvasRect = this.canvas.getBoundingClientRect();
    const letterRect = this.letters.getBoundingClientRect();
    // Before the lettering has a size there is no lattice to anchor to.
    if (letterRect.width <= 0) return;
    const pitch = letterRect.width / LETTERING.cols;
    const left = letterRect.left - canvasRect.left;
    const top = letterRect.top - canvasRect.top;
    const padCols = Math.ceil(left / pitch);
    const padRows = Math.ceil(top / pitch);
    this.pitch = pitch;
    this.letterLeft = left;
    this.letterTop = top;

    this.water.resize(LETTERING, {
      padCols,
      padRows,
      cols: padCols + Math.ceil((canvasRect.width - left) / pitch),
      rows: padRows + Math.ceil((canvasRect.height - top) / pitch),
      bleed,
    });
    this.renderer.resize(canvasRect.width, canvasRect.height, { pitch, left, top });
    this.draw(performance.now());
  }

  // Pointer position in lettering coordinates; null until laid out.
  private locate(event: PointerEvent) {
    if (this.pitch <= 0) return null;
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left - this.letterLeft) / this.pitch,
      y: (event.clientY - rect.top - this.letterTop) / this.pitch,
      t: event.timeStamp,
    };
  }

  private splash(event: PointerEvent) {
    const at = this.locate(event);
    if (!at) return;
    this.pointer = at;
    this.water.disturb(at.x, at.y, SPLASH);
    this.wake();
  }

  // Stamp a wake along the pointer's path, stronger the faster it moves.
  private stroke(event: PointerEvent) {
    const at = this.locate(event);
    if (!at) return;
    const last = this.pointer;
    this.pointer = at;
    if (!last) return;

    const distance = Math.hypot(at.x - last.x, at.y - last.y);
    if (distance === 0) return;
    const speed = distance / (Math.max(at.t - last.t, 1) / 1000);
    const strength = WAKE * Math.min(MAX_WAKE, speed / REFERENCE_SPEED);
    const stamps = Math.min(Math.ceil(distance / STAMP_SPACING), MAX_STAMPS);
    for (let s = 1; s <= stamps; s++) {
      const t = s / stamps;
      this.water.disturb(
        last.x + (at.x - last.x) * t,
        last.y + (at.y - last.y) * t,
        (strength * distance) / stamps,
      );
    }
    this.wake();
  }

  private wake() {
    if (this.frame) return;
    this.lastFrame = -1;
    this.frame = requestAnimationFrame((now) => this.tick(now));
  }

  private tick(now: number) {
    // rAF timestamps can predate the wake-up call, so time starts at the first frame.
    if (this.lastFrame < 0) this.lastFrame = now;
    this.pending += ((now - this.lastFrame) / 1000) * STEP_RATE;
    this.lastFrame = now;
    this.flock.update(now);
    const steps = Math.min(Math.floor(this.pending), MAX_STEPS_PER_FRAME);
    this.pending = Math.min(this.pending - steps, 1);
    for (let s = 0; s < steps; s++) this.water.step(now);
    this.draw(now);

    if (this.water.busy(now) || this.sweep.running(now) || this.flock.active) {
      this.frame = requestAnimationFrame((next) => this.tick(next));
      return;
    }
    this.frame = 0;
    this.water.settle();
    this.draw(now);
  }

  private draw(now: number) {
    this.renderer.draw(this.water, this.sweep.front(now), this.flock.pixels(now), now);
  }
}
