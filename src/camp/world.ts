/** Camp map layout (world units). Portrait map, forest at the top, camp at the bottom. */
export const MAP_W = 720;
export const MAP_H = 1300;

/** Enemies spawn in the forest band and march down. */
export const FOREST_Y = 230;
export const SPAWN_Y = 40;

/** The palisade runs across the map at this y. */
export const WALL_Y = 560;
export const WALL_THICK = 22;
export const SEGMENT_W = 60;
export const SEGMENTS = MAP_W / SEGMENT_W;
/** Segment index of the gate (the hero can walk through it; enemies must break it). */
export const GATE_SEGMENTS = [5, 6];

export const HALL = { x: 360, y: 1050, r: 56 };
/** Where the hall's coin income piles up. */
export const INCOME_PILE = { x: 470, y: 1050 };
export const HERO_SPAWN = { x: 250, y: 1010 };

export const VIEW_W = 450;
export const VIEW_H = 800;

export const STEP = 1 / 60;

export function segmentIndexAt(x: number): number {
  return Math.max(0, Math.min(SEGMENTS - 1, Math.floor(x / SEGMENT_W)));
}

export function segmentCenter(i: number): number {
  return i * SEGMENT_W + SEGMENT_W / 2;
}
