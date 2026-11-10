// The prize descent: the one loadout that may enter the Ember Pot, a real MUSD prize pool. The simulated economy (flasks,
// Delver perks, camp weapons, potions) lives in the player's browser and cannot be proven, so a pot run starts equal for
// everyone and only the play decides the gold. Level perks are part of the play and stay. The one exception is a found
// weapon: it is an NFT on Mezo, so the server checks the player holds it, and it replaces the dagger. The signing
// server refuses any other setup for the pot (server/attest.ts).
import { NO_PERKS, POTION_IDS, WEAPONS } from "./catalog";
import { itemStats } from "./items";
import { emptyBag, type RunSetup, type SetupItem } from "./run";

/** Lantern oil every prize descent starts with. */
export const PRIZE_FLASKS = 3;
export const PRIZE_WEAPON = WEAPONS.dagger;

const itemDamage = (item: SetupItem) => itemStats({ ...item, seed: BigInt(item.seed) }).damage;

export const prizeSetup = (seed: number, item?: SetupItem | null): RunSetup => ({
  seed, flasks: PRIZE_FLASKS, perks: { ...NO_PERKS }, weaponDamage: item ? itemDamage(item) : PRIZE_WEAPON.damage, bag: emptyBag(),
  ...(item ? { item } : {}),
});

/** Whether a (validated) setup is the prize loadout, with the dagger or a found weapon. The seed and the ticket chance do not matter. */
export function isPrizeSetup(setup: RunSetup): boolean {
  if (setup.flasks !== PRIZE_FLASKS || setup.weaponDamage !== (setup.item ? itemDamage(setup.item) : PRIZE_WEAPON.damage)) return false;
  if (POTION_IDS.some(id => (setup.bag[id] ?? 0) !== 0)) return false;
  return (Object.keys(NO_PERKS) as (keyof typeof NO_PERKS)[]).every(k => (setup.perks[k] ?? NO_PERKS[k]) === NO_PERKS[k]);
}
