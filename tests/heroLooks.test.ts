import { describe, expect, it } from "vitest";
import { campSetupFromSave } from "../src/camp/meta";
import { VET_NIGHTS, vetLookOn, vetLookOpen } from "../src/core/heroes";
import { newSave, sanitizeSave } from "../src/core/meta";

describe("veteran hero looks", () => {
  it("open after enough nights with that hero, never for the King, and survive a save round-trip", () => {
    const s = newSave();
    expect(vetLookOpen(s, "knight")).toBe(false);
    s.heroes.knight.xp = VET_NIGHTS;
    s.heroes.ranger.xp = 999;
    expect(vetLookOpen(s, "knight")).toBe(true);
    expect(vetLookOpen(s, "ranger")).toBe(false);
    expect(vetLookOn(s, "knight")).toBe(false);
    s.stats.look_knight = 1;
    expect(vetLookOn(s, "knight")).toBe(true);
    const back = sanitizeSave(JSON.parse(JSON.stringify(s)));
    expect(vetLookOn(back, "knight")).toBe(true);
    expect(campSetupFromSave(back, "knight").heroVet).toBe(true);
    expect(campSetupFromSave(back, "pyro").heroVet).toBe(false);
  });
});
