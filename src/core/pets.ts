/** Companion pets (C10): one follows the hero through every run, picked in the Heroes tab. Pure data. */
export type PetId = "none" | "hound" | "falcon";

export interface PetDef {
  id: PetId;
  name: string;
  icon: string;
  desc: string;
  /** Total stars needed to unlock. */
  stars: number;
}

export const PETS: PetDef[] = [
  { id: "none", name: "No pet", icon: "✖️", desc: "Ride alone.", stars: 0 },
  { id: "hound", name: "Hound", icon: "🐕", desc: "Bounds after coins you missed and flicks them to you.", stars: 4 },
  { id: "falcon", name: "Falcon", icon: "🦅", desc: "Circles overhead and dives at foes near you.", stars: 12 },
];
export const PET_BY_ID: Record<PetId, PetDef> = Object.fromEntries(PETS.map((p) => [p.id, p])) as Record<PetId, PetDef>;
/** Tuning: hound reach/speed, falcon dive interval/reach/damage (× the hero's shot). */
export const PET = { houndReach: 260, houndSpeed: 230, falconEvery: 3.4, falconReach: 280, falconDamage: 1.4, falconSpeed: 520 };
