// The EIP-712 shape of a descent recorded in the Ember Pot (EmberPotV2.recordRun). The signing server signs it and the
// game sends it; the contract recomputes the same digest with its current round. Plain values only.
import type { Hex } from "./hall-typed";

export const POT_DOMAIN = { name: "EmberPot", version: "1" } as const;

export const RUN_RECORD_TYPES = {
  RunRecord: [
    { name: "player", type: "address" },
    { name: "runId", type: "bytes32" },
    { name: "gold", type: "uint256" },
    { name: "roundId", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export type RunRecord = { player: Hex; runId: Hex; gold: bigint; roundId: bigint; deadline: bigint };

/** The same record as JSON carries it: the numbers as decimal strings. */
export type RunRecordWire = { player: Hex; runId: Hex; gold: string; roundId: string; deadline: string };

export const runToWire = (r: RunRecord): RunRecordWire => ({
  player: r.player, runId: r.runId, gold: r.gold.toString(), roundId: r.roundId.toString(), deadline: r.deadline.toString(),
});
export const runFromWire = (r: RunRecordWire): RunRecord => ({
  player: r.player, runId: r.runId, gold: BigInt(r.gold), roundId: BigInt(r.roundId), deadline: BigInt(r.deadline),
});

export const potDomain = (chainId: number, verifyingContract: Hex) => ({ ...POT_DOMAIN, chainId, verifyingContract });

/** What the signing server answers for the pot: the record it replayed and its signature over it. */
export type PotAttestation = { run: RunRecordWire; signature: Hex };
