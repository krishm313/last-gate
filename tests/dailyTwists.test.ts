import { describe, expect, it } from "vitest";
import { baseMods } from "../src/camp/blessings";
import { dailyFor, TWISTS } from "../src/core/daily";

const day = (start: string, i: number) => {
  const d = new Date(`${start}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + i);
  return d.toISOString().slice(0, 10);
};
const NEW = ["swift", "long-shots", "rally", "tax-day"];

describe("daily twists", () => {
  it("the Nov 27 twists never change days before they arrive", () => {
    for (let i = 0; i < 40; i++) expect(NEW).not.toContain(dailyFor(day("2026-10-18", i)).twist.id);
  });
  it("they show up once their date comes", () => {
    const seen = new Set(Array.from({ length: 90 }, (_, i) => dailyFor(day("2026-11-27", i)).twist.id));
    for (const id of NEW) expect(seen).toContain(id);
  });
  it("only modifies real run mods", () => {
    const keys = Object.keys(baseMods());
    for (const t of TWISTS) for (const k of Object.keys(t.mods ?? {})) expect(keys).toContain(k);
  });
});

describe("daily heroes", () => {
  it("the Alchemist only joins the daily hero pool from Dec 3", () => {
    for (let i = 0; i < 45; i++) expect(dailyFor(day("2026-10-19", i)).hero).not.toBe("alchemist");
    const later = Array.from({ length: 90 }, (_, i) => dailyFor(day("2026-12-03", i)).hero);
    expect(later).toContain("alchemist");
  });
});
