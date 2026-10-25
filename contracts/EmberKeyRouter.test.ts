// Runs the compiled EmberKeyRouter in a real EVM (ethereumjs) against a mock MUSD, BTC, MEZO, Tigris router and pot.
import { beforeAll, describe, expect, it } from "vitest";
import { createEVM, type EVM } from "@ethereumjs/evm";
import { createAddressFromString, hexToBytes } from "@ethereumjs/util";
import { decodeErrorResult, decodeFunctionResult, encodeAbiParameters, encodeFunctionData, toHex, type Abi, type Hex } from "viem";
// @ts-expect-error -- a plain .mjs build script without type declarations
import { CONTRACTS, compileContract } from "../scripts/hall-compile.mjs";

const PLAYER = "0x00000000000000000000000000000000000000b1" as Hex;
const DEPLOYER = "0x00000000000000000000000000000000000000a0" as Hex;
const E18 = 10n ** 18n;

type Compiled = { abi: Abi; bytecode: Hex };
let evm: EVM;
const block = { header: { number: 1n, coinbase: createAddressFromString(DEPLOYER), timestamp: 1_800_000_000n, difficulty: 0n, prevRandao: new Uint8Array(32), gasLimit: 30_000_000n, baseFeePerGas: 0n, getBlobGasPrice: () => 0n } };

async function deploy(c: Compiled, types: { type: string }[] = [], args: unknown[] = []) {
  const data = `${c.bytecode}${encodeAbiParameters(types, args).slice(2)}` as Hex;
  const r = await evm.runCall({ caller: createAddressFromString(DEPLOYER), data: hexToBytes(data), gasLimit: 10_000_000n, skipBalance: true, block: block as never });
  if (r.execResult.exceptionError) throw new Error(`deploy failed: ${r.execResult.exceptionError.error}`);
  const address = r.createdAddress!.toString() as Hex;
  const send = async (from: Hex, functionName: string, fnArgs: unknown[] = []) => {
    const res = await evm.runCall({
      caller: createAddressFromString(from), to: createAddressFromString(address), data: hexToBytes(encodeFunctionData({ abi: c.abi, functionName, args: fnArgs })),
      gasLimit: 2_000_000n, skipBalance: true, block: block as never,
    });
    const out = toHex(res.execResult.returnValue);
    if (res.execResult.exceptionError) {
      let error = "revert";
      try { error = decodeErrorResult({ abi: c.abi, data: out }).errorName; } catch { /* a plain revert */ }
      return { ok: false as const, error, out };
    }
    return { ok: true as const, out };
  };
  const read = async (functionName: string, fnArgs: unknown[] = []) => {
    const r = await send(DEPLOYER, functionName, fnArgs);
    if (!r.ok) throw new Error(r.error);
    return decodeFunctionResult({ abi: c.abi, functionName, data: r.out });
  };
  return { address, send, read };
}

let musd: Awaited<ReturnType<typeof deploy>>, btc: typeof musd, mezo: typeof musd, other: typeof musd, tigris: typeof musd, pot: typeof musd, router: typeof musd;
let routerAbi: Abi;

describe("EmberKeyRouter", () => {
  beforeAll(async () => {
    evm = await createEVM();
    const mock = (name: string) => compileContract("contracts/test/RouterMocks.sol", name) as Compiled;
    const token = mock("MockToken");
    [musd, btc, mezo, other] = [await deploy(token), await deploy(token), await deploy(token), await deploy(token)];
    tigris = await deploy(mock("MockTigris"));
    pot = await deploy(mock("MockPot"), [{ type: "address" }], [musd.address]);
    const compiled = compileContract(CONTRACTS.EmberKeyRouter, "EmberKeyRouter") as Compiled;
    routerAbi = compiled.abi;
    router = await deploy(compiled, Array(6).fill({ type: "address" }), [pot.address, musd.address, btc.address, mezo.address, tigris.address, DEPLOYER]);
    // 1 BTC buys 60,000 MUSD; 1 MEZO buys 0.9 MUSD.
    await tigris.send(DEPLOYER, "setRate", [btc.address, 60_000n * E18]);
    await tigris.send(DEPLOYER, "setRate", [mezo.address, (9n * E18) / 10n]);
    for (const t of [btc, mezo, other]) await t.send(DEPLOYER, "mint", [PLAYER, 1_000n * E18]);
  }, 120_000);

  it("has no owner or admin surface", () => {
    const writes = routerAbi.filter(i => i.type === "function" && i.stateMutability !== "view" && i.stateMutability !== "pure").map(i => (i as { name: string }).name);
    expect(writes).toEqual(["buyKeys"]);
  });

  it("buys keys with MEZO through its own pool and refunds the extra MUSD", async () => {
    const amountIn = (25n * E18) / 10n; // 2.5 MEZO -> 2.25 MUSD for 2 keys of 1 MUSD
    await mezo.send(PLAYER, "approve", [router.address, amountIn]);
    const r = await router.send(PLAYER, "buyKeys", [mezo.address, 2n, amountIn, 1_900_000_000n]);
    expect(r.ok).toBe(true);
    expect(await pot.read("keyBalance", [PLAYER])).toBe(2n);
    expect(await musd.read("balanceOf", [PLAYER])).toBe(E18 / 4n);
    expect(await musd.read("balanceOf", [router.address])).toBe(0n);
    expect(await mezo.read("balanceOf", [router.address])).toBe(0n);
    expect(await mezo.read("allowance", [router.address, tigris.address])).toBe(0n);
    expect(await musd.read("allowance", [router.address, pot.address])).toBe(0n);
    const route = await tigris.read("lastRoute") as readonly [Hex, Hex, boolean, Hex];
    expect(route[0].toLowerCase()).toBe(mezo.address.toLowerCase());
    expect(route[1].toLowerCase()).toBe(musd.address.toLowerCase());
    expect(route[2]).toBe(false);
  });

  it("buys keys with BTC", async () => {
    const amountIn = E18 / 50_000n; // 1.2 MUSD
    await btc.send(PLAYER, "approve", [router.address, amountIn]);
    expect((await router.send(PLAYER, "buyKeys", [btc.address, 1n, amountIn, 1_900_000_000n])).ok).toBe(true);
    expect(await pot.read("keyBalance", [PLAYER])).toBe(3n);
  });

  it("refuses any other token, zero amounts and a swap that cannot cover the keys", async () => {
    await other.send(PLAYER, "approve", [router.address, E18]);
    expect(await router.send(PLAYER, "buyKeys", [other.address, 1n, E18, 1_900_000_000n])).toMatchObject({ ok: false, error: "BadToken" });
    expect(await router.send(PLAYER, "buyKeys", [mezo.address, 0n, E18, 1_900_000_000n])).toMatchObject({ ok: false, error: "BadAmount" });
    expect(await router.send(PLAYER, "buyKeys", [mezo.address, 1n, 0n, 1_900_000_000n])).toMatchObject({ ok: false, error: "BadAmount" });
    await mezo.send(PLAYER, "approve", [router.address, E18]);
    expect((await router.send(PLAYER, "buyKeys", [mezo.address, 1n, E18, 1_900_000_000n])).ok).toBe(false); // 0.9 MUSD < 1
    expect(await pot.read("keyBalance", [PLAYER])).toBe(3n);
  });
});
