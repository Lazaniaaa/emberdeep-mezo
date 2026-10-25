// The prize descent: the one loadout that may enter the Ember Pot, a real MUSD prize pool. The simulated economy (flasks,
// Delver perks, weapons, potions) lives in the player's browser and cannot be proven, so a pot run starts equal for
// everyone and only the play decides the gold. Level perks are part of the play and stay. The signing server refuses
// any other setup for the pot (server/attest.ts).
import { NO_PERKS, POTION_IDS, WEAPONS } from "./catalog";
import { emptyBag, type RunSetup } from "./run";

/** Lantern oil every prize descent starts with. */
export const PRIZE_FLASKS = 3;
export const PRIZE_WEAPON = WEAPONS.dagger;

export const prizeSetup = (seed: number): RunSetup => ({
  seed, flasks: PRIZE_FLASKS, perks: { ...NO_PERKS }, weaponDamage: PRIZE_WEAPON.damage, bag: emptyBag(),
});

/** Whether a (validated) setup is the prize loadout. The seed and the ticket chance do not matter. */
export function isPrizeSetup(setup: RunSetup): boolean {
  if (setup.flasks !== PRIZE_FLASKS || setup.weaponDamage !== PRIZE_WEAPON.damage) return false;
  if (POTION_IDS.some(id => (setup.bag[id] ?? 0) !== 0)) return false;
  return (Object.keys(NO_PERKS) as (keyof typeof NO_PERKS)[]).every(k => (setup.perks[k] ?? NO_PERKS[k]) === NO_PERKS[k]);
}
