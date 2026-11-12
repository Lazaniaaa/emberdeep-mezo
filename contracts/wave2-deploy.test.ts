// Deploys the Wave 2 set the way deploy-mezo.html does, with the same constructor arguments, in a real EVM (ethereumjs)
// with mock MUSD, BTC, MEZO and Tigris: the pot, its key router, the items and the market. Then one sale checks the
// wiring end to end: the market's fee lands in the pot's current round and is counted in fundedIn.
import { beforeAll, describe, expect, it } from "vitest";
import type { AbiParameter, Address, Hex } from "viem";
import { createChain, type Compiled, type Deployed } from "./evm";
import { KEY_PRICE, MARKET_FEE_BPS, itemsArgs, marketArgs, potArgs, routerArgs } from "../src/tools/mezo-deploy-args";
// @ts-expect-error -- a plain .mjs build script without type declarations
import { CONTRACTS, compileContract } from "../scripts/hall-compile.mjs";

const SIGNER = "0x00000000000000000000000000000000000000e5" as Address;
const SELLER = "0x00000000000000000000000000000000000000b1" as Hex;
const BUYER = "0x00000000000000000000000000000000000000b2" as Hex;
const E18 = 10n ** 18n;

let chain: Awaited<ReturnType<typeof createChain>>;
let musd: Deployed, pot: Deployed, router: Deployed, items: Deployed, market: Deployed;

/** Deploys with the constructor types read from the contract's own ABI. */
const deploy = (c: Compiled, args: readonly unknown[]) =>
  chain.deploy(c, (c.abi.find(x => x.type === "constructor") as { inputs: readonly AbiParameter[] }).inputs as AbiParameter[], args as unknown[]);

describe("the Wave 2 deployment", () => {
  beforeAll(async () => {
    chain = await createChain();
    const mock = (name: string) => compileContract("contracts/test/RouterMocks.sol", name) as Compiled;
    const token = mock("MockToken");
    const [m, btc, mezo] = [await chain.deploy(token), await chain.deploy(token), await chain.deploy(token)];
    musd = m;
    const tigris = await chain.deploy(mock("MockTigris"));
    const tokens = { MUSD: musd.address as Address, BTC: btc.address as Address, MEZO: mezo.address as Address };
    const dex = { router: tigris.address as Address, factory: chain.deployer as Address };

    pot = await deploy(compileContract(CONTRACTS.EmberPotV3, "EmberPotV3") as Compiled, potArgs(tokens, chain.deployer as Address, SIGNER, 5000, 604800));
    router = await deploy(compileContract(CONTRACTS.EmberKeyRouter, "EmberKeyRouter") as Compiled, routerArgs(pot.address as Address, tokens, dex));
    items = await deploy(compileContract(CONTRACTS.EmberItems, "EmberItems") as Compiled, itemsArgs(SIGNER, ""));
    market = await deploy(compileContract(CONTRACTS.EmberMarket, "EmberMarket") as Compiled, marketArgs(pot.address as Address, tokens, dex));
    const opened = await market.send(chain.deployer, "setCollection", [items.address, true]);
    if (!opened.ok) throw new Error(opened.error);
  }, 120_000);

  it("ties the router and the market to the new pot, and the items to the server's signer", async () => {
    expect(String(await router.read("pot")).toLowerCase()).toBe(pot.address.toLowerCase());
    expect(String(await market.read("feeSink")).toLowerCase()).toBe(pot.address.toLowerCase());
    expect(await market.read("feeBps")).toBe(MARKET_FEE_BPS);
    expect(String(await items.read("signer")).toLowerCase()).toBe(SIGNER);
    expect(await pot.read("keyPrice")).toBe(KEY_PRICE);
  });

  it("puts the fee of a sale into the pot's current round", async () => {
    await items.send(chain.deployer, "setMinter", [chain.deployer, true]);
    await items.send(chain.deployer, "mint", [SELLER, 3, 3, 7n]);
    await items.send(SELLER, "approve", [market.address, 1n]);
    expect((await market.send(SELLER, "list", [items.address, 1n, 20n * E18])).ok).toBe(true);
    await musd.send(chain.deployer, "mint", [BUYER, 100n * E18]);
    await musd.send(BUYER, "approve", [market.address, 20n * E18]);
    const bought = await market.send(BUYER, "buy", [items.address, 1n, 20n * E18]);
    if (!bought.ok) throw new Error(bought.error);
    const fee = (20n * E18 * MARKET_FEE_BPS) / 10_000n;
    expect(await pot.read("fundedIn", [0n])).toBe(fee);
    expect(await pot.read("roundPot", [0n])).toBe(fee);
  });
});
