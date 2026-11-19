/** Catapult Toss balance: a bot that leads the lowest engine, aiming with an error of `err` px. `npx vite-node scripts/catsim.ts [runs] [err]` */
import { catStars, createCatapult, flightTime, lob, stepCatapult } from "../src/mini/catapult";
import { createRng, range } from "../src/core/rng";

const runs = Number(process.argv[2] ?? 10);
const err = Number(process.argv[3] ?? 0);
const out: string[] = [];
for (let r = 0; r < runs; r++) {
  const s = createCatapult(300 + r);
  const aim = createRng(77 + r);
  while (!s.over) {
    stepCatapult(s, 1 / 60);
    if (s.reload > 0) continue;
    // Target the engine closest to the wall that no stone is already heading for.
    const busy = s.stones.map((st) => [st.tx, st.ty]);
    const t = s.engines.filter((e) => e.dead < 0 && !busy.some(([x, y]) => Math.abs(x! - e.x) < 30 && Math.abs(y! - e.y) < 90)).sort((a, b) => b.y - a.y)[0];
    if (!t) continue;
    let ty = t.y;
    for (let k = 0; k < 3; k++) ty = t.y + t.vy * flightTime(t.x, ty);
    lob(s, t.x + range(aim, -err, err), ty + range(aim, -err, err));
  }
  out.push(`${s.score}${s.lost ? "✗" : ""}(${catStars(s.score)}★)`);
}
console.log(`err ${err}px: ${out.join(" ")}`);
