// The prize descent: the one loadout that may enter the Ember Pot, a real MUSD prize pool. The simulated economy (flasks,
// Delver perks, camp weapons, potions) lives in the player's browser and cannot be proven, so a pot run starts equal for
// everyone and only the play decides the gold. Level perks are part of the play and stay. The one exception is a found
// weapon: it is an NFT on Mezo, so the server checks the player holds it, and it replaces the dagger. The signing
// server refuses any other setup for the pot (server/attest.ts).
import { NO_PERKS, POTION_IDS, WEAPONS } from "./catalog";
import { itemStats } from "./items";
import { emptyBag, type RunSetup, type SetupItem, type StartTicket } from "./run";

/** Lantern oil every prize descent starts with. */
export const PRIZE_FLASKS = 3;
export const PRIZE_WEAPON = WEAPONS.dagger;

const itemDamage = (item: SetupItem) => itemStats({ ...item, seed: BigInt(item.seed) }).damage;

export const prizeSetup = (seed: number, item?: SetupItem | null, start?: StartTicket): RunSetup => ({
  seed, flasks: PRIZE_FLASKS, perks: { ...NO_PERKS }, weaponDamage: item ? itemDamage(item) : PRIZE_WEAPON.damage, bag: emptyBag(),
  ...(item ? { item } : {}),
  ...(start ? { start } : {}),
});

/**
 * The game's server picks a prize descent's seed and signs this text with its key (server/attest.ts, /api/start), so
 * the map is not the browser's choice: a player gets a new seed only every START_REUSE_SECONDS or after a claim. The
 * weapon is part of it, fixed before the first move, and so is the pot the descent is claimed into.
 */
export const startMessage = (player: string, seed: number, itemId: number | null, issued: number, pot: string) =>
  `Emberdeep prize descent\nPlayer: ${player.toLowerCase()}\nPot: ${pot.toLowerCase()}\nSeed: ${seed}\nWeapon: ${itemId ?? "none"}\nIssued: ${issued}`;
/** A start is good for this long: the descent must be claimed within it. */
export const START_TTL_SECONDS = 6 * 3600;
/** Asking again within this long gives the same seed, unless a descent with it was claimed. */
export const START_REUSE_SECONDS = 2 * 3600;

/** Whether a (validated) setup is the prize loadout, with the dagger or a found weapon. The seed and the ticket chance do not matter. */
export function isPrizeSetup(setup: RunSetup): boolean {
  if (setup.flasks !== PRIZE_FLASKS || setup.weaponDamage !== (setup.item ? itemDamage(setup.item) : PRIZE_WEAPON.damage)) return false;
  if (POTION_IDS.some(id => (setup.bag[id] ?? 0) !== 0)) return false;
  return (Object.keys(NO_PERKS) as (keyof typeof NO_PERKS)[]).every(k => (setup.perks[k] ?? NO_PERKS[k]) === NO_PERKS[k]);
}
