import { describe, expect, it } from "vitest";
import { Tutorial } from "../src/camp/tutorial";
import { carryCap, createCamp } from "../src/camp/sim";

describe("tutorial", () => {
  it("walks the first steps and never stalls when the hero is already full of coins", () => {
    const t = new Tutorial();
    t.reset();
    const c = createCamp(1);
    expect(t.update(c, 0.1, false)).toMatch(/walk/i);
    t.update(c, 1.5, true); // moved enough
    expect(t.update(c, 0.1, false)).toMatch(/Archer Tower/);
    c.plots.find((p) => p.kind === "tower")!.level = 1;
    expect(t.update(c, 0.1, false)).toMatch(/hall sends you coins/);
    expect(t.focus).toBeNull(); // coins come to the King; nothing to point at
    c.hero.coins = carryCap(c); // full: can't collect more, so the step must still finish
    expect(t.update(c, 0.1, false)).toMatch(/Start the night/);
    expect(t.focus).toBeNull();
  });
});
