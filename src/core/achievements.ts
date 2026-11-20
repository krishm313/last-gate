import { ENEMIES } from "./enemies";
import { HEROES } from "./heroes";
import type { SaveData } from "./meta";

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  icon: string;
  goal: number;
  reward: number;
  /** Current progress from the save. */
  progress: (s: SaveData) => number;
}

const stat = (k: string) => (s: SaveData) => s.stats[k] ?? 0;
/** Heroes that have won a run (tracked per hero; older wins still in the history count too). */
/** Bestiary: foe kinds slain at least once (the four late bosses also count from their older kill stats). */
const BOSS_STATS: Record<string, string> = { frostwyrm: "frostwyrm", magma: "magma", drowned: "drowned", bloodlord: "bloodlord", hollowking: "hollowking" };
export function foeMet(s: SaveData, id: string): boolean {
  return (s.stats[`met_${id}`] ?? 0) > 0 || (BOSS_STATS[id] !== undefined && (s.stats[BOSS_STATS[id]!] ?? 0) > 0);
}
export function foesMet(s: SaveData): number {
  return (Object.keys(ENEMIES) as string[]).filter((id) => foeMet(s, id)).length;
}

export function heroesWon(s: SaveData): number {
  return HEROES.filter((h) => heroHasWon(s, h.id)).length;
}
export function heroHasWon(s: SaveData, hero: string): boolean {
  return (s.stats[`won_${hero}`] ?? 0) > 0 || s.history.some((r) => r.won && r.hero === hero);
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first-wave", name: "First Stand", desc: "Survive your first night", icon: "🛡️", goal: 1, reward: 30, progress: stat("wavesHeld") },
  { id: "veteran", name: "Veteran", desc: "Survive 100 nights in total", icon: "⚔️", goal: 100, reward: 250, progress: stat("wavesHeld") },
  { id: "builder", name: "Master Builder", desc: "Build 25 archer towers", icon: "🏹", goal: 25, reward: 150, progress: stat("towersBuilt") },
  { id: "lumberjack", name: "Lumberjack", desc: "Gather 300 logs", icon: "🪓", goal: 300, reward: 150, progress: stat("logs") },
  { id: "smith", name: "Blacksmith", desc: "Forge 50 bows", icon: "🔨", goal: 50, reward: 150, progress: stat("bows") },
  { id: "slayer", name: "Giant Slayer", desc: "Defeat 10 bosses", icon: "👑", goal: 10, reward: 200, progress: stat("bosses") },
  { id: "horde", name: "Horde Breaker", desc: "Defeat 2,000 enemies", icon: "💀", goal: 2000, reward: 250, progress: stat("kills") },
  { id: "perfect", name: "Flawless", desc: "Earn 3 stars on any chapter", icon: "⭐", goal: 1, reward: 100, progress: (s) => (Object.values(s.stars).some((v) => v >= 3) ? 1 : 0) },
  { id: "endless15", name: "Unbreakable", desc: "Reach night 15 in Endless Siege", icon: "♾️", goal: 15, reward: 300, progress: (s) => s.best[99] ?? 0 },
  { id: "champion", name: "Champion of the Realm", desc: "Clear chapter 5", icon: "🏆", goal: 1, reward: 500, progress: (s) => ((s.stars[5] ?? 0) > 0 ? 1 : 0) },
  { id: "frostpeak", name: "King of the Mountain", desc: "Clear chapter 6, Frostpeak Pass", icon: "🏔️", goal: 1, reward: 700, progress: (s) => ((s.stars[6] ?? 0) > 0 ? 1 : 0) },
  { id: "caldera", name: "Through the Fire", desc: "Clear chapter 7, Ashen Caldera", icon: "🌋", goal: 1, reward: 900, progress: (s) => ((s.stars[7] ?? 0) > 0 ? 1 : 0) },
  { id: "hardclear", name: "Hardened", desc: "Clear any chapter on Hard", icon: "💀", goal: 1, reward: 300, progress: (s) => (Object.values(s.diffCleared).some((v) => v >= 1) ? 1 : 0) },
  { id: "nightmare", name: "Stuff of Nightmares", desc: "Clear any chapter on Nightmare", icon: "☠️", goal: 1, reward: 600, progress: (s) => (Object.values(s.diffCleared).some((v) => v >= 2) ? 1 : 0) },
  { id: "elites", name: "Elite Hunter", desc: "Defeat 25 elite foes", icon: "🎖️", goal: 25, reward: 250, progress: stat("elites") },
  { id: "wyrm", name: "Wyrmslayer", desc: "Defeat the Frost Wyrm", icon: "🐉", goal: 1, reward: 300, progress: stat("frostwyrm") },
  { id: "tidebreaker", name: "Tidebreaker", desc: "Defeat the Drowned King", icon: "🔱", goal: 1, reward: 450, progress: stat("drowned") },
  { id: "titan", name: "Titanfall", desc: "Defeat the Magma Titan", icon: "🌋", goal: 1, reward: 400, progress: stat("magma") },
  { id: "warden", name: "Warden of the Woods", desc: "Snare 200 foes with the Warden", icon: "🕸️", goal: 200, reward: 300, progress: stat("snared") },
  { id: "cleric", name: "Light of the Gate", desc: "Heal 5,000 HP with the Cleric's Sanctuary", icon: "✨", goal: 5000, reward: 300, progress: stat("sanctified") },
  { id: "marshal", name: "Raise the Levy", desc: "Call 100 militia to arms with the Marshal", icon: "📯", goal: 100, reward: 300, progress: stat("levied") },
  { id: "lancer", name: "Unstoppable", desc: "Skewer 300 foes with the Lancer's lance", icon: "🔱", goal: 300, reward: 300, progress: stat("lanced") },
  { id: "firefighter", name: "Firefighter", desc: "Stamp out 25 fires", icon: "🧯", goal: 25, reward: 250, progress: stat("firesOut") },
  { id: "citadel", name: "Lord of the Tides", desc: "Clear chapter 8, Sunken Citadel", icon: "🌊", goal: 1, reward: 1100, progress: (s) => ((s.stars[8] ?? 0) > 0 ? 1 : 0) },
  { id: "moonbreaker", name: "Moonbreaker", desc: "Defeat the Blood Moon Warlord", icon: "🌕", goal: 1, reward: 500, progress: stat("bloodlord") },
  { id: "moors", name: "Lord of the Moors", desc: "Clear chapter 9, Bloodmoon Moors", icon: "🌄", goal: 1, reward: 1300, progress: (s) => ((s.stars[9] ?? 0) > 0 ? 1 : 0) },
  { id: "hollow", name: "Uncrowned", desc: "Defeat the Hollow King", icon: "💀", goal: 1, reward: 600, progress: stat("hollowking") },
  { id: "throne", name: "Lord of the Hollow Throne", desc: "Clear chapter 10, the Hollow Throne", icon: "🏰", goal: 1, reward: 1500, progress: (s) => ((s.stars[10] ?? 0) > 0 ? 1 : 0) },
  { id: "scholar", name: "Scholar of War", desc: "Slay every kind of foe (see the Bestiary)", icon: "📖", goal: Object.keys(ENEMIES).length, reward: 800, progress: foesMet },
  { id: "bossrush", name: "Kingslayer", desc: "Clear the Boss Rush", icon: "👑", goal: 1, reward: 800, progress: (s) => ((s.stars[98] ?? 0) > 0 ? 1 : 0) },
  { id: "siegelord", name: "Siege Lord", desc: "Take the hall in all three sieges", icon: "⚔️", goal: 3, reward: 500, progress: (s) => [1, 2, 3].filter((i) => (s.mini[`siege${i}`]?.stars ?? 0) > 0).length },
  { id: "frostcitadel", name: "Winter's Fall", desc: "Take the Frost Citadel (Siege 4)", icon: "🏔️", goal: 1, reward: 600, progress: (s) => ((s.mini.siege4?.stars ?? 0) > 0 ? 1 : 0) },
  { id: "hollowkeep", name: "Breaker of Thrones", desc: "Take the Hollow Keep (Siege 5)", icon: "🏴", goal: 1, reward: 800, progress: (s) => ((s.mini.siege5?.stars ?? 0) > 0 ? 1 : 0) },
  { id: "conqueror", name: "Conqueror", desc: "Earn all 9 Siege Lord stars", icon: "🏴", goal: 9, reward: 700, progress: (s) => [1, 2, 3].reduce((a, i) => a + (s.mini[`siege${i}`]?.stars ?? 0), 0) },
  { id: "marksman", name: "Marksman", desc: "Earn 3 stars at the Archery Range", icon: "🎯", goal: 3, reward: 250, progress: (s) => s.mini.archery?.stars ?? 0 },
  { id: "quartermaster", name: "Quartermaster", desc: "Earn 3 stars on the Supply Run", icon: "🛒", goal: 3, reward: 250, progress: (s) => s.mini.supply?.stars ?? 0 },
  { id: "sentinel", name: "Sentinel", desc: "Earn 3 stars on Wall Watch", icon: "🛡️", goal: 3, reward: 250, progress: (s) => s.mini.watch?.stars ?? 0 },
  { id: "engineer3", name: "Siegebreaker", desc: "Earn 3 stars at Catapult Toss", icon: "🪨", goal: 3, reward: 250, progress: (s) => s.mini.catapult?.stars ?? 0 },
  { id: "dragonheart", name: "Dragonheart", desc: "Earn 3 stars at Dragon Dodge", icon: "🐉", goal: 3, reward: 300, progress: (s) => s.mini.dragon?.stars ?? 0 },
  { id: "fairground", name: "Champion of the Fair", desc: "Earn all 15 mini-game stars", icon: "🎪", goal: 15, reward: 700, progress: (s) => ["archery", "supply", "watch", "catapult", "dragon"].reduce((a, k) => a + (s.mini[k]?.stars ?? 0), 0) },
  { id: "band", name: "Band of Heroes", desc: "Win a run with every hero", icon: "🤝", goal: HEROES.length, reward: 600, progress: heroesWon },
  { id: "untouchable", name: "Untouchable", desc: "Survive 10 nights without the wall or hall taking a hit", icon: "✨", goal: 10, reward: 200, progress: stat("flawlessWaves") },
  { id: "daily3", name: "Daily Grind", desc: "Clear 3 daily challenges", icon: "🏅", goal: 3, reward: 200, progress: stat("dailyWins") },
];

export function claimable(s: SaveData): Achievement[] {
  return ACHIEVEMENTS.filter((a) => !s.claimed.includes(a.id) && a.progress(s) >= a.goal);
}

export function claim(s: SaveData, id: string): number {
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a || s.claimed.includes(id) || a.progress(s) < a.goal) return 0;
  s.claimed.push(id);
  s.gold += a.reward;
  return a.reward;
}
