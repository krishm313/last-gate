import { describe, expect, it } from "vitest";
import { createForge, FORGE, forgeReward, stepForge, strike, strikeAt } from "../src/mini/forge";

const until = (s: ReturnType<typeof createForge>, ok: () => boolean) => {
  for (let i = 0; i < 6000 && !ok(); i++) stepForge(s, 1 / 120);
};

describe("royal forge", () => {
  it("is deterministic per seed", () => {
    const a = createForge(7), b = createForge(7);
    for (let i = 0; i < 300; i++) { stepForge(a, 1 / 60); stepForge(b, 1 / 60); }
    expect(a.pos).toBe(b.pos);
    expect(a.zone).toBe(b.zone);
  });
  it("perfect strikes forge a flawless blade after five hits", () => {
    const s = createForge(3);
    for (let i = 0; i < FORGE.strikes; i++) {
      until(s, () => strikeAt(s) === "perfect");
      expect(strike(s)).toBe("perfect");
    }
    expect(s.blades).toBe(1);
    // 5 perfects (×1, the 5th at ×2) + blade + flawless bonus.
    expect(s.score).toBe(FORGE.perfect * 4 + FORGE.perfect * 2 + FORGE.blade + FORGE.flawless);
    expect(s.hits).toBe(0);
  });
  it("three misses crack the anvil and end the round", () => {
    const s = createForge(5);
    for (let i = 0; i < FORGE.cracks; i++) {
      until(s, () => strikeAt(s) === "miss");
      expect(strike(s)).toBe("miss");
    }
    expect(s.over && s.lost).toBe(true);
  });
  it("the marker bounces inside the bar and the round lasts 60 s", () => {
    const s = createForge(9);
    let lo = 1, hi = 0;
    while (!s.over) { stepForge(s, 1 / 60); lo = Math.min(lo, s.pos); hi = Math.max(hi, s.pos); }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(1);
    expect(s.time).toBeGreaterThanOrEqual(FORGE.time - 1e-6);
  });
  it("pays star bonuses once", () => {
    expect(forgeReward(FORGE.stars[2], 0)).toMatchObject({ stars: 3, newStars: 3 });
    expect(forgeReward(FORGE.stars[2], 3).gold).toBe(Math.round(FORGE.stars[2] / 4));
  });
});
