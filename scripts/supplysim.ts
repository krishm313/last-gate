/** Supply Run balance: a dodging bot (perfect vs. sloppy). `npx vite-node scripts/supplysim.ts` */
import { createRun, ROAD, steer, stepRun } from "../src/mini/supply";

function play(seed: number, skill: number): [number, number, boolean] {
  const s = createRun(seed);
  let think = 0;
  while (!s.over) {
    think -= 1 / 60;
    if (think <= 0) {
      think = 0.25 / skill; // reaction time
      const ahead = s.things.filter((t) => !t.done && t.y > ROAD.wagonY - 260 && t.y < ROAD.wagonY - 20);
      const bad = (l: number) => ahead.some((t) => t.lane === l && (t.kind === "rock" || t.kind === "log" || t.kind === "goblin"));
      const good = (l: number) => ahead.some((t) => t.lane === l && (t.kind === "coins" || t.kind === "crate"));
      const options = [s.lane - 1, s.lane, s.lane + 1].filter((l) => l >= 0 && l <= 2 && !bad(l));
      let pick: number | undefined = options.find(good) ?? (options.includes(s.lane) ? s.lane : options[0]);
      // Boxed in: dash across to the free lane two over (a double swipe).
      if (pick === undefined) pick = [0, 1, 2].find((l) => !bad(l));
      if (pick !== undefined) while (pick !== s.lane) steer(s, pick > s.lane ? 1 : -1);
    }
    stepRun(s, 1 / 60);
  }
  return [s.score, s.hp, s.crashed];
}
for (const skill of [1, 0.6, 0.35]) {
  const res = Array.from({ length: 8 }, (_, i) => play(100 + i, skill));
  console.log(`skill ${skill}: scores ${res.map((r) => r[0]).join(",")} · crashed ${res.filter((r) => r[2]).length}/8`);
}
