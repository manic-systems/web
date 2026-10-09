import { type Dot, glyphOf, type Lettering, lineOf } from '../lettering';
import { clearOf, FEET_X, type Frame, HEIGHT, SUB } from './sprites';
import type { Point } from './util';

// Somewhere a bird stands on top of a letter column; x, y place the sprite's top-left.
export interface Perch extends Point {
  dot: Dot; // the letter dot under its feet
  glyph: string; // perches on the same letter share this
  line: number;
}

const PERCHED_POSES: Frame[] = ['perched', 'peck', 'preenA', 'preenB', 'look', 'stretch', 'nap'];

// Stand on the top dot of each letter column, wherever no perched pose would
// overlap the lettering.
export function findPerches(lettering: Lettering): Perch[] {
  const tops = new Map<string, Dot>();
  for (const dot of lettering.dots) {
    const key = `${lineOf(dot[1])},${dot[0]}`;
    const top = tops.get(key);
    if (!top || dot[1] < top[1]) tops.set(key, dot);
  }
  return [...tops.values()]
    .map((dot) => ({
      x: Math.round((dot[0] + 0.5 - FEET_X) * SUB) / SUB,
      y: dot[1] - HEIGHT,
      dot,
      glyph: glyphOf(dot),
      line: lineOf(dot[1]),
    }))
    .filter((p) => clearOf(lettering, p.x, p.y, PERCHED_POSES));
}
