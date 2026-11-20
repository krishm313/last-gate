import { describe, expect, it } from "vitest";
import { baseMods } from "../src/camp/blessings";
import { ENDLESS_TWISTS, endlessTwistFor } from "../src/core/endlessMods";
import { weekNumber } from "../src/core/quests";

const day = (start: string, i: number) => {
  const d = new Date(`${start}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + i);
  return d.toISOString().slice(0, 10);
};
const NEW = ["legion", "swift"];

describe("endless weekly twists", () => {
  it("adding Legion and Swift Week doesn't change any week before they arrive", () => {
    for (let i = 0; i < 120; i++) {
      const d = day("2026-09-01", i);
      if (d >= "2026-12-14") break;
      const old = ENDLESS_TWISTS.filter((t) => !NEW.includes(t.id) && (!t.since || d >= t.since));
      const w = weekNumber(d);
      expect(endlessTwistFor(d).id).toBe(old[((w % old.length) + old.length) % old.length]!.id);
    }
  });
  it("both come up within the next few months, and only touch real run mods", () => {
    const seen = new Set(Array.from({ length: 30 }, (_, i) => endlessTwistFor(day("2026-12-14", i * 7)).id));
    for (const id of NEW) expect(seen).toContain(id);
    const keys = Object.keys(baseMods());
    for (const t of ENDLESS_TWISTS) for (const k of Object.keys(t.mods ?? {})) expect(keys).toContain(k);
  });
});
