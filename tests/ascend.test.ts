import { describe, expect, it } from "vitest";
import { ascend, ASCEND, buyPerm, canAscend, newSave, PERMS, permCost, sanitizeSave } from "../src/core/meta";
import { campSetupFromSave } from "../src/camp/meta";

const maxed = () => {
  const s = newSave();
  for (const p of PERMS) s.perms[p.id] = p.max;
  return s;
};

describe("Ascension", () => {
  it("opens only when every upgrade (the capstone too) is maxed", () => {
    const s = maxed();
    expect(canAscend(s)).toBe(true);
    s.perms.legacy = 9;
    expect(canAscend(s)).toBe(false);
    expect(ascend(s)).toBe(false);
  });

  it("resets the Armory, grants a Crown, keeps gold, and raises prices", () => {
    const s = maxed();
    s.gold = 5000;
    expect(ascend(s)).toBe(true);
    expect(s.crowns).toBe(1);
    expect(s.gold).toBe(5000);
    for (const p of PERMS) expect(s.perms[p.id]).toBe(0);
    const p = PERMS[0]!;
    expect(permCost(p, 0, 1)).toBeGreaterThan(permCost(p, 0, 0));
    expect(buyPerm(s, p.id)).toBe(true);
    expect(s.gold).toBe(5000 - permCost(p, 0, 1));
  });

  it("Crowns make runs stronger and survive a save round-trip, capped", () => {
    const s = maxed();
    const before = campSetupFromSave(s).mods!;
    s.crowns = 2;
    const after = campSetupFromSave(s).mods!;
    expect(after.towerDamage / before.towerDamage).toBeCloseTo(1 + ASCEND.power * 2);
    expect(after.drops / before.drops).toBeCloseTo(1 + ASCEND.gold * 2);
    expect(sanitizeSave(JSON.parse(JSON.stringify(s))).crowns).toBe(2);
    expect(sanitizeSave({ ...s, crowns: 999 }).crowns).toBe(ASCEND.maxCrowns);
    s.crowns = ASCEND.maxCrowns;
    expect(canAscend(s)).toBe(false);
  });
});
