/** Small seeded PRNG (mulberry32). All randomness in the simulation goes through this. */
export interface Rng {
  state: number;
}

export function createRng(seed: number): Rng {
  return { state: seed >>> 0 };
}

/** Float in [0, 1). */
export function next(rng: Rng): number {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function range(rng: Rng, min: number, max: number): number {
  return min + (max - min) * next(rng);
}

export function int(rng: Rng, min: number, maxInclusive: number): number {
  return Math.floor(range(rng, min, maxInclusive + 1));
}

export function chance(rng: Rng, p: number): boolean {
  return next(rng) < p;
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(next(rng) * items.length)]!;
}

/** Weighted pick; weights must be >= 0 and not all zero. */
export function weighted<T>(rng: Rng, items: readonly T[], weight: (t: T) => number): T {
  let total = 0;
  for (const it of items) total += weight(it);
  let r = next(rng) * total;
  for (const it of items) {
    r -= weight(it);
    if (r < 0) return it;
  }
  return items[items.length - 1]!;
}
