// An in-memory EVM (ethereumjs) that holds several compiled contracts, for tests where contracts call each other.
import { createEVM, type EVM } from "@ethereumjs/evm";
import { createAddressFromString, hexToBytes } from "@ethereumjs/util";
import {
  decodeErrorResult, decodeEventLog, decodeFunctionResult, encodeAbiParameters, encodeFunctionData, toHex, type Abi, type Hex,
} from "viem";

export type Compiled = { abi: Abi; bytecode: Hex };
export type Sent =
  | { ok: true; out: Hex; logs: { eventName: string; args: Record<string, unknown> }[]; gas: bigint }
  | { ok: false; error: string; out: Hex };

/** The chain id the ethereumjs EVM reports by default. A signature's EIP-712 domain must use it. */
export const EVM_CHAIN_ID = 1;
export const EVM_NOW = 1_800_000_000n;
const DEPLOYER = "0x00000000000000000000000000000000000000a0" as Hex;

export async function createChain() {
  const evm: EVM = await createEVM();
  let now = EVM_NOW;
  const block = () => ({
    header: {
      number: 1n, coinbase: createAddressFromString(DEPLOYER), timestamp: now, difficulty: 0n, prevRandao: new Uint8Array(32),
      gasLimit: 30_000_000n, baseFeePerGas: 0n, getBlobGasPrice: () => 0n,
    },
  });

  /** Deploys `c` from `from` (the deployer by default) and returns helpers bound to its address. */
  async function deploy(c: Compiled, types: { type: string }[] = [], args: unknown[] = [], from: Hex = DEPLOYER) {
    const data = `${c.bytecode}${encodeAbiParameters(types, args).slice(2)}` as Hex;
    const r = await evm.runCall({
      caller: createAddressFromString(from), data: hexToBytes(data), gasLimit: 15_000_000n, skipBalance: true, block: block() as never,
    });
    if (r.execResult.exceptionError) throw new Error(`deploy failed: ${r.execResult.exceptionError.error}`);
    const address = r.createdAddress!.toString() as Hex;

    const send = async (sender: Hex, functionName: string, fnArgs: unknown[] = [], value = 0n): Promise<Sent> => {
      const res = await evm.runCall({
        caller: createAddressFromString(sender), to: createAddressFromString(address), value,
        data: hexToBytes(encodeFunctionData({ abi: c.abi, functionName, args: fnArgs })), gasLimit: 3_000_000n,
        skipBalance: true, block: block() as never,
      });
      const out = toHex(res.execResult.returnValue);
      if (res.execResult.exceptionError) {
        let error = "revert";
        try { error = decodeErrorResult({ abi: c.abi, data: out }).errorName; } catch { /* another contract's error, or a plain revert */ }
        return { ok: false, error, out };
      }
      const logs = (res.execResult.logs ?? []).flatMap(([, topics, logData]) => {
        try {
          return [decodeEventLog({ abi: c.abi, topics: topics.map(t => toHex(t)) as [Hex, ...Hex[]], data: toHex(logData) }) as unknown as { eventName: string; args: Record<string, unknown> }];
        } catch { return []; } // an event of another contract
      });
      return { ok: true, out, logs, gas: res.execResult.executionGasUsed };
    };

    const read = async (functionName: string, fnArgs: unknown[] = []) => {
      const r = await send(DEPLOYER, functionName, fnArgs);
      if (!r.ok) throw new Error(r.error);
      return decodeFunctionResult({ abi: c.abi, functionName, data: r.out });
    };

    return { address, abi: c.abi, send, read };
  }

  return {
    deploy,
    deployer: DEPLOYER,
    now: () => now,
    /** Moves the clock forward for the following calls. */
    warp: (seconds: bigint) => { now += seconds; },
  };
}

export type Deployed = Awaited<ReturnType<Awaited<ReturnType<typeof createChain>>["deploy"]>>;
