/** Conquest board (phase 10 B2): long goals after chapter 10 — three milestones per War Banner. */
import { BANNERS, type BannerId } from "./banners";

export interface ConquestEntry {
  /** Won any campaign chapter flying this banner. */
  win: boolean;
  /** Won chapter 10 flying it. */
  ch10: boolean;
  /** Best Endless nights held flying it. */
  endless: number;
}
export type Conquest = Partial<Record<BannerId, ConquestEntry>>;

export const CONQUEST = { endlessGoal: 15, gold: { win: 300, ch10: 800, endless: 600 } };
export const CONQUEST_BANNERS = BANNERS.filter((b) => b.id !== "none");

export function conquestEntry(c: Conquest | undefined, id: BannerId): ConquestEntry {
  return c?.[id] ?? { win: false, ch10: false, endless: 0 };
}
/** Milestones done for one banner (0..3). */
export function conquestDone(e: ConquestEntry): number {
  return (e.win ? 1 : 0) + (e.ch10 ? 1 : 0) + (e.endless >= CONQUEST.endlessGoal ? 1 : 0);
}
export function conquestTotal(c: Conquest | undefined): number {
  return CONQUEST_BANNERS.reduce((a, b) => a + conquestDone(conquestEntry(c, b.id)), 0);
}

/** Record a finished run; returns the milestones it newly reached (each pays its gold). */
export function recordConquest(c: Conquest, banner: BannerId, run: { chapter: number; endless: boolean; won: boolean; nights: number }): { label: string; gold: number }[] {
  if (banner === "none") return [];
  const e = { ...conquestEntry(c, banner) };
  const got: { label: string; gold: number }[] = [];
  if (!run.endless && run.won && !e.win) { e.win = true; got.push({ label: "won a chapter", gold: CONQUEST.gold.win }); }
  if (!run.endless && run.won && run.chapter === 10 && !e.ch10) { e.ch10 = true; got.push({ label: "won chapter 10", gold: CONQUEST.gold.ch10 }); }
  if (run.endless) {
    const before = e.endless;
    e.endless = Math.max(e.endless, run.nights);
    if (before < CONQUEST.endlessGoal && e.endless >= CONQUEST.endlessGoal) got.push({ label: `held ${CONQUEST.endlessGoal} Endless nights`, gold: CONQUEST.gold.endless });
  }
  c[banner] = e;
  return got;
}

export function sanitizeConquest(raw: unknown): Conquest {
  const out: Conquest = {};
  if (!raw || typeof raw !== "object") return out;
  for (const b of CONQUEST_BANNERS) {
    const v = (raw as Record<string, unknown>)[b.id];
    if (!v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    const n = typeof r.endless === "number" && Number.isFinite(r.endless) ? Math.max(0, Math.min(9999, Math.floor(r.endless))) : 0;
    out[b.id] = { win: r.win === true, ch10: r.ch10 === true, endless: n };
  }
  return out;
}
