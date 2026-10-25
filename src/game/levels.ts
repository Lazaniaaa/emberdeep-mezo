/**
 * The delver's level inside one descent. It starts at 1 every time, grows with experience from smashing things and
 * defeating creatures, and is lost with the descent. Each new level pours oil into the lantern and adds to every blow.
 * These baseline rewards remain alongside the deterministic perk choice at each new level.
 */

export const MAX_LEVEL = 15;

/** Light (oil) each new level pours into the lantern. */
export const LEVEL_LIGHT = 10;
/** Damage each new level adds to every blow. Blows are counted in HP_SCALE units: a dagger hits for 16. */
export const LEVEL_DAMAGE = 2;

/** Experience needed to go from `level` to the next one. 595 in all reaches level 15. */
export const xpToNext = (level: number) => 10 + 5 * (level - 1);

/** Damage a delver of this level adds to a blow. */
export const levelDamage = (level: number) => LEVEL_DAMAGE * (Math.min(MAX_LEVEL, Math.max(1, level)) - 1);

/** Experience a defeated creature gives, more the deeper it lived. */
export const killXp = (depth: number) => 2 + Math.floor(depth / 2);
/** Experience for opening a chest, a sealed vault and the Cerberus Hoard, and for slaying Cerberus. */
export const CHEST_XP = 5;
export const VAULT_XP = 10;
export const HOARD_XP = 30;
export const BOSS_XP = 40;
