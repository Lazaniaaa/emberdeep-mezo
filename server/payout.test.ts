import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import { PAYOUT_BATCH, payOutEndedRounds, payoutCalls, type RoundState } from "./payout";
import type { Relay, RelayCall } from "./attest";

const A = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as Address;
const round = (over: Partial<RoundState> = {}): RoundState => ({ round: 0, pot: 10n, totalGold: 100n, rolledOver: false, swept: false, unpaid: [A(1), A(2)], ...over });

describe("automatic pot payouts", () => {
  it("pays unpaid players in batches the contract accepts", () => {
    expect(payoutCalls(round())).toEqual([[A(1), A(2)]]);
    const many = Array.from({ length: PAYOUT_BATCH + 5 }, (_, i) => A(i + 1));
    expect(payoutCalls(round({ unpaid: many })).map(c => c.length)).toEqual([PAYOUT_BATCH, 5]);
  });

  it("rolls an empty round's pot forward once, and leaves settled, swept or empty rounds alone", () => {
    expect(payoutCalls(round({ totalGold: 0n, unpaid: [] }))).toEqual([[]]);
    expect(payoutCalls(round({ totalGold: 0n, rolledOver: true, unpaid: [] }))).toEqual([]);
    expect(payoutCalls(round({ unpaid: [] }))).toEqual([]);
    expect(payoutCalls(round({ swept: true }))).toEqual([]);
    expect(payoutCalls(round({ pot: 0n }))).toEqual([]);
  });

  it("only touches rounds that have ended, and keeps going when one payout fails", async () => {
    const week = 604_800, launch = 1_000_000;
    const gold: Record<string, bigint> = { [A(1)]: 30n, [A(2)]: 70n };
    const reader = {
      readContract: async ({ functionName, args }: { functionName: string; args: readonly unknown[] }) => {
        const r = Number(args[0]);
        switch (functionName) {
          case "roundPot": return r === 1 ? 0n : 8n;
          case "totalGold": return 100n;
          case "zeroGoldRolledOver": case "swept": case "paid": return false;
          case "playerCount": return 2n;
          case "playersOf": return [A(1), A(2)];
          case "goldOf": return gold[args[1] as string];
          default: throw new Error(functionName);
        }
      },
    };
    const sent: RelayCall[] = [];
    let failOnce = true;
    const relay: Relay = { address: A(9), send: async call => { if (failOnce) { failOnce = false; throw new Error("rpc down"); } sent.push(call); return "0x01"; } };
    const lines: string[] = [];
    // Now: round 3 is running; rounds 0..2 have ended, round 1 has an empty pot.
    const now = launch + 3 * week + 100;
    expect(await payOutEndedRounds(reader as never, relay, { address: A(7), launchTime: launch, roundSeconds: week }, now, l => lines.push(l))).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ functionName: "distribute", args: [2n, [A(1), A(2)]] });
    expect(lines.some(l => /round 0 failed/.test(l))).toBe(true);
    // Just after a round ends nothing is sent yet: the contract needs its end to be past.
    sent.length = 0;
    expect(await payOutEndedRounds(reader as never, relay, { address: A(7), launchTime: launch, roundSeconds: week }, launch + week + 30, () => {})).toBe(0);
  });
});
