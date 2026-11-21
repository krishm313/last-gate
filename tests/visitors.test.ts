import { describe, expect, it } from "vitest";
import { chooseBlessing, createCamp, drainEvents, rollVisitor, step, VISITOR, type Camp } from "../src/camp/sim";
import { campBotStep } from "../src/camp/bot";
import { CHAPTER_BY_ID } from "../src/core/chapters";
import { STEP } from "../src/camp/world";
import { BLESSING_BY_ID } from "../src/camp/blessings";

const still = { move: { x: 0, y: 0 } };

/** A camp in the build phase of day `wave` whose visitor is of `kind`. */
function withVisitor(kind: "shrine" | "merchant"): Camp {
  for (let seed = 1; seed < 3000; seed++) {
    const c = createCamp(seed, CHAPTER_BY_ID[3]);
    c.wave = 4;
    const v = rollVisitor(c);
    if (v?.kind !== kind) continue;
    c.visitor = v;
    c.phase = "build";
    c.timer = 30;
    return c;
  }
  throw new Error(`no ${kind}`);
}

describe("daytime visitors", () => {
  it("come on roughly 30% of days, never in dailies, Siege or before the final night", () => {
    let n = 0;
    for (let seed = 1; seed < 400; seed++) {
      const c = createCamp(seed, CHAPTER_BY_ID[3]);
      c.wave = 4;
      if (rollVisitor(c)) n++;
      const d = createCamp(seed, CHAPTER_BY_ID[3], { classicBlessings: true });
      d.wave = 4;
      expect(rollVisitor(d)).toBeNull();
      c.wave = c.chapter.waves.length - 1;
      expect(rollVisitor(c)).toBeNull();
    }
    expect(n / 400).toBeGreaterThan(0.22);
    expect(n / 400).toBeLessThan(0.38);
  });

  it("Cursed Shrine: standing on it makes tonight an Elite Raid and adds a rule card to the next pick", () => {
    const c = withVisitor("shrine");
    c.hero.x = c.visitor!.x;
    c.hero.y = c.visitor!.y;
    for (let i = 0; i < (VISITOR.shrineHold + 0.2) / STEP; i++) step(c, still);
    expect(c.cursed).toBe(true);
    expect(drainEvents(c).some((e) => e.type === "visitor" && e.action === "accept")).toBe(true);
    c.timer = 0.001;
    step(c, still);
    expect(c.nightEvent).toBe("elite");
    expect(c.visitor).toBeNull();
    c.queue = [];
    c.enemies = [];
    step(c, still);
    expect(c.phase).toBe("pick");
    expect(c.offers.some((b) => b.rule)).toBe(true);
  });

  it("Wandering Merchant: coins flow in while you stand there; the blessing is yours when paid", () => {
    const c = withVisitor("merchant");
    const v = c.visitor!;
    c.mods.carry = 500;
    c.hero.coins = v.price + 5;
    c.hero.x = v.x;
    c.hero.y = v.y;
    for (let i = 0; i < (0.4 + v.price * VISITOR.payEvery + 0.3) / STEP; i++) step(c, still);
    expect(v.done).toBe(true);
    expect(v.paid).toBe(v.price);
    expect(c.owned[v.offer!]).toBe(1);
    expect(BLESSING_BY_ID[v.offer!]!.rule).toBeFalsy();
  });

  it("the balance bot never triggers a visitor", () => {
    const c = withVisitor("shrine");
    c.hero.x = c.visitor!.x;
    c.hero.y = c.visitor!.y;
    for (let i = 0; i < 3 / STEP; i++) campBotStep(c);
    expect(c.cursed).toBe(false);
  });
  void chooseBlessing;
});
