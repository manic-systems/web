export interface Point {
  x: number;
  y: number;
}

export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const between = ([min, max]: readonly number[]) => min + Math.random() * (max - min);
export const pick = <T>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)];
