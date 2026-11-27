import { describe, expect, it } from "vitest";
import { newSave } from "../src/core/meta";
import { kingdomProgress } from "../src/ui/kingdom";
import { CHAPTERS } from "../src/core/chapters";

describe("C11 kingdom view", () => {
  it("grows one landmark per chapter cleared and always names the next", () => {
    const s = newSave();
    const p0 = kingdomProgress(s);
    expect(p0.raised).toBe(1); // the starting archer towers
    expect(p0.next?.name).toBe("Lumber Camp");
    s.stars[1] = 3;
    s.stars[2] = 1;
    const p2 = kingdomProgress(s);
    expect(p2.raised).toBe(3);
    expect(p2.next?.name).toBe("Forge");
    for (const ch of CHAPTERS) s.stars[ch.id] = 3;
    const all = kingdomProgress(s);
    expect(all.raised).toBe(all.total);
    expect(all.next).toBeNull();
  });
});
