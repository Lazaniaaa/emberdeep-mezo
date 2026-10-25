// The one signature a player gives so the game's server may send their descents to Mezo for them, paying the gas.
// It is a plain message (EIP-191), not a transaction: it moves nothing and costs nothing. It proves the wallet is the
// player's, so nobody can record descents under someone else's address and spend their pot keys. Plain values only.
import type { Hex } from "./hall-typed";

/** How long one login lasts. */
export const RELAY_LOGIN_SECONDS = 7 * 24 * 3600;

export const relayMessage = (player: string, until: number) =>
  `Emberdeep: let the game's server record my descents on Mezo Testnet and pay the gas.\nWallet: ${player.toLowerCase()}\nValid until: ${until}`;

export type RelayLogin = { player: Hex; until: number; signature: Hex };
