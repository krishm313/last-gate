import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// `#ui .overlay *` turns pointer events back on for everything inside an overlay, so any full-size
// decoration placed in one (confetti, the hero portrait, embers…) must opt out again — the victory
// confetti once covered the whole panel and swallowed every tap on "Next".
describe("overlay decorations never catch taps", () => {
  const css = readFileSync(new URL("../src/ui/style.css", import.meta.url), "utf8");
  const rule = css.match(/([^{}]*#ui \.overlay \.confetti[^{}]*)\{\s*pointer-events:\s*none;\s*\}/);
  it("has the opt-out rule", () => expect(rule).not.toBeNull());
  for (const cls of ["confetti", "end-hero", "title-embers", "perm-spent", "trophy-gain", "hall-ticks", "fly-coin"])
    it(`covers .${cls}`, () => expect(rule?.[1]).toContain(`#ui .overlay .${cls}`));
});
