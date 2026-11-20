/** Bell Tower balance: a bot that remembers tunes up to `mem` notes (longer ones: it slips on note mem+1) and rings one bell per `tap` s. `npx vite-node scripts/bellsim.ts [runs] [mem] [tap]` */
import { BELLS, bellsStars, createBells, ring, stepBells } from "../src/mini/bells";

const runs = Number(process.argv[2] ?? 8);
const mem = Number(process.argv[3] ?? 8);
const tap = Number(process.argv[4] ?? 0.35);
const out: string[] = [];
for (let r = 0; r < runs; r++) {
  const s = createBells(400 + r);
  let cd = tap;
  let slips = 0;
  while (!s.over) {
    stepBells(s, 1 / 60);
    if (s.phase !== "play") { cd = tap; continue; }
    cd -= 1 / 60;
    if (cd > 0) continue;
    cd = tap;
    // Past its memory it gets one note wrong per try (but a retry of the same tune sometimes sticks).
    const forget = s.tune.length > mem && s.at === mem && (slips++ % 3 !== 2);
    ring(s, forget ? (s.tune[s.at]! + 1) % BELLS.n : s.tune[s.at]!);
  }
  out.push(`${s.score}${s.lost ? "✗" : ""}(${bellsStars(s.score)}★ len${s.tune.length - 1})`);
}
console.log(`mem ${mem} tap ${tap}: ${out.join(" ")} [stars ${BELLS.stars}]`);
