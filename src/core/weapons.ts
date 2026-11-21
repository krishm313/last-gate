/** Hero weapons (C9): picked in the Heroes tab, they reshape every hero's auto-attack. Pure data. */
export type WeaponId = "own" | "crossbow" | "staff";

export interface WeaponDef {
  id: WeaponId;
  name: string;
  icon: string;
  desc: string;
  /** Total stars needed to unlock. */
  stars: number;
  /** Multipliers on the auto-attack's fire rate, damage per shot and reach. */
  rate: number;
  damage: number;
  range: number;
  /** Crossbow: the bolt punches through into the next foe behind (this share of the damage). */
  pierce?: number;
  /** Staff: the orb bursts, hitting other foes within `radius` for `share` of its damage. */
  splash?: { radius: number; share: number };
}

export const WEAPONS: WeaponDef[] = [
  { id: "own", name: "Signature", icon: "⚔️", desc: "Your hero's own attack: quick, one foe at a time.", stars: 0, rate: 1, damage: 1, range: 1 },
  { id: "crossbow", name: "Crossbow", icon: "🎯", desc: "Slow, heavy bolts that punch through into the foe behind.", stars: 8, rate: 0.5, damage: 2.05, range: 1.08, pierce: 0.6 },
  { id: "staff", name: "War Staff", icon: "🔮", desc: "Arcane orbs that burst on every foe close by.", stars: 16, rate: 0.62, damage: 1.25, range: 0.92, splash: { radius: 46, share: 0.5 } },
];
export const WEAPON_BY_ID: Record<WeaponId, WeaponDef> = Object.fromEntries(WEAPONS.map((w) => [w.id, w])) as Record<WeaponId, WeaponDef>;
