/** Logical world size. Everything in the simulation is in these units; the renderer scales to fit. */
export const WORLD_W = 450;
export const WORLD_H = 800;

/** y of the front face of the castle wall. Enemies stop here and attack the gate. */
export const WALL_Y = 630;
/** Enemies spawn just above the top edge. */
export const SPAWN_Y = -24;
/** Horizontal margin enemies keep from the screen edges. */
export const FIELD_MARGIN = 36;

export const HERO_POS = { x: WORLD_W / 2, y: 676 } as const;

/** Fixed simulation step (seconds). The sim is deterministic for a given seed and input stream. */
export const STEP = 1 / 60;
