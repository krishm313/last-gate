// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { loadSettings, saveSettings } from "../src/ui/settings";

describe("settings", () => {
  beforeEach(() => localStorage.clear());

  it("defaults music to 80% and effects to 100%", () => {
    const s = loadSettings();
    expect(s.musicVol).toBe(0.8);
    expect(s.sfxVol).toBe(1);
  });

  it("round-trips volumes and rejects invalid stored values", () => {
    const s = loadSettings();
    s.musicVol = 0.35;
    saveSettings(s);
    expect(loadSettings().musicVol).toBe(0.35);
    localStorage.setItem("lastgate.settings", JSON.stringify({ musicVol: 7, sfxVol: "loud" }));
    const bad = loadSettings();
    expect(bad.musicVol).toBe(0.8);
    expect(bad.sfxVol).toBe(1);
  });

  it("survives corrupt JSON", () => {
    localStorage.setItem("lastgate.settings", "{nope");
    expect(loadSettings().music).toBe(true);
  });
});
