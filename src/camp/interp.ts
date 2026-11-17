// Render interpolation: the sim advances in fixed STEP ticks, but screens refresh at 60/90/120 Hz
// and frames rarely line up with ticks. Drawing positions exactly where the last tick left them
// makes motion judder (repeated or doubled steps). Instead we remember every moving thing's
// position before the latest tick and, just for drawing, place it between the two ticks by the
// leftover fraction of a tick — then put the true values back before the sim runs again.
// The sim never sees the blended values, so it stays deterministic.
import type { Camp } from "./sim";

type Pos = { x: number; y: number; z?: number };
/** Jumps larger than this between ticks are teleports (respawns, spawns) — never blended. */
const TELEPORT = 48;

export class RenderInterp {
  private prev = new WeakMap<object, Pos>();
  private prevTime = 0;
  private saved: [object & Pos, Pos][] = [];
  private savedTime = 0;

  /** Every object whose position should glide between ticks. */
  private static movers(c: Camp): (object & Pos)[] {
    return [c.hero, ...c.enemies, ...c.allies, ...c.workers, ...c.arrows, ...c.coins];
  }

  /** Call right before each sim tick: records where everything is before it moves. */
  snapshot(c: Camp): void {
    for (const o of RenderInterp.movers(c)) this.prev.set(o, { x: o.x, y: o.y, z: o.z });
    this.prevTime = c.time;
  }

  /** Before drawing: blend each mover `alpha` (0..1) of the way from its pre-tick to its current position. */
  apply(c: Camp, alpha: number): void {
    this.saved.length = 0;
    const a = Math.min(1, Math.max(0, alpha));
    for (const o of RenderInterp.movers(c)) {
      const p = this.prev.get(o);
      if (!p) continue;
      const dx = o.x - p.x, dy = o.y - p.y;
      if (dx * dx + dy * dy > TELEPORT * TELEPORT) continue;
      this.saved.push([o, { x: o.x, y: o.y, z: o.z }]);
      o.x = p.x + dx * a;
      o.y = p.y + dy * a;
      if (o.z !== undefined && p.z !== undefined) o.z = p.z + (o.z - p.z) * a;
    }
    // The animation clock too, so walk cycles and bobbing advance smoothly with the motion.
    this.savedTime = c.time;
    if (c.time > this.prevTime && c.time - this.prevTime < 0.1) c.time = this.prevTime + (c.time - this.prevTime) * a;
  }

  /** After drawing: put the sim's true values back. */
  restore(c: Camp): void {
    for (const [o, v] of this.saved) {
      o.x = v.x;
      o.y = v.y;
      if (v.z !== undefined) o.z = v.z;
    }
    this.saved.length = 0;
    c.time = this.savedTime;
  }
}
