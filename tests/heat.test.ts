import { describe, expect, it } from "vitest";
import { cleanHeat, HEATS, heatAllowed, heatGold } from "../src/core/heat";
import { applyRun, newSave, sanitizeSave } from "../src/core/meta";

describe("Heat", () => {
  it("adds up gold, ignores unknown or repeated ids", () => {
    expect(heatGold([])).toBe(1);
    expect(heatGold(["hide", "hide", "nope"])).toBeCloseTo(1 + HEATS.find((h) => h.id === "hide")!.gold);
    expect(cleanHeat(["swift", 3, "swift", "x"])).toEqual(["swift"]);
    expect(heatGold(HEATS.map((h) => h.id))).toBeGreaterThan(2);
  });
  it("applies to the campaign and Endless only", () => {
    expect(heatAllowed(1) && heatAllowed(10) && heatAllowed(99)).toBe(true);
    expect(heatAllowed(98)).toBe(false);
  });
  it("pays its bonus on top of the run's gold, reported separately", () => {
    const run = { chapter: 3, won: true, wave: 10, gateFrac: 0.9, goldFromKills: 100 };
    const a = newSave(), b = newSave();
    const base = applyRun(a, run);
    const hot = applyRun(b, { ...run, heatMult: 1.5 });
    expect(hot.heatBonus).toBe(Math.round(base.gold * 0.5));
    expect(hot.gold).toBe(base.gold + hot.heatBonus!);
    expect(b.gold - a.gold).toBe(hot.heatBonus);
    expect(base.heatBonus).toBeUndefined();
  });
  it("is saved", () => {
    const s = newSave();
    s.heat = ["lean", "elite", "bogus"];
    expect(sanitizeSave(JSON.parse(JSON.stringify(s))).heat).toEqual(["lean", "elite"]);
  });
});
