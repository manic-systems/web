import type { Dot, Lettering } from '../lettering';
import type { Sweep } from '../sweep';
import type { Water } from '../water';
import { Bird } from './bird';
import { findPerches, type Perch } from './perches';
import { type Pixel, SUB } from './sprites';
import { between, distance } from './util';

const FIRST_VISIT_MS = [8000, 15000];
const VISIT_GAP_MS = [15000, 30000];
const RETURN_MS = [6000, 12000]; // a thief comes back with the dot this soon
const RETRY_MS = 5000; // when a visit comes due while nobody is looking
const PAIR_CHANCE = 0.15;
const SECOND_BIRD_MS = [800, 2000];
const CHASE_PER_SECOND = 0.25; // chance a pair of nearby perched birds squabbles
const CHASE_RANGE = 10; // dots
const POOP_FALL = 14; // dots per second
const POOP_MARK_MS = 10000;

export interface Pointer {
  x: number;
  y: number;
  idleMs: number; // since it last moved
}

// What the flock needs from the page besides the water.
export interface Stage {
  pointer(): Pointer | null;
  visible(): boolean;
  wake(): void;
}

// Schedules visits of one or two birds and owns what they change: the stolen
// dot and what they leave behind.
export class Flock {
  readonly perches: Perch[];
  private birds: Bird[] = [];
  stolen: Dot | null = null;
  private visiting = false;
  private poops: { x: number; y: number }[] = [];
  private marks: { x: number; y: number; start: number }[] = [];
  private last = 0;

  constructor(
    lettering: Lettering,
    readonly water: Water,
    readonly sweep: Sweep,
    readonly stage: Stage,
  ) {
    this.perches = findPerches(lettering);
    if (this.perches.length) this.schedule(between(FIRST_VISIT_MS));
  }

  // Anything on screen that still needs frames.
  get active() {
    return this.present || this.poops.length > 0 || this.marks.length > 0;
  }

  get present() {
    return this.birds.some((bird) => bird.present);
  }

  update(now: number) {
    const dt = Math.min(now - this.last, 50);
    this.last = now;
    for (const bird of this.birds) bird.update(now, dt);
    this.squabble(now, dt);
    this.fall(now, dt);
    this.marks = this.marks.filter((mark) => now - mark.start < POOP_MARK_MS);

    if (this.visiting && !this.present) {
      this.visiting = false;
      this.birds = [];
      this.schedule(between(this.stolen ? RETURN_MS : VISIT_GAP_MS));
    }
  }

  pixels(now: number): Pixel[] {
    const pixels = this.birds.flatMap((bird) => bird.pixels(now));
    for (const poop of this.poops) pixels.push([poop.x, poop.y, 'bird', 1]);
    for (const mark of this.marks) {
      const alpha = 1 - (now - mark.start) / POOP_MARK_MS;
      pixels.push([mark.x, mark.y, 'bird', alpha], [mark.x + 1 / SUB, mark.y, 'bird', alpha]);
    }
    return pixels;
  }

  // Perches no other bird stands on or is heading for.
  free(by: Bird, from: readonly Perch[] = this.perches) {
    return from.filter((perch) => !this.birds.some((bird) => bird !== by && bird.claims(perch)));
  }

  dropPoop(x: number, y: number) {
    this.poops.push({ x, y });
  }

  steal(dot: Dot) {
    this.water.hold(dot, false);
    this.stolen = dot;
  }

  restore(dot: Dot) {
    this.water.release(dot);
    this.stolen = null;
  }

  private schedule(delay: number) {
    setTimeout(() => {
      if (!this.stage.visible()) return this.schedule(RETRY_MS);
      this.arrive();
    }, delay);
  }

  private arrive() {
    this.visiting = true;
    this.last = performance.now();
    this.birds = [new Bird(this, this.stolen)];
    if (Math.random() < PAIR_CHANCE) {
      setTimeout(() => {
        if (this.visiting) this.birds.push(new Bird(this, null));
      }, between(SECOND_BIRD_MS));
    }
    this.stage.wake();
  }

  // Two perched birds close together sometimes fall out: one chases the other off.
  private squabble(now: number, dt: number) {
    const [a, b] = this.birds.filter((bird) => bird.idle);
    if (!b || distance(a.position, b.position) > CHASE_RANGE) return;
    if (Math.random() > (CHASE_PER_SECOND * dt) / 1000) return;
    const [chaser, victim] = Math.random() < 0.5 ? [a, b] : [b, a];
    chaser.chase(victim, now);
  }

  private fall(now: number, dt: number) {
    const { bottom } = this.water.bounds();
    this.poops = this.poops.filter((poop) => {
      poop.y += (POOP_FALL * dt) / 1000;
      const col = Math.floor(poop.x);
      const row = Math.floor(poop.y + 1 / SUB);
      if (this.water.isLit(col, row, now)) {
        // Splat on the top edge of the letter dot it hit.
        this.marks.push({ x: poop.x, y: row, start: now });
        this.water.nudge(poop.x, row + 0.5);
        return false;
      }
      return poop.y < bottom;
    });
  }
}
