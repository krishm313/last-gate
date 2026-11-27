import { describe, expect, it } from "vitest";
import { newSave, sanitizeSave } from "../src/core/meta";
import { CONQUEST, conquestTotal, recordConquest, type Conquest } from "../src/core/conquest";

describe("Conquest board (B2)", () => {
  it("pays each milestone once, tracks Endless best, survives a reload", () => {
    const c: Conquest = {};
    expect(recordConquest(c, "none", { chapter: 3, endless: false, won: true, nights: 10 })).toEqual([]);
    const a = recordConquest(c, "pyre", { chapter: 10, endless: false, won: true, nights: 10 });
    expect(a.map((x) => x.gold)).toEqual([CONQUEST.gold.win, CONQUEST.gold.ch10]);
    expect(recordConquest(c, "pyre", { chapter: 10, endless: false, won: true, nights: 10 })).toEqual([]);
    expect(recordConquest(c, "pyre", { chapter: 99, endless: true, won: false, nights: 9 })).toEqual([]);
    expect(recordConquest(c, "pyre", { chapter: 99, endless: true, won: false, nights: 16 }).map((x) => x.gold)).toEqual([CONQUEST.gold.endless]);
    expect(recordConquest(c, "levy", { chapter: 2, endless: false, won: false, nights: 5 })).toEqual([]);
    expect(conquestTotal(c)).toBe(3);
    const s = newSave();
    s.conquest = c;
    const back = sanitizeSave(JSON.parse(JSON.stringify(s)));
    expect(back.conquest?.pyre).toEqual({ win: true, ch10: true, endless: 16 });
    expect(sanitizeSave({ ...s, conquest: { pyre: { win: "yes", endless: 1e9 }, bogus: {} } }).conquest).toEqual({ pyre: { win: false, ch10: false, endless: 9999 } });
  });
});

describe("Conquest in Next goals (B2)", () => {
  it("a campaign graduate's first goal is their banner's next Conquest milestone", async () => {
    const { nextGoals } = await import("../src/core/goals");
    const { CHAPTERS } = await import("../src/core/chapters");
    const s = newSave();
    for (const ch of CHAPTERS) s.stars[ch.id] = 3;
    s.banner = "pyre";
    s.conquest = { pyre: { win: true, ch10: false, endless: 0 } };
    const g = nextGoals(s)[0]!;
    expect(g.key).toBe("cq-pyre");
    expect(g.reward).toBe(CONQUEST.gold.ch10);
    expect(g.action).toEqual({ kind: "chapter", id: 10 });
  });
});
