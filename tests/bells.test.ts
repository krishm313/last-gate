import { describe, expect, it } from "vitest";
import { BELLS, bellsReward, createBells, ring, showingBell, stepBells } from "../src/mini/bells";

const toPlay = (s: ReturnType<typeof createBells>) => {
  const heard: number[] = [];
  let last = -1;
  for (let i = 0; i < 2000 && s.phase === "show"; i++) {
    stepBells(s, 1 / 120);
    const b = showingBell(s);
    if (b >= 0 && b !== last) heard.push(b);
    last = b;
  }
  return heard;
};

describe("bell tower", () => {
  it("is deterministic per seed", () => {
    expect(createBells(5).tune).toEqual(createBells(5).tune);
  });
  it("plays the tune, ignores taps while it plays, and a right answer adds a note", () => {
    const s = createBells(11);
    expect(ring(s, s.tune[0]!)).toBe("ignored");
    toPlay(s);
    expect(s.phase).toBe("play");
    const len = s.tune.length;
    for (let i = 0; i < len - 1; i++) expect(ring(s, s.tune[i]!)).toBe("right");
    expect(ring(s, s.tune[len - 1]!)).toBe("done");
    expect(s.score).toBe(len * BELLS.perNote);
    expect(s.tune.length).toBe(len + 1);
    expect(s.phase).toBe("show");
  });
  it("a wrong bell cracks the tower and replays the same tune; three end it", () => {
    const s = createBells(2);
    const tune = [...s.tune];
    for (let k = 0; k < BELLS.cracks; k++) {
      toPlay(s);
      expect(ring(s, (s.tune[0]! + 1) % BELLS.n)).toBe("wrong");
      expect(s.tune).toEqual(tune);
    }
    expect(s.over && s.lost).toBe(true);
  });
  it("every note of the tune is shown, repeats included (a gap separates them)", () => {
    const s = createBells(7);
    expect(toPlay(s)).toEqual(s.tune);
  });
  it("pays star bonuses once", () => {
    expect(bellsReward(BELLS.stars[2], 0)).toMatchObject({ stars: 3, newStars: 3 });
    expect(bellsReward(BELLS.stars[2], 3).gold).toBe(BELLS.stars[2] / 2);
  });
});
