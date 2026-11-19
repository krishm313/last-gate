import { describe, expect, it } from "vitest";
import { musicIntensity } from "../src/audio/intensity";

const base = { phase: "wave", wave: 1, waves: 10, nightProgress: 0, hallFrac: 1 };
describe("music intensity", () => {
  it("is calm by day and rises at night", () => {
    expect(musicIntensity({ ...base, phase: "build" })).toBeLessThan(0.25);
    expect(musicIntensity(base)).toBeGreaterThan(0.25); // drums come in
  });
  it("builds through the campaign and the night, and spikes in danger", () => {
    const early = musicIntensity(base);
    const late = musicIntensity({ ...base, wave: 9 });
    const endOfNight = musicIntensity({ ...base, wave: 9, nightProgress: 1 });
    const danger = musicIntensity({ ...base, wave: 9, nightProgress: 1, hallFrac: 0.1 });
    expect(late).toBeGreaterThan(early);
    expect(endOfNight).toBeGreaterThan(late);
    expect(danger).toBeGreaterThan(0.8);
    expect(danger).toBeLessThanOrEqual(1);
  });
});
