/** War Banners (phase 10 B1): one picked before a run (chapter sheet) — a real strategic fork with an
 *  upside and a cost, so runs stop playing out the same way. Pure data; applied in camp/meta.ts. */
export type BannerId = "none" | "bastion" | "hunter" | "hoard" | "engineers" | "levy" | "pyre" | "bolts";

export interface BannerDef {
  id: BannerId;
  name: string;
  icon: string;
  up: string;
  down: string;
  /** Total stars needed to unlock. */
  stars: number;
}

export const BANNERS: BannerDef[] = [
  { id: "none", name: "No banner", icon: "🏳️", up: "The classic siege.", down: "", stars: 0 },
  { id: "bastion", name: "Iron Bastion", icon: "🏰", up: "Walls ×1.3 HP, mend 10% at dawn", down: "Archer Towers cost 45% more", stars: 3 },
  { id: "hunter", name: "Hunter's Pact", icon: "🗡️", up: "Hero +60% damage, foes drop double coins", down: "The hall sends half the income", stars: 3 },
  { id: "hoard", name: "Golden Hoard", icon: "💰", up: "+60 coins at the start, income +30%", down: "Foes +15% HP", stars: 6 },
  { id: "engineers", name: "Siege Engineers", icon: "⚙️", up: "Catapults & Mage Tower open now, −35% cost", down: "Archer Towers stop at Lv 4", stars: 9 },
  { id: "levy", name: "The Levy", icon: "🛡️", up: "Barracks open now, soldiers +90% HP & damage", down: "Hero −20% damage", stars: 12 },
  { id: "pyre", name: "Pyre Lords", icon: "🔥", up: "Every arrow sets foes burning", down: "Towers −10% direct damage", stars: 15 },
  { id: "bolts", name: "Bolt Masters", icon: "🎯", up: "Ballista opens now, −40% cost, bolts +50% damage", down: "The King shoots 25% slower", stars: 18 },
];
export const BANNER_BY_ID: Record<BannerId, BannerDef> = Object.fromEntries(BANNERS.map((b) => [b.id, b])) as Record<BannerId, BannerDef>;
