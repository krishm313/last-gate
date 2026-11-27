import { describe, expect, it } from "vitest";
import { CHAPTER_BY_ID } from "../src/core/chapters";
import { CAMP, campLayout, createCamp } from "../src/camp/sim";
import { MAP_W } from "../src/camp/world";

// Gate added after the Ballista's first pad landed on top of the Barracks: every build pad has its
// own ground (centres ≥ 1.6 × plotHalf apart on some axis — the Catapult and Spike Trap pads have
// always just touched corners), in both camp layouts, and stays out of the tree lines.
describe("plot layout", () => {
  for (const mirror of [false, true]) {
    it(`no two pads overlap and none sit in the tree line (${mirror ? "mirrored" : "classic"})`, () => {
      const c = createCamp(1, CHAPTER_BY_ID[5]!, { layout: campLayout(mirror) });
      const bad: string[] = [];
      for (const a of c.plots) {
        if (a.x < 70 || a.x > MAP_W - 70) bad.push(`${a.id} in tree line (${a.x})`);
        for (const b of c.plots) if (a !== b && a.id < b.id && Math.abs(a.x - b.x) < CAMP.plotHalf * 1.6 && Math.abs(a.y - b.y) < CAMP.plotHalf * 1.6) bad.push(`${a.id} overlaps ${b.id}`);
      }
      expect(bad).toEqual([]);
    });
  }
});
