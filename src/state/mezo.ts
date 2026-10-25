import type { Address } from "viem";
import { create } from "zustand";
import type { RecordStep } from "@/chain/arc";
import { ATTEST_URL } from "@/chain/arc-config";
import { mezoHallAddress, type PayToken } from "@/chain/mezo-config";
import type { BuyStep, PotSnapshot } from "@/chain/mezo";
import { BOSS_DEPTH } from "@/game/config";
import { useRun } from "./run-store";
import type { RunReport } from "./store";
import { useWallet } from "./wallet";

/**
 * `attesting`: the game's server is replaying the descent before it signs it. `login`: the one sign-in signature for
 * relaying. `relaying`: the server is sending the record and paying the gas.
 */
export type MezoRecordStatus = RecordStep | "attesting" | "login" | "relaying" | "idle" | "done" | "error";
type Job = { status: MezoRecordStatus; txHash: string | null; error: string | null };
const IDLE: Job = { status: "idle", txHash: null, error: null };

type MezoState = {
  open: boolean;
  snapshot: PotSnapshot | null;
  loading: boolean;
  loadError: string | null;
  buying: { token: PayToken; step: BuyStep } | null;
  buyError: string | null;
  lastBuyTx: string | null;
  payout: Job;
  /** The report whose descent is being entered in the pot, and how that is going. */
  potFor: RunReport | null;
  pot: Job;
  /** The same for the Hall on Mezo. */
  hallFor: RunReport | null;
  hall: Job;
  setOpen: (open: boolean) => void;
  refresh: () => Promise<void>;
  buy: (token: PayToken, quantity: number) => Promise<void>;
  payOut: () => Promise<void>;
  recordPot: (report: RunReport) => Promise<void>;
  recordHall: (report: RunReport) => Promise<void>;
  /** The one Claim after a prize descent: into the Ember Pot, then onto the Hall on Mezo when it is deployed. */
  claim: (report: RunReport) => Promise<void>;
};

const message = (e: unknown) => e instanceof Error ? e.message.split("\n")[0] : String(e);

async function walletOrThrow() {
  const { account } = useWallet.getState();
  if (!account) throw new Error("Connect a wallet first.");
  const { injectedProvider } = await import("@/chain/wallet");
  const provider = injectedProvider();
  if (!provider) throw new Error("No browser wallet found. Install MetaMask, Rabby or another EVM wallet.");
  return { account: account as Address, provider };
}

/** The moves of the descent a report shows, checked against it, ready for the server. */
function descentFor(report: RunReport) {
  const descent = useRun.getState().lastDescent;
  if (!descent) throw new Error("The moves of this descent were not kept (it was played in another tab or before an update), so it cannot be signed.");
  return { descent, matches: (depth: number, gold: number, home: boolean) =>
    depth === Math.min(BOSS_DEPTH, report.depth) && gold === report.gold && home === (report.outcome === "extracted") };
}

let request = 0;

/**
 * Records through the game's relayer when it has one: at most one sign-in signature a week, no transaction, no gas.
 * Answers null when the server does not relay (or its relayer is out of gas), so the caller sends it from the wallet.
 */
async function viaRelay(target: "mezo" | "pot", report: RunReport, setJob: (job: Job) => void): Promise<string | null> {
  const mezo = await import("@/chain/mezo");
  if (!await mezo.relayerAddress(ATTEST_URL)) return null;
  const { account, provider } = await walletOrThrow();
  const { descent } = descentFor(report);
  if (!mezo.savedLogin(account)) setJob({ status: "login", txHash: null, error: null });
  const { until, login } = await mezo.relayLogin(provider, account);
  setJob({ status: "relaying", txHash: null, error: null });
  try {
    const result = await mezo.relayRecord(ATTEST_URL, { player: account, setup: descent.setup, moves: descent.moves, target, until, login });
    const gold = "run" in result ? Math.min(5000, report.gold) === Number(result.run.gold) : result.descent.gold === report.gold;
    if (!gold) throw new Error("The server's replay does not match this descent (the game may have been updated).");
    return result.hash;
  } catch (e) {
    if (e instanceof mezo.RelayUnavailable) return null;
    throw e;
  }
}

export const useMezo = create<MezoState>()((set, get) => ({
  open: false, snapshot: null, loading: false, loadError: null,
  buying: null, buyError: null, lastBuyTx: null, payout: IDLE,
  potFor: null, pot: IDLE, hallFor: null, hall: IDLE,

  setOpen: open => {
    set({ open });
    if (open) void get().refresh();
  },

  refresh: async () => {
    const id = ++request;
    set({ loading: true, loadError: null });
    try {
      const { readPot } = await import("@/chain/mezo");
      const snapshot = await readPot(useWallet.getState().account);
      if (id === request) set({ snapshot, loading: false });
    } catch (e) {
      if (id === request) set({ loading: false, loadError: message(e) });
    }
  },

  buy: async (token, quantity) => {
    if (get().buying) return;
    set({ buying: { token, step: "switching" }, buyError: null, lastBuyTx: null });
    const mezo = await import("@/chain/mezo");
    try {
      const { account, provider } = await walletOrThrow();
      const hash = await mezo.buyKeys(provider, account, token, quantity, step => set({ buying: { token, step } }));
      set({ buying: null, lastBuyTx: hash });
      void get().refresh();
    } catch (e) {
      set({ buying: null, buyError: mezo.explainMezoError(e) });
    }
  },

  payOut: async () => {
    const previous = get().snapshot?.previous;
    if (!previous || get().payout.status === "confirming") return;
    set({ payout: { status: "confirming", txHash: null, error: null } });
    const mezo = await import("@/chain/mezo");
    try {
      const { account, provider } = await walletOrThrow();
      const hash = await mezo.distribute(provider, account, previous.round, previous.unpaid);
      set({ payout: { status: "done", txHash: hash, error: null } });
      void get().refresh();
    } catch (e) {
      set({ payout: { status: "error", txHash: null, error: mezo.explainMezoError(e) } });
    }
  },

  recordPot: async report => {
    const busy = get().pot.status;
    if (get().potFor === report && busy !== "idle" && busy !== "error") return;
    set({ potFor: report, pot: { status: "attesting", txHash: null, error: null } });
    const mezo = await import("@/chain/mezo");
    try {
      const relayed = await viaRelay("pot", report, pot => set({ pot }));
      if (relayed) {
        set({ pot: { status: "done", txHash: relayed, error: null } });
        void get().refresh();
        return;
      }
      set({ pot: { status: "attesting", txHash: null, error: null } });
      const { account, provider } = await walletOrThrow();
      const { descent, matches } = descentFor(report);
      const attestation = await mezo.requestPotAttestation(ATTEST_URL, { player: account, setup: descent.setup, moves: descent.moves });
      if (Number(attestation.run.gold) !== Math.min(5000, report.gold) || !matches(Math.min(BOSS_DEPTH, report.depth), report.gold, true)) {
        throw new Error("The server's replay does not match this descent (the game may have been updated). Nothing was recorded.");
      }
      const hash = await mezo.recordInPot(provider, account, attestation, status => set({ pot: { status, txHash: null, error: null } }));
      set({ pot: { status: "done", txHash: hash, error: null } });
      void get().refresh();
    } catch (e) {
      set({ pot: { status: "error", txHash: null, error: mezo.explainMezoError(e) } });
    }
  },

  claim: async report => {
    await get().recordPot(report);
    // The pot is the claim; the Hall only adds the descent to the public wall, so its failure does not undo anything.
    if (get().potFor === report && get().pot.status === "done" && mezoHallAddress()) await get().recordHall(report);
  },

  recordHall: async report => {
    const busy = get().hall.status;
    if (get().hallFor === report && busy !== "idle" && busy !== "error") return;
    set({ hallFor: report, hall: { status: "attesting", txHash: null, error: null } });
    const mezo = await import("@/chain/mezo");
    try {
      const relayed = await viaRelay("mezo", report, hall => set({ hall }));
      if (relayed) {
        set({ hall: { status: "done", txHash: relayed, error: null } });
        return;
      }
      set({ hall: { status: "attesting", txHash: null, error: null } });
      const { account, provider } = await walletOrThrow();
      const { descent, matches } = descentFor(report);
      const attestation = await mezo.requestMezoHallAttestation(ATTEST_URL, { player: account, setup: descent.setup, moves: descent.moves });
      const d = attestation.descent;
      if (!matches(d.depth, d.gold, d.home)) {
        throw new Error("The server's replay does not match this descent (the game may have been updated). Nothing was recorded.");
      }
      const hash = await mezo.recordOnMezoHall(provider, account, attestation, status => set({ hall: { status, txHash: null, error: null } }));
      set({ hall: { status: "done", txHash: hash, error: null } });
    } catch (e) {
      set({ hall: { status: "error", txHash: null, error: mezo.explainMezoError(e) } });
    }
  },
}));
