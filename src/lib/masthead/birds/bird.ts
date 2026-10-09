import { type Dot, sameDot } from '../lettering';
import { SWEEP_BAND } from '../sweep';
import type { Flock } from './flock';
import type { Perch } from './perches';
import {
  BEAK,
  CARRIED,
  FEET,
  FEET_X,
  FLAP,
  FRAMES,
  type Frame,
  HEIGHT,
  mirror,
  type Pixel,
  SUB,
  WIDTH,
  SPRITE_HEIGHT,
  ZED,
  ZED_AT,
} from './sprites';
import { between, distance, type Point, pick } from './util';

const FLIGHT_SPEED = 22; // dots per second
// Short trips between letters are unhurried, low flits rather than leaps.
const FLIT_RANGE = 10; // dots
const FLIT_SPEED = 9; // dots per second
const FLIT_MIN_MS = 700;
const FLAP_MS = 80;
const PERCH_MS = [3000, 8000];
const IDLE_MS = [1000, 2000];
const PECK_MS = 140; // per beak movement, down or up
const PECKS = [1, 3];
const HOP_MS = 260; // plus HOP_MS_PER_DOT for every dot travelled
const HOP_MS_PER_DOT = 60;
const MAX_HOP = 2.5; // dots; birds only hop along one letter, anything further they flit
const HOP_CHANCE = 0.6; // of moving on to another perch rather than leaving
const MAX_PERCHES = 3;
const RIDE_CHANCE = 0.3;
const RIDE_MS = 200; // how often a sweep rider looks for its next spot
const CHASE_REACH = 2.5; // dots; a chased bird bolts once its pursuer is this close

const SCARE_RADIUS = 6; // dots; a perched bird bolts when the cursor moves this close
const NAP_SCARE_RADIUS = 4;
const MOVING_MS = 200; // the cursor counts as moving if it moved this recently
const CURIOUS_AFTER_MS = 1500; // a cursor held this still draws a perched bird closer
const CURIOUS_RANGE = [3, 16]; // dots
const CURIOUS_REACH = 8; // dots a curious bird moves at a time
const AVOID_RADIUS = 8; // dots; a flying bird bends away inside this

const POSE_FRAME_MS = 180; // for poses that alternate frames
// Energies a bird puts into the water.
const FLIGHT_WAKE = 0.25; // per dot flown
const TAKEOFF_SPLASH = 1;
const LANDING_SPLASH = 0.5;

type Action =
  | { kind: 'pose'; frames: Frame[]; start: number; end: number }
  | { kind: 'nap'; start: number; end: number }
  | { kind: 'peck'; start: number; pecks: number; tapped: number }
  | { kind: 'hop'; from: Point; to: Perch; start: number; duration: number };

interface Flying {
  kind: 'flying';
  from: Point;
  to: Point;
  start: number;
  duration: number;
  lift: number; // peak height of the arc, in dots
  landing: Perch | null; // null flies off the lattice
  chasing: Bird | null;
}
interface Perched {
  kind: 'perched';
  at: Perch;
  until: number;
  nextIdle: number;
  action: Action | null;
}
type State = { kind: 'away' } | Flying | Perched;

// A tiny pixel bird, alive for one visit. Its position is the sprite's top-left corner.
export class Bird {
  private state: State = { kind: 'away' };
  private x = 0;
  private y = 0;
  private facing = 1;
  private visits = 0; // perches so far
  private riding = false;
  private avoid = { x: 0, y: 0 };

  constructor(
    private flock: Flock,
    private carrying: Dot | null,
  ) {
    this.arrive(performance.now());
  }

  get present() {
    return this.state.kind !== 'away';
  }

  // Perched and not in the middle of anything.
  get idle() {
    return this.state.kind === 'perched' && !this.state.action && !this.carrying;
  }

  get position(): Point {
    return { x: this.x, y: this.y };
  }

  private get centre(): Point {
    return { x: this.x + WIDTH / 2, y: this.y + HEIGHT / 2 };
  }

  claims(perch: Perch) {
    const state = this.state;
    if (state.kind === 'flying') return state.landing === perch;
    if (state.kind !== 'perched') return false;
    return state.at === perch || (state.action?.kind === 'hop' && state.action.to === perch);
  }

  update(now: number, dt: number) {
    switch (this.state.kind) {
      case 'flying':
        return this.fly(this.state, now, dt);
      case 'perched':
        return this.perch(this.state, now);
    }
  }

  pixels(now: number): Pixel[] {
    const state = this.state;
    if (state.kind === 'away') return [];
    const x = Math.round(this.x * SUB);
    const y = Math.round(this.y * SUB);
    const place = (col: number, row: number, width?: number) =>
      [(x + mirror(col, this.facing, width)) / SUB, (y + row) / SUB] as const;

    const pixels: Pixel[] = FRAMES[this.frame(now)].map(([col, row]) => [
      ...place(col, row),
      'bird',
      1,
    ]);
    if (this.carrying) {
      for (const [col, row] of CARRIED) {
        pixels.push([...place(FEET - 1 + col, SPRITE_HEIGHT + row), 'text', 1]);
      }
    }
    if (state.kind === 'perched' && state.action?.kind === 'nap') {
      // Zs drift up and fade from just above the head, one every 1.2s.
      const age = ((now - state.action.start) % 1200) / 1200;
      for (const [col, row] of ZED) {
        const [px, py] = place(ZED_AT.col + col, ZED_AT.row + row, ZED_AT.span);
        pixels.push([px + age * 0.5 * this.facing, py - age * 1.5, 'bird', 1 - age]);
      }
    }
    return pixels;
  }

  chase(victim: Bird, now: number) {
    if (victim.state.kind !== 'perched') return;
    this.splash(TAKEOFF_SPLASH);
    this.flyTo(victim.state.at, now, victim);
  }

  private frame(now: number): Frame {
    const state = this.state;
    if (state.kind === 'flying') return FLAP[Math.floor(now / FLAP_MS) % FLAP.length];
    const action = state.kind === 'perched' ? state.action : null;
    switch (action?.kind) {
      case undefined:
        return 'perched';
      case 'hop':
        return 'hop';
      case 'nap':
        return 'nap';
      case 'peck':
        return Math.floor((now - action.start) / PECK_MS) % 2 ? 'perched' : 'peck';
      case 'pose':
        return action.frames[
          Math.floor((now - action.start) / POSE_FRAME_MS) % action.frames.length
        ];
    }
  }

  // Splash the letter dot right under the feet.
  private splash(amount: number) {
    this.flock.water.disturb(this.x + FEET_X, this.y + HEIGHT + 0.5, amount);
  }

  private arrive(now: number) {
    const { left, right, top, bottom } = this.flock.water.bounds();
    this.x = Math.random() < 0.5 ? left - WIDTH : right;
    this.y = top + Math.random() * ((bottom - top) / 2);

    const home = this.carrying && this.flock.perches.find((p) => sameDot(p.dot, this.carrying));
    if (home) return this.flyTo(home, now);
    const free = this.flock.free(this);
    if (free.length) this.flyTo(pick(free), now);
    else this.leave(now);
  }

  private flyTo(perch: Perch, now: number, chasing: Bird | null = null) {
    this.launch(perch, perch, now, chasing);
  }

  private launch(to: Point, landing: Perch | null, now: number, chasing: Bird | null = null) {
    const from = this.position;
    if (to.x !== from.x) this.facing = Math.sign(to.x - from.x);
    this.avoid = { x: 0, y: 0 };
    const length = distance(from, to);
    const path =
      length <= FLIT_RANGE
        ? {
            duration: Math.max(FLIT_MIN_MS, (length / FLIT_SPEED) * 1000),
            lift: 0.3 + length * 0.08,
          }
        : { duration: (length / FLIGHT_SPEED) * 1000, lift: Math.min(6, length * 0.25) + 1 };
    this.state = { kind: 'flying', from, to, start: now, ...path, landing, chasing };
  }

  private leave(now: number) {
    const { left, right, top, bottom } = this.flock.water.bounds();
    const x = Math.random() < 0.5 ? left - WIDTH - 1 : right + 1;
    this.launch({ x, y: top + Math.random() * ((bottom - top) / 2) }, null, now);
  }

  private takeOff(hop: boolean, now: number) {
    this.splash(TAKEOFF_SPLASH);
    this.riding = false;
    const elsewhere = this.flock.free(this).filter((p) => p.x !== this.x || p.y !== this.y);
    if (hop && elsewhere.length) {
      const to = pick(elsewhere);
      this.flyTo(to, now);
    } else {
      this.leave(now);
    }
  }

  private fly(state: Flying, now: number, dt: number) {
    const t = Math.min(1, (now - state.start) / state.duration);
    const eased = t * t * (3 - 2 * t);
    const { from, to, lift } = state;

    // Bend away from the cursor, letting the detour fade out before touchdown.
    const pointer = this.flock.stage.pointer();
    if (pointer) {
      const dx = this.centre.x - pointer.x;
      const dy = this.centre.y - pointer.y;
      const d = Math.hypot(dx, dy);
      if (d > 0 && d < AVOID_RADIUS) {
        const push = ((AVOID_RADIUS - d) / AVOID_RADIUS) * dt * 0.03;
        this.avoid.x += (dx / d) * push;
        this.avoid.y += (dy / d) * push;
      }
    }
    const fade = 1 - eased;
    const x = from.x + (to.x - from.x) * eased + this.avoid.x * fade;
    const y =
      from.y + (to.y - from.y) * eased - lift * Math.sin(Math.PI * eased) + this.avoid.y * fade;
    const moved = Math.hypot(x - this.x, y - this.y);
    this.x = x;
    this.y = y;
    if (moved > 0) this.flock.water.disturb(this.centre.x, this.centre.y, FLIGHT_WAKE * moved);

    const victim = state.chasing;
    if (
      victim?.state.kind === 'perched' &&
      distance(this.position, victim.position) < CHASE_REACH
    ) {
      victim.takeOff(false, now);
    }

    if (t < 1) return;
    if (!state.landing) {
      this.state = { kind: 'away' };
      return;
    }
    this.x = to.x;
    this.y = to.y;
    this.visits++;
    this.splash(LANDING_SPLASH);
    this.state = {
      kind: 'perched',
      at: state.landing,
      until: now + between(PERCH_MS),
      nextIdle: now + between(IDLE_MS),
      action: null,
    };
    if (this.carrying) {
      this.flock.restore(this.carrying);
      this.carrying = null;
    } else if (this.visits === 1 && Math.random() < RIDE_CHANCE) {
      this.flock.sweep.run(now);
      this.riding = true;
    }
  }

  private scared(radius: number) {
    const pointer = this.flock.stage.pointer();
    return !!pointer && pointer.idleMs < MOVING_MS && distance(this.centre, pointer) < radius;
  }

  private perch(state: Perched, now: number) {
    const napping = state.action?.kind === 'nap';
    if (this.scared(napping ? NAP_SCARE_RADIUS : SCARE_RADIUS)) {
      return this.takeOff(Math.random() < 0.5, now);
    }
    if (state.action && this.act(state.action, now)) return;
    state.action = null;

    if (now >= state.until && !this.riding) {
      return this.takeOff(this.visits < MAX_PERCHES && Math.random() < HOP_CHANCE, now);
    }
    if (now < state.nextIdle) return;
    state.nextIdle = now + between(IDLE_MS);
    if (!this.ride(state, now) && !this.approach(state, now)) {
      this.wander(state, now);
    }
  }

  // Advance an action; true while it is still running.
  private act(action: Action, now: number) {
    switch (action.kind) {
      case 'hop': {
        const t = Math.min(1, (now - action.start) / action.duration);
        const lift = 0.5 + distance(action.from, action.to) * 0.1;
        this.x = action.from.x + (action.to.x - action.from.x) * t;
        this.y = action.from.y + (action.to.y - action.from.y) * t - lift * Math.sin(Math.PI * t);
        if (t < 1) return true;
        this.x = action.to.x;
        this.y = action.to.y;
        this.flock.water.nudge(this.x + FEET_X, this.y + HEIGHT + 0.5);
        return false;
      }
      case 'peck': {
        // Every even beat is a beak-down; each one taps the dot under the tip of the beak.
        const beat = Math.floor((now - action.start) / PECK_MS);
        if (beat % 2 === 0 && beat / 2 >= action.tapped && action.tapped < action.pecks) {
          action.tapped++;
          const beak = this.x + (mirror(BEAK, this.facing) + 0.5) / SUB;
          this.flock.water.nudge(beak, this.y + HEIGHT + 0.5);
        }
        return beat < action.pecks * 2;
      }
      default:
        return now < action.end;
    }
  }

  // Ride just ahead of the load sweep while it runs.
  private ride(state: Perched, now: number) {
    const front = this.flock.sweep.front(now);
    if (!this.riding || front === null) {
      this.riding = false;
      return false;
    }
    state.nextIdle = now + RIDE_MS;
    const ahead = this.flock
      .free(this)
      .filter(
        (p) => p.line === state.at.line && p.dot[0] > front && p.dot[0] <= front + SWEEP_BAND,
      );
    if (ahead.length && !ahead.includes(state.at)) this.moveTo(state, pick(ahead), now);
    return true;
  }

  // Curious: a cursor held still draws it closer, perch by perch.
  private approach(state: Perched, now: number) {
    const pointer = this.flock.stage.pointer();
    if (!pointer || pointer.idleMs <= CURIOUS_AFTER_MS) return false;
    const [near, far] = CURIOUS_RANGE;
    const d = distance(this.centre, pointer);
    if (d <= near || d >= far) return false;

    this.facing = Math.sign(pointer.x - this.centre.x) || this.facing;
    state.nextIdle = now + 600;
    const toward = (p: Perch) => distance({ x: p.x + WIDTH / 2, y: p.y + HEIGHT / 2 }, pointer);
    const closer = this.flock
      .free(this)
      .filter(
        (p) => distance(p, state.at) <= CURIOUS_REACH && toward(p) >= near && toward(p) < d - 1,
      )
      .sort((a, b) => toward(a) - toward(b));
    if (closer.length) this.moveTo(state, closer[0], now);
    else this.pose(state, now, ['look'], [400, 700]);
    return true;
  }

  // Something to do while perched: hop along the letter, peck, preen, look round,
  // stretch, nap, poop, or make off with the dot underfoot.
  private wander(state: Perched, now: number) {
    const at = state.at;
    const neighbours = this.flock
      .free(this)
      .filter((p) => p !== at && p.glyph === at.glyph && distance(p, at) <= MAX_HOP);
    const options: [weight: number, possible: boolean, run: () => void][] = [
      [0.2, neighbours.length > 0, () => this.hopTo(state, pick(neighbours), now)],
      [0.2, true, () => this.peck(state, now)],
      [0.15, true, () => this.pose(state, now, ['preenA', 'preenB'], [600, 1100])],
      [0.15, true, () => this.pose(state, now, ['look'], [400, 900])],
      [0.12, true, () => this.pose(state, now, ['stretch'], [500, 800])],
      [0.08, true, () => this.nap(state, now)],
      [0.08, true, () => this.poop(state, now)],
      [0.08, !this.flock.stolen, () => this.steal(at, now)],
    ];
    const available = options.filter(([, possible]) => possible);
    let roll = Math.random() * available.reduce((sum, [weight]) => sum + weight, 0);
    for (const [weight, , run] of available) {
      roll -= weight;
      if (roll <= 0) return run();
    }
  }

  private pose(state: Perched, now: number, frames: Frame[], ms: number[]) {
    state.action = { kind: 'pose', frames, start: now, end: now + between(ms) };
  }

  private peck(state: Perched, now: number) {
    const pecks = Math.round(between(PECKS));
    state.action = { kind: 'peck', start: now, pecks, tapped: 0 };
  }

  private nap(state: Perched, now: number) {
    const end = now + between([3000, 6000]);
    state.action = { kind: 'nap', start: now, end };
    state.until = Math.max(state.until, end + 500);
  }

  private poop(state: Perched, now: number) {
    this.pose(state, now, ['hop'], [200, 200]);
    const tail = this.facing > 0 ? 0 : WIDTH - 1 / SUB;
    this.flock.dropPoop(this.x + tail, this.y + HEIGHT - 1 / SUB);
  }

  private hopTo(state: Perched, to: Perch, now: number) {
    this.facing = Math.sign(to.x - this.x) || this.facing;
    const from = this.position;
    const duration = HOP_MS + distance(from, to) * HOP_MS_PER_DOT;
    state.action = { kind: 'hop', from, to, start: now, duration };
    state.at = to;
  }

  // Hop along the same letter; flit with a few wingbeats anywhere else.
  private moveTo(state: Perched, to: Perch, now: number) {
    if (to.glyph === state.at.glyph && distance(to, state.at) <= MAX_HOP) {
      return this.hopTo(state, to, now);
    }
    this.splash(LANDING_SPLASH);
    this.flyTo(to, now);
  }

  // Grab the dot underfoot and make off with it; a later visit brings it back.
  private steal(at: Perch, now: number) {
    this.flock.steal(at.dot);
    this.splash(TAKEOFF_SPLASH);
    this.carrying = at.dot;
    this.riding = false;
    this.leave(now);
  }
}
