import { describe, expect, it } from "vitest";
import { CHAPTER_BY_ID } from "../src/core/chapters";
import { campLayout, createCamp, layoutFor, spawnEnemy } from "../src/camp/sim";
import { MAP_W } from "../src/camp/world";

describe("camp layouts (C6)", () => {
  it("a mirrored camp reflects every plot, drop-off spot and the hero spawn about the road", () => {
    const ch = CHAPTER_BY_ID[5]!;
    const a = createCamp(7, ch, { layout: campLayout(false) });
    const b = createCamp(7, ch, { layout: campLayout(true) });
    for (const p of a.plots) {
      const q = b.plots.find((x) => x.id === p.id)!;
      expect(q.x).toBeCloseTo(MAP_W - p.x);
      expect(q.y).toBe(p.y);
    }
    expect(b.hero.x).toBeCloseTo(MAP_W - a.hero.x);
    expect(b.lay.lumberPile.x).toBeCloseTo(MAP_W - a.lay.lumberPile.x);
    expect(b.lay.forgeIn.x).toBeCloseTo(MAP_W - a.lay.forgeIn.x);
    expect(b.lay.grove[0]!.x).toBeCloseTo(MAP_W - a.lay.grove[0]!.x);
  });
  it("enemy lanes mirror too (same RNG draw, reflected x)", () => {
    const ch = CHAPTER_BY_ID[5]!;
    const a = createCamp(9, ch, { layout: campLayout(false) });
    const b = createCamp(9, ch, { layout: campLayout(true) });
    a.wave = b.wave = 6;
    for (const lane of [null, 0, 0.25, 1]) {
      const ea = spawnEnemy(a, { at: 0, enemy: "tunneler", hpMult: 1, lane });
      const eb = spawnEnemy(b, { at: 0, enemy: "tunneler", hpMult: 1, lane });
      expect(eb.x).toBeCloseTo(MAP_W - ea.x);
    }
  });
  it("chapter 1, daily (classic) runs and Siege Lord keep the classic layout; others vary by seed", () => {
    for (let s = 0; s < 40; s++) expect(layoutFor(s, 1, false).mirror).toBe(false);
    for (let s = 0; s < 40; s++) expect(layoutFor(s, 4, true).mirror).toBe(false);
    const n = Array.from({ length: 200 }, (_, s) => layoutFor(s, 4, false).mirror).filter(Boolean).length;
    expect(n).toBeGreaterThan(60);
    expect(n).toBeLessThan(140);
    expect(layoutFor(123, 6, false)).toEqual(layoutFor(123, 6, false));
  });
});
