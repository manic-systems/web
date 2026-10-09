import type { Dot, Lettering } from '../lettering';

// Birds are drawn on a finer grid: every lattice dot splits into SUB × SUB pixels.
export const SUB = 4;

// Sprites face right; '#' is a lit pixel. Each is 8 by 6 pixels, feet in column 3.
// Flight cycles up, level, down, level; the body sits a pixel higher on the downstroke.
const SPRITES = {
  perched: ['.....##.', '....#.##', '..#####.', '.#####..', '#.###...', '...#....'],
  peck: ['........', '........', '..####..', '.######.', '#.###.##', '...#...#'],
  // Head turned back into the wing, then dipped deeper while it nibbles.
  preenA: ['...##...', '..##.#..', '..#####.', '.#####..', '#.###...', '...#....'],
  preenB: ['........', '...##...', '.###.##.', '.######.', '#.###...', '...#....'],
  hop: ['.....##.', '....#.##', '..#####.', '.######.', '#.####..', '........'],
  // Head turned to look behind, body still.
  look: ['....##..', '...##.#.', '..#####.', '.#####..', '#.###...', '...#....'],
  // One wing stretched out behind.
  stretch: ['.....##.', '....#.##', '#.#####.', '##.###..', '#.###...', '...#....'],
  // Fluffed up, eye closed.
  nap: ['........', '....####', '.######.', '.######.', '#.####..', '...#....'],
  wingUp: ['..#.....', '..##....', '...##.#.', '##.#####', '...###..', '........'],
  wingLevel: ['........', '........', '.####.#.', '##.#####', '...###..', '........'],
  wingDown: ['........', '......#.', '##.#####', '..####..', '..##....', '........'],
};
export type Frame = keyof typeof SPRITES;
export const FLAP: Frame[] = ['wingUp', 'wingLevel', 'wingDown', 'wingLevel'];
export const FRAMES = Object.fromEntries(
  Object.entries(SPRITES).map(([name, rows]) => [name, parse(rows)]),
) as Record<Frame, Dot[]>;
export const ZED = parse(['###', '.#.', '###']); // a dot-matrix z: the diagonal runs through the middle
// Where Zs start, just above and ahead of the head; span is the width they mirror across.
export const ZED_AT = { col: 6, row: -4, span: 10 };
export const CARRIED = parse(['###', '###', '###']); // a stolen letter dot, shrunk

const SPRITE_WIDTH = 8;
export const SPRITE_HEIGHT = 6;
export const FEET = 3;
export const BEAK = 7; // column of the beak tip when pecking
// Sprite geometry in dots.
export const WIDTH = SPRITE_WIDTH / SUB;
export const HEIGHT = SPRITE_HEIGHT / SUB;
export const FEET_X = (FEET + 0.5) / SUB;

// Pixels to draw: top-left corner in lettering coordinates, ink, and opacity.
export type Pixel = [x: number, y: number, ink: 'bird' | 'text', alpha: number];

function parse(rows: string[]): Dot[] {
  return rows.flatMap((line, row) =>
    [...line].flatMap((c, col): Dot[] => (c === '#' ? [[col, row]] : [])),
  );
}

// Mirror a sprite-pixel column for a bird facing left; `width` is the mirrored span.
export const mirror = (col: number, facing: number, width = SPRITE_WIDTH) =>
  facing > 0 ? col : width - 1 - col;

// Whether a sprite placed at (x, y), in any of these frames and facing either way,
// stays clear of the lettering.
export function clearOf(lettering: Lettering, x: number, y: number, frames: Frame[]) {
  return frames.every((frame) =>
    [1, -1].every((facing) =>
      FRAMES[frame].every(
        ([col, row]) =>
          !lettering.has(
            Math.floor(x + (mirror(col, facing) + 0.5) / SUB),
            Math.floor(y + (row + 0.5) / SUB),
          ),
      ),
    ),
  );
}
