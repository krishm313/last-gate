import { describe, expect, it } from "vitest";
import { campBotStep } from "../src/camp/bot";
import { RenderInterp } from "../src/camp/interp";
import { createCamp, step } from "../src/camp/sim";
import { STEP } from "../src/camp/world";

describe("render interpolation", () => {
  it("blends the hero between ticks and restores the exact sim state", () => {
    const c = createCamp(7);
    const it = new RenderInterp();
    const x0 = c.hero.x;
    it.snapshot(c);
    step(c, { move: { x: 1, y: 0 }, callWave: false, ability: false });
    const x1 = c.hero.x, t1 = c.time;
    expect(x1).toBeGreaterThan(x0);
    it.apply(c, 0.5);
    expect(c.hero.x).toBeCloseTo((x0 + x1) / 2, 6);
    expect(c.time).toBeLessThan(t1);
    it.restore(c);
    expect(c.hero.x).toBe(x1);
    expect(c.time).toBe(t1);
  });

  it("never blends teleports", () => {
    const c = createCamp(7);
    const it = new RenderInterp();
    it.snapshot(c);
    c.hero.x += 200;
    const far = c.hero.x;
    it.apply(c, 0.5);
    expect(c.hero.x).toBe(far);
    it.restore(c);
  });

  it("leaves a bot run identical to one without interpolation", () => {
    const a = createCamp(11), b = createCamp(11);
    const it = new RenderInterp();
    for (let i = 0; i < 1500; i++) {
      it.snapshot(a);
      campBotStep(a);
      it.apply(a, (i % 7) / 7);
      it.restore(a);
      campBotStep(b);
    }
    expect(a.hero.x).toBe(b.hero.x);
    expect(a.enemies.map((e) => [e.x, e.y])).toEqual(b.enemies.map((e) => [e.x, e.y]));
    expect(a.time).toBe(b.time);
  });

  it("gives even on-screen steps on a 120 Hz display (no repeated frames)", () => {
    const drawn = (useInterp: boolean): number[] => {
      const c = createCamp(3);
      const it = new RenderInterp();
      let acc = 0;
      const xs: number[] = [];
      for (let f = 0; f < 60; f++) {
        acc += 1 / 120;
        while (acc >= STEP - 1e-9) {
          it.snapshot(c);
          step(c, { move: { x: 0, y: -1 }, callWave: false, ability: false }); // up the open field
          acc -= STEP;
        }
        if (useInterp) it.apply(c, acc / STEP);
        xs.push(-c.hero.y);
        if (useInterp) it.restore(c);
      }
      return xs.slice(20).map((x, i, a) => (i ? x - a[i - 1]! : 0)).slice(1);
    };
    const raw = drawn(false), smooth = drawn(true);
    expect(raw.filter((d) => Math.abs(d) < 1e-6).length).toBeGreaterThan(10); // every other frame repeats
    const mean = smooth.reduce((a, b) => a + b, 0) / smooth.length;
    for (const d of smooth) expect(Math.abs(d - mean)).toBeLessThan(mean * 0.05);
  });
});
