import { describe, expect, it } from "vitest";
import { createMason, drop, MASON, masonReward, stepMason } from "../src/mini/mason";

const toCentre = (s: ReturnType<typeof createMason>) => {
  const top = s.tower[s.tower.length - 1]!;
  for (let i = 0; i < 2000 && Math.abs(s.x - top.x) > 1.5; i++) stepMason(s, 1 / 240);
};

describe("mason's tower", () => {
  it("perfect drops keep the width and score a bonus", () => {
    const s = createMason();
    toCentre(s);
    expect(drop(s)).toBe("perfect");
    expect(s.tower.length).toBe(2);
    expect(s.tower[1]!.w).toBe(MASON.base);
    expect(s.score).toBe(MASON.place + MASON.perfectBonus);
  });
  it("an off-centre drop cuts the block to the overlap", () => {
    const s = createMason();
    s.x = s.tower[0]!.x + 30;
    expect(drop(s)).toBe("cut");
    expect(s.tower[1]!.w).toBeCloseTo(MASON.base - 30, 0);
    expect(s.chip!.w).toBeCloseTo(30, 0);
    expect(s.w).toBeCloseTo(MASON.base - 30, 0);
  });
  it("missing the tower entirely ends the round", () => {
    const s = createMason();
    s.x = 180 + MASON.base + 5;
    expect(drop(s)).toBe("miss");
    expect(s.over && s.lost).toBe(true);
  });
  it("a streak of perfects grows the block back", () => {
    const s = createMason();
    toCentre(s);
    s.x += 20;
    drop(s);
    const w = s.w;
    for (let i = 0; i < MASON.streak + 1; i++) { toCentre(s); expect(drop(s)).toBe("perfect"); }
    expect(s.w).toBe(Math.min(MASON.base, w + MASON.grow));
  });
  it("the block slides inside its range and the round lasts 60 s", () => {
    const s = createMason();
    while (!s.over) { stepMason(s, 1 / 60); expect(s.x).toBeGreaterThanOrEqual(MASON.left); expect(s.x).toBeLessThanOrEqual(MASON.right); }
    expect(s.lost).toBe(false);
    expect(masonReward(MASON.stars[2], 0)).toMatchObject({ stars: 3, newStars: 3 });
  });
});
