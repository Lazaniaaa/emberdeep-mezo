// Runs the compiled EmberPotV3 in a real EVM (ethereumjs): keys, a signed run, the market fee through `fund`, and the
// weekly payout that shares both among the players.
import { beforeAll, describe, expect, it } from "vitest";
import { keccak256, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { RUN_RECORD_TYPES, potDomain, type RunRecord } from "../src/chain/pot-typed";
import { EVM_CHAIN_ID, createChain, type Compiled, type Deployed } from "./evm";
// @ts-expect-error -- a plain .mjs build script without type declarations
import { CONTRACTS, compileContract } from "../scripts/hall-compile.mjs";

const signer = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const PLAYER = "0x00000000000000000000000000000000000000b1" as Hex;
const BUYER = "0x00000000000000000000000000000000000000b2" as Hex;
const TREASURY = "0x00000000000000000000000000000000000000f7" as Hex;
const E18 = 10n ** 18n;
const WEEK = 7n * 24n * 3600n;

let chain: Awaited<ReturnType<typeof createChain>>;
let musd: Deployed, pot: Deployed, items: Deployed, market: Deployed;

const balance = async (who: Hex) => await musd.read("balanceOf", [who]) as bigint;

describe("EmberPotV3", () => {
  beforeAll(async () => {
    chain = await createChain();
    const mock = (name: string) => compileContract("contracts/test/RouterMocks.sol", name) as Compiled;
    const token = mock("MockToken");
    musd = await chain.deploy(token);
    pot = await chain.deploy(compileContract(CONTRACTS.EmberPotV3, "EmberPotV3") as Compiled,
      [{ type: "address" }, { type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
      [musd.address, TREASURY, signer.address, E18, 5000n, WEEK]);
    items = await chain.deploy(compileContract(CONTRACTS.EmberItems, "EmberItems") as Compiled,
      [{ type: "address" }, { type: "string" }], [signer.address, ""]);
    await items.send(chain.deployer, "setMinter", [chain.deployer, true]);
    const tigris = await chain.deploy(mock("MockTigris"));
    market = await chain.deploy(compileContract(CONTRACTS.EmberMarket, "EmberMarket") as Compiled,
      [...Array(6).fill({ type: "address" }), { type: "bool" }, { type: "uint256" }],
      [musd.address, musd.address, musd.address, tigris.address, chain.deployer, pot.address, true, 500n]);
    await market.send(chain.deployer, "setCollection", [items.address, true]);
    for (const who of [PLAYER, BUYER]) await musd.send(chain.deployer, "mint", [who, 100n * E18]);
  }, 120_000);

  it("sells keys as before: 80% into the round, 20% to the treasury", async () => {
    await musd.send(PLAYER, "approve", [pot.address, 2n * E18]);
    expect((await pot.send(PLAYER, "buyKeys", [2n])).ok).toBe(true);
    expect(await pot.read("roundPot", [0n])).toBe((16n * E18) / 10n);
    expect(await balance(TREASURY)).toBe((4n * E18) / 10n);
  });

  it("adds a market sale's fee to this round's pot, all of it", async () => {
    await items.send(chain.deployer, "mint", [PLAYER, 3, 2, 9n]);
    await items.send(PLAYER, "approve", [market.address, 1n]);
    await market.send(PLAYER, "list", [items.address, 1n, 20n * E18]);
    await musd.send(BUYER, "approve", [market.address, 20n * E18]);
    const r = await market.send(BUYER, "buy", [items.address, 1n, 20n * E18]);
    if (!r.ok) throw new Error(r.error);
    expect(await pot.read("roundPot", [0n])).toBe((26n * E18) / 10n); // 1.6 from keys + 1.0 fee
    expect(await balance(TREASURY)).toBe((4n * E18) / 10n);
  });

  it("refuses an empty fund", async () => {
    expect((await pot.send(BUYER, "fund", [0n])).ok).toBe(false);
  });

  it("pays the whole pot, fees included, to the round's players", async () => {
    const runId = keccak256(toHex("run-1"));
    const run: RunRecord = { player: PLAYER, runId, gold: 141n, roundId: 0n, deadline: chain.now() + 3600n };
    const signature = await signer.signTypedData({ domain: potDomain(EVM_CHAIN_ID, pot.address), types: RUN_RECORD_TYPES, primaryType: "RunRecord", message: run });
    const recorded = await pot.send(chain.deployer, "recordRun", [PLAYER, runId, 141n, run.deadline, signature]);
    if (!recorded.ok) throw new Error(recorded.error);

    const before = await balance(PLAYER);
    chain.warp(WEEK + 1n);
    expect((await pot.send(BUYER, "distribute", [0n, [PLAYER]])).ok).toBe(true);
    expect(await balance(PLAYER) - before).toBe((26n * E18) / 10n);
  });

  it("puts later fees into the new round", async () => {
    await musd.send(BUYER, "approve", [pot.address, E18]);
    expect((await pot.send(BUYER, "fund", [E18])).ok).toBe(true);
    expect(await pot.read("roundPot", [1n])).toBe(E18);
    expect(await pot.read("fundedIn", [1n])).toBe(E18);
  });
});
