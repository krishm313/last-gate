import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { newSave, sanitizeSave } from "../src/core/meta";

// A2 — save robustness. Two permanent guards for the bug class "a new save field silently vanishes
// on reload" (hit with the hero weapon pick): every SaveData field must be handled by sanitizeSave,
// and garbage in any field must never crash a load.
const src = readFileSync(new URL("../src/core/meta.ts", import.meta.url), "utf8");
const iface = src.slice(src.indexOf("export interface SaveData {"), src.indexOf("\n}\n", src.indexOf("export interface SaveData {")));
const keys = [...iface.matchAll(/^\s{2}([a-zA-Z]+)\??:/gm)].map((m) => m[1]!);
const body = src.slice(src.indexOf("export function sanitizeSave("));

describe("save guards (A2)", () => {
  it("found the SaveData fields", () => {
    expect(keys.length).toBeGreaterThan(15);
    expect(keys).toContain("weapon");
  });
  it("every SaveData field is handled by sanitizeSave (or a new field would vanish on reload)", () => {
    const missing = keys.filter((k) => k !== "version" && !new RegExp(`\\bd\\.${k}\\b|\\b${k}\\s*[:=]|["']${k}["']|\\.${k}\\b`).test(body));
    expect(missing).toEqual([]);
  });
  it("the newest picks survive a round-trip", () => {
    const s = newSave();
    for (let i = 1; i <= 10; i++) s.stars[i] = 3;
    s.weapon = "crossbow";
    s.pet = "hound";
    s.crowns = 2;
    const back = sanitizeSave(JSON.parse(JSON.stringify(s)));
    expect(back.weapon).toBe("crossbow");
    expect(back.pet).toBe("hound");
    expect(back.crowns).toBe(2);
  });
  it("garbage in any field never crashes a load and always yields a playable save", () => {
    const junk: unknown[] = [null, undefined, 0, -1, 1e308, NaN, "x", "", true, [], [1, "a", null], {}, { a: 1 }, { 1: "z" }];
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let round = 0; round < 400; round++) {
      const raw: Record<string, unknown> = JSON.parse(JSON.stringify(newSave()));
      for (const k of keys) if (rnd() < 0.4) raw[k] = junk[Math.floor(rnd() * junk.length)];
      const s = sanitizeSave(raw);
      expect(typeof s.gold).toBe("number");
      expect(Number.isFinite(s.gold)).toBe(true);
      expect(s.hero).toBeTruthy();
      expect(Array.isArray(s.claimed)).toBe(true);
      expect(typeof s.stars).toBe("object");
    }
    for (const raw of junk) expect(() => sanitizeSave(raw)).not.toThrow();
  });
});
