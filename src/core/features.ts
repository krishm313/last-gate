/**
 * Feature switches. The side-stop mini-games are switched off for now (the owner, Nov 20: "the
 * current mini games are really trash — keep the battle siege and perfect that"). Saved progress for
 * them is kept untouched, so turning this back on restores everything.
 */
export const SIDE_GAMES_ENABLED = false;

/** Side-game ids (achievements / quests tied to them are hidden while they're off). */
export const SIDE_GAME_IDS = ["archery", "supply", "watch", "catapult", "dragon", "lanterns", "forge", "bells", "mason"];

/** Chapter 11 "The Storm Coast" — built in slices (see SUPERVISOR.md) and switched on when complete. */
export const CH11_ENABLED = false;
