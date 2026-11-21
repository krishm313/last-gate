import { describe, expect, it } from "vitest";
import { CHAPTER_BY_ID } from "../src/core/chapters";
import { ENEMIES } from "../src/core/enemies";
import { bogSlow, createCamp, drainEvents, spawnEnemy, step, type Camp, type CampInput } from "../src/camp/sim";
import { WALL_Y } from "../src/camp/world";

const idle: CampInput = { move: { x: 0, y: 0 } };
function withBoss(id: "dragon" | "colossus" | "troll", y: number): { c: Camp; e: ReturnType<typeof spawnEnemy> } {
  const c = createCamp(5, CHAPTER_BY_ID[5]!, {});
  c.phase = "wave";
  c.queue = [];
  c.wave = 5;
  for (const p of c.plots) if (p.kind === "tower") { p.locked = false; p.level = 2; }
  const e = spawnEnemy(c, { at: 0, enemy: id, hpMult: 50, lane: null }, { x: 360, y });
  e.hp = e.maxHp * 0.45;
  return { c, e };
}
function until(c: Camp, type: string, secs: number) {
  for (let i = 0; i < secs * 60; i++) {
    c.hero.x = 360; c.hero.y = 700; c.hero.hp = c.hero.maxHp;
    step(c, idle);
    const ev = drainEvents(c).find((x) => x.type === type);
    if (ev) return ev;
  }
  return null;
}

describe("C8 boss signature moves", () => {
  it("every boss now has a signature second-phase move", () => {
    for (const d of Object.values(ENEMIES)) if (d.boss) expect(!!(d.phase2 || d.frostNova), d.id).toBe(true);
  });
  it("Bone Dragon breathes fire on the wall: wall sections scorched, towers under it smoked out", () => {
    const { c } = withBoss("dragon", WALL_Y - 175);
    const hp0 = c.segments.map((s) => s.hp);
    const ev = until(c, "breath", 20) as { x0: number; x1: number } | null;
    expect(ev).toBeTruthy();
    expect(c.segments.some((s, i) => s.hp < hp0[i]!)).toBe(true);
    expect(c.plots.some((p) => p.kind === "tower" && p.x >= ev!.x0 && p.x <= ev!.x1 && (p.stun ?? 0) > 0)).toBe(true);
  });
  it("Iron Colossus quakes: towers in reach stunned", () => {
    const { c } = withBoss("colossus", WALL_Y - 40);
    expect(until(c, "quake", 20)).toBeTruthy();
    expect(c.plots.some((p) => p.kind === "tower" && (p.stun ?? 0) > 0)).toBe(true);
  });
  it("Marsh Troll spits bog pools that slow the King but don't hurt", () => {
    const { c } = withBoss("troll", WALL_Y - 40);
    const ev = until(c, "bog", 20) as { pools: { x: number; y: number }[] } | null;
    expect(ev).toBeTruthy();
    const q = ev!.pools[0]!;
    expect(bogSlow(c, q.x, q.y)).toBeLessThan(1);
    expect(bogSlow(c, q.x + 400, q.y)).toBe(1);
  });
});
