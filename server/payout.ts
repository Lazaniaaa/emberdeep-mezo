// Paying out the Ember Pot without anyone pressing a button. When a week ends, the server's relayer calls the pot's
// `distribute` for that round, paying the gas: every player gets their share of the MUSD by gold, straight to their
// wallet. The contract still lets anyone call `distribute`, so if this server is ever down nobody can hold the pot
// back; this only makes sure nobody has to.
import { parseAbi, type Abi, type Address, type PublicClient } from "viem";
import type { Relay } from "./attest";

const POT_ABI = parseAbi([
  "function roundPot(uint256) view returns (uint256)",
  "function totalGold(uint256) view returns (uint256)",
  "function totalDistributed(uint256) view returns (uint256)",
  "function zeroGoldRolledOver(uint256) view returns (bool)",
  "function swept(uint256) view returns (bool)",
  "function playerCount(uint256) view returns (uint256)",
  "function playersOf(uint256 roundId, uint256 start, uint256 count) view returns (address[])",
  "function goldOf(uint256, address) view returns (uint256)",
  "function paid(uint256, address) view returns (bool)",
  "function distribute(uint256 roundId, address[] players)",
]);

/** The contract pays at most this many players per call. */
export const PAYOUT_BATCH = 200;

export type RoundState = {
  round: number;
  pot: bigint;
  totalGold: bigint;
  rolledOver: boolean;
  swept: boolean;
  /** Players with gold who have not been paid and whose share is above zero (a zero share is skipped by the contract). */
  unpaid: Address[];
};

/**
 * The `distribute` calls that settle a round, as lists of players: none when there is nothing left to do; one empty
 * list when nobody banked gold (the contract then rolls the pot into the current round); otherwise batches of players.
 */
export function payoutCalls(s: RoundState): Address[][] {
  if (s.swept || s.pot === 0n) return [];
  if (s.totalGold === 0n) return s.rolledOver ? [] : [[]];
  const calls: Address[][] = [];
  for (let i = 0; i < s.unpaid.length; i += PAYOUT_BATCH) calls.push(s.unpaid.slice(i, i + PAYOUT_BATCH));
  return calls;
}

type Reader = Pick<PublicClient, "readContract">;

export async function readRound(reader: Reader, pot: Address, round: number): Promise<RoundState> {
  const r = BigInt(round);
  const read = <T>(functionName: string, args: readonly unknown[]) =>
    reader.readContract({ address: pot, abi: POT_ABI, functionName: functionName as never, args: args as never }) as Promise<T>;
  const [potAmount, totalGold, rolledOver, swept, count] = await Promise.all([
    read<bigint>("roundPot", [r]), read<bigint>("totalGold", [r]), read<boolean>("zeroGoldRolledOver", [r]),
    read<boolean>("swept", [r]), read<bigint>("playerCount", [r]),
  ]);
  const players: Address[] = [];
  for (let start = 0n; start < count; start += BigInt(PAYOUT_BATCH)) players.push(...await read<Address[]>("playersOf", [r, start, BigInt(PAYOUT_BATCH)]));
  const unpaid: Address[] = [];
  for (const player of players) {
    const [done, gold] = await Promise.all([read<boolean>("paid", [r, player]), read<bigint>("goldOf", [r, player])]);
    if (!done && gold > 0n && totalGold > 0n && (potAmount * gold) / totalGold > 0n) unpaid.push(player);
  }
  return { round, pot: potAmount, totalGold, rolledOver, swept, unpaid };
}

export type PotClock = { address: Address; launchTime: number; roundSeconds: number };

/** Settles every recently ended round that still has MUSD to pay. Returns how many payout transactions were sent. */
export async function payOutEndedRounds(reader: Reader, relay: Relay, pot: PotClock, nowSeconds: number, log: (line: string) => void): Promise<number> {
  const current = Math.floor((nowSeconds - pot.launchTime) / pot.roundSeconds);
  let sent = 0;
  // The last few rounds are enough: each one is settled within minutes of ending.
  for (let round = Math.max(0, current - 3); round < current; round++) {
    // The contract needs the round's end to be strictly past; a minute of margin covers clock drift.
    if (nowSeconds <= pot.launchTime + (round + 1) * pot.roundSeconds + 60) continue;
    const state = await readRound(reader, pot.address, round);
    for (const players of payoutCalls(state)) {
      try {
        const hash = await relay.send({ address: pot.address, abi: POT_ABI as Abi, functionName: "distribute", args: [BigInt(round), players] });
        sent++;
        log(players.length ? `paid out round ${round} to ${players.length} player${players.length === 1 ? "" : "s"} tx ${hash}` : `rolled empty round ${round} into the current one tx ${hash}`);
      } catch (e) {
        log(`payout of round ${round} failed: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
      }
    }
  }
  return sent;
}

/** Checks for ended rounds on start and then every `everyMs`. */
export function startAutoPayout(reader: Reader, relay: Relay, pot: PotClock, log: (line: string) => void, everyMs = 10 * 60_000) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await payOutEndedRounds(reader, relay, pot, Math.floor(Date.now() / 1000), log); }
    catch (e) { log(`payout check failed: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`); }
    finally { running = false; }
  };
  void tick();
  return setInterval(() => void tick(), everyMs);
}
