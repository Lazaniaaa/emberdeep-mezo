// The EIP-712 shape of a signed item drop (contracts/EmberItems.sol claimDrop). The signing server signs it after
// replaying the descent, and the game or the relayer submits it. Plain values only.
import type { Hex } from "./hall-typed";

export const ITEMS_DOMAIN = { name: "Emberdeep Items", version: "1" } as const;

export const DROP_TYPES = {
  Drop: [
    { name: "player", type: "address" },
    { name: "runId", type: "bytes32" },
    { name: "kind", type: "uint16" },
    { name: "rarity", type: "uint8" },
    { name: "seed", type: "uint64" },
    { name: "deadline", type: "uint64" },
  ],
} as const;

export type SignedDrop = { player: Hex; runId: Hex; kind: number; rarity: number; seed: bigint; deadline: bigint };

/** The same drop as JSON carries it: the 64-bit numbers as decimal strings. */
export type DropWire = Omit<SignedDrop, "seed" | "deadline"> & { seed: string; deadline: string };

export const dropToWire = (d: SignedDrop): DropWire => ({ ...d, seed: d.seed.toString(), deadline: d.deadline.toString() });
export const dropFromWire = (d: DropWire): SignedDrop => ({ ...d, seed: BigInt(d.seed), deadline: BigInt(d.deadline) });

export const itemsDomain = (chainId: number, verifyingContract: Hex) => ({ ...ITEMS_DOMAIN, chainId, verifyingContract });

/** What the signing server answers for a drop: the drop it replayed and its signature over it. */
export type DropAttestation = { drop: DropWire; signature: Hex };
