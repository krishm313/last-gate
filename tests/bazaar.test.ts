import { describe, expect, it } from "vitest";
import { activeFlair, buyFlair, FLAIRS } from "../src/core/flair";
import { newSave, sanitizeSave } from "../src/core/meta";

describe("Royal Bazaar", () => {
  it("sells priced flairs for gold, wears them, and never double-charges", () => {
    const s = newSave();
    const f = FLAIRS.find((x) => x.price)!;
    s.gold = f.price! - 1;
    expect(buyFlair(s, f.id)).toBe(false);
    s.gold = f.price! + 10;
    expect(buyFlair(s, f.id)).toBe(true);
    expect(s.gold).toBe(10);
    expect(activeFlair(s)).toBe(f.id);
    s.gold = 99999;
    expect(buyFlair(s, f.id)).toBe(false);
    expect(s.gold).toBe(99999);
    expect(sanitizeSave(JSON.parse(JSON.stringify(s))).bought).toEqual([f.id]);
  });
  it("earned flairs can't be bought", () => {
    const s = newSave();
    s.gold = 1e6;
    expect(buyFlair(s, "gold")).toBe(false);
    expect(FLAIRS.filter((f) => f.price).length).toBeGreaterThanOrEqual(5);
  });
});
