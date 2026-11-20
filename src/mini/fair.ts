/**
 * Fair day: each day one of the open mini-games pays double gold. Picked from the date (the same
 * all day, a different one tomorrow) among the side stops the player has opened.
 */
export const FAIR_ORDER = ["archery", "supply", "watch", "catapult", "dragon", "lanterns", "forge"] as const;
/** The Royal Forge joins the fair rotation from this date (earlier days keep their pick). */
const FORGE_FROM = "2026-11-21";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Today's fair game among the open ones (null if none is open yet). */
export function fairPick(date: string, open: readonly string[]): string | null {
  const list = FAIR_ORDER.filter((k) => open.includes(k) && (k !== "forge" || date >= FORGE_FROM));
  if (!list.length) return null;
  return list[hash(`fair:${date}`) % list.length]!;
}

/** The chapter that opens each side stop. */
export const FAIR_OPENS: Record<string, number> = { archery: 1, supply: 2, watch: 4, catapult: 6, dragon: 8, lanterns: 10, forge: 3 };

export function openMinis(stars: Record<number, number>): string[] {
  return FAIR_ORDER.filter((k) => (stars[FAIR_OPENS[k]!] ?? 0) > 0);
}
