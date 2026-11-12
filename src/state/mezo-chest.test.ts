// A prize descent that slew Cerberus earns its chest the moment it is in the Ember Pot. The Claim keeps that chest for
// the Armory, also when the pot answers that the descent is in it already (the first answer was lost on the way).
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PotAttestation } from "@/chain/pot-typed";
import { prizeSetup } from "@/game/prize";
import type { RunReport } from "./store";

const chain = vi.hoisted(() => ({
  relayerAddress: vi.fn(async () => null),
  requestPotAttestation: vi.fn(),
  recordInPot: vi.fn(),
  readPot: vi.fn(async () => { throw new Error("not read in this test"); }),
}));
vi.mock("@/chain/mezo", async importOriginal => ({ ...await importOriginal<typeof import("@/chain/mezo")>(), ...chain }));
vi.mock("@/chain/wallet", async importOriginal => ({
  ...await importOriginal<typeof import("@/chain/wallet")>(),
  injectedProvider: () => ({ request: async () => null }),
}));

const { useMezo } = await import("./mezo");
const { useItems } = await import("./items");
const { useRun } = await import("./run-store");
const { useWallet } = await import("./wallet");

const PLAYER = "0x00000000000000000000000000000000000000b1";
const MOVES = ["R", "X"];
const report = (over: Partial<RunReport> = {}): RunReport => ({
  outcome: "extracted", depth: 7, gold: 900, crystals: 0, sigils: 0, payout: 0, spent: 0, revenue: 0, minted: [],
  tickets: 0, ticketsFound: 0, steps: 400, kills: 20, bossSlain: true, prize: true, ...over,
});
const signed: PotAttestation = {
  run: { player: PLAYER, runId: `0x${"12".repeat(32)}`, gold: "900", roundId: "0", deadline: "1" },
  signature: "0x00",
};

// The chain code (viem) loads on demand; load it once so the first test does not pay for it.
beforeAll(async () => {
  await import("@/chain/mezo");
}, 60_000);

beforeEach(() => {
  chain.requestPotAttestation.mockReset();
  chain.recordInPot.mockReset();
  useMezo.setState({ potFor: null, pot: { status: "idle", txHash: null, error: null } });
  useItems.setState({ chests: [] });
  useWallet.setState({ account: PLAYER, status: "ready" });
  useRun.setState({ lastDescent: { setup: prizeSetup(5), moves: MOVES } });
});

describe("the chest of a claimed prize descent", () => {
  it("is kept once the descent is in the pot", async () => {
    chain.requestPotAttestation.mockResolvedValue(signed);
    chain.recordInPot.mockResolvedValue(`0x${"cd".repeat(32)}`);
    await useMezo.getState().recordPot(report());
    expect(useMezo.getState().pot.status).toBe("done");
    expect(useItems.getState().chests).toEqual([{ player: PLAYER, setup: prizeSetup(5), moves: MOVES }]);
  });

  it("is kept when the pot says the descent is in it already", async () => {
    chain.requestPotAttestation.mockResolvedValue(signed);
    chain.recordInPot.mockRejectedValue(new Error('The contract function "recordRun" reverted with the following reason:\nRun already recorded'));
    await useMezo.getState().recordPot(report());
    expect(useMezo.getState().pot).toMatchObject({ status: "error", error: "This descent is in the Ember Pot already." });
    expect(useItems.getState().chests).toHaveLength(1);
  });

  it("is not kept when the Claim failed, or when Cerberus still stands", async () => {
    chain.requestPotAttestation.mockRejectedValue(new Error("You have no Ember Pot key on Mezo. Buy one, then record again."));
    await useMezo.getState().recordPot(report());
    expect(useItems.getState().chests).toEqual([]);

    chain.requestPotAttestation.mockResolvedValue(signed);
    chain.recordInPot.mockResolvedValue(`0x${"cd".repeat(32)}`);
    await useMezo.getState().recordPot(report({ bossSlain: false }));
    expect(useMezo.getState().pot.status).toBe("done");
    expect(useItems.getState().chests).toEqual([]);
  });
});
