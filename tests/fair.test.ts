import { describe, expect, it } from "vitest";
import { fairPick, openMinis } from "../src/mini/fair";

describe("Fair day", () => {
  it("picks one open mini-game per day, the same all day", () => {
    expect(fairPick("2026-11-20", [])).toBeNull();
    expect(fairPick("2026-11-20", ["archery"])).toBe("archery");
    const all = ["archery", "supply", "watch", "catapult"];
    expect(fairPick("2026-11-20", all)).toBe(fairPick("2026-11-20", all));
    const seen = new Set(Array.from({ length: 30 }, (_, d) => fairPick(`2026-12-${String(d + 1).padStart(2, "0")}`, all)));
    expect(seen.size).toBe(4); // every game gets its day over a month
  });

  it("knows which side stops are open from chapter stars", () => {
    expect(openMinis({ 1: 2, 2: 1, 3: 1 })).toEqual(["archery", "supply"]);
  });
});
