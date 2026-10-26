// What the camp's economy is made of. The Mezo release (VITE_ARC=off, see .env.production) has no pretend money at
// all: real money lives only in the Ember Pot on Mezo, and the camp runs on crystals found in the deep. Keys are free
// (practice descents), oil is free, and the shop, the altar, expeditions and passes cost crystals. Other builds keep
// the original simulated-USDC economy. A mutable object, so tests can switch it.
export const campMode = { crystals: import.meta.env.VITE_ARC === "off" };

/** One crystal stands for ten cents of the old simulated prices. */
export const CENTS_PER_CRYSTAL = 10;

/** A simulated-USDC price (in cents) as crystals. */
export const crystalsFor = (cents: number) => Math.ceil(cents / CENTS_PER_CRYSTAL);

/** Free practice keys a player is topped up to. */
export const PRACTICE_KEYS = 100;
