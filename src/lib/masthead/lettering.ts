// The masthead lettering, set on a dot lattice measured in Doto dot pitches (0.1em).
const LINES = ['manic.', 'systems'];
const ADVANCE = 6; // 5 dot columns plus a 1-dot gap
const LINE_ROWS = 11; // line-height 1.1em
const GLYPH_TOP = 2; // rows from a line's top to its glyphs' top row
export const DOT_SIZE = 0.8625; // Doto's dot size at weight 850, in pitches
export const TITLE = LINES.join('');

// Glyphs from Doto (SIL Open Font License) at weight 850; '#' is a dot.
// Each is 5 columns by 9 rows: ascender, x-height (rows 2–6), descender.
const GLYPHS: Record<string, string[]> = {
  m: ['.....', '.....', '##.#.', '#.#.#', '#.#.#', '#.#.#', '#...#', '.....', '.....'],
  a: ['.....', '.....', '.###.', '....#', '.####', '#...#', '.####', '.....', '.....'],
  n: ['.....', '.....', '#.##.', '##..#', '#...#', '#...#', '#...#', '.....', '.....'],
  i: ['..#..', '.....', '.##..', '..#..', '..#..', '..#..', '.###.', '.....', '.....'],
  c: ['.....', '.....', '.###.', '#...#', '#....', '#...#', '.###.', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '..#..', '.###.', '..#..', '.....'],
  s: ['.....', '.....', '.###.', '#....', '.###.', '....#', '####.', '.....', '.....'],
  y: ['.....', '.....', '#...#', '#...#', '#..##', '.##.#', '....#', '#...#', '.###.'],
  t: ['.#...', '.#...', '####.', '.#...', '.#...', '.#..#', '..##.', '.....', '.....'],
  e: ['.....', '.....', '.###.', '#...#', '#####', '#....', '.###.', '.....', '.....'],
};

// A lettering dot; (col, row) covers [col, col + 1) × [row, row + 1) in lettering coordinates.
export type Dot = [col: number, row: number];

export interface Lettering {
  cols: number;
  rows: number;
  dots: Dot[];
  has(col: number, row: number): boolean;
}

export const sameDot = (a: Dot | null, b: Dot | null) =>
  !!a && !!b && a[0] === b[0] && a[1] === b[1];
export const lineOf = (row: number) => Math.floor(row / LINE_ROWS);
// Dots of the same letter share a key.
export const glyphOf = ([col, row]: Dot) => `${lineOf(row)},${Math.floor(col / ADVANCE)}`;

const dots = LINES.flatMap((line, l) =>
  [...line].flatMap((char, i) =>
    GLYPHS[char].flatMap((art, row) =>
      [...art].flatMap((c, col): Dot[] =>
        c === '#' ? [[i * ADVANCE + col, l * LINE_ROWS + GLYPH_TOP + row]] : [],
      ),
    ),
  ),
);
const lit = new Set(dots.map(([col, row]) => `${col},${row}`));

export const LETTERING: Lettering = {
  cols: Math.max(...LINES.map((line) => line.length)) * ADVANCE - 1,
  rows: LINES.length * LINE_ROWS,
  dots,
  has: (col, row) => lit.has(`${col},${row}`),
};
