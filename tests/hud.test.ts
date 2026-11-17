// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { CampHud } from "../src/camp/hud";
import { createCamp } from "../src/camp/sim";

const cb = { onToggleMute: () => false, onCallWave: () => {}, onPause: () => {}, onAbility: () => {}, onSpeed: () => 1 };

describe("camp HUD", () => {
  it("hall-hit flash clears itself and never fires on a new run's first frame", () => {
    vi.useFakeTimers();
    const root = document.createElement("div");
    const hud = new CampHud(root, cb);
    const pill = () => root.querySelector(".hall-pill")!;
    const c = createCamp(1);
    hud.setVisible(true);
    hud.update(c);
    expect(pill().classList.contains("hit")).toBe(false);
    c.hallHp -= 50;
    hud.update(c);
    expect(pill().classList.contains("hit")).toBe(true);
    vi.advanceTimersByTime(400);
    expect(pill().classList.contains("hit")).toBe(false); // can't keep overriding the danger pulse
    // Previous run ended with a bigger hall; a fresh run must not "flash" on frame one.
    c.hallHp = 1250;
    hud.update(c);
    hud.setVisible(false);
    const next = createCamp(2);
    hud.setVisible(true);
    hud.update(next);
    expect(pill().classList.contains("hit")).toBe(false);
    vi.useRealTimers();
  });

  it("repeated identical toasts don't stack", () => {
    const root = document.createElement("div");
    const hud = new CampHud(root, cb);
    hud.toast("hello");
    hud.toast("hello");
    expect(root.querySelectorAll(".toast").length).toBe(1);
  });
});
