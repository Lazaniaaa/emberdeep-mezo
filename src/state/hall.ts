import { create } from "zustand";
import type { HallBoard, RecordStep } from "@/chain/arc";
import { ATTEST_URL, hallConfig } from "@/chain/arc-config";
import { BOSS_DEPTH } from "@/game/config";
import { useRun } from "./run-store";
import type { RunReport } from "./store";
import { useWallet } from "./wallet";

/** `attesting`: the game's server is replaying the descent before it signs it. */
export type RecordStatus = RecordStep | "attesting" | "idle" | "done" | "error";

type HallState = {
  open: boolean;
  board: HallBoard | null;
  boardStatus: "idle" | "loading" | "ready" | "error";
  boardError: string | null;
  /** The report whose descent is being (or has been) written, so another report starts from a clean slate. */
  forReport: RunReport | null;
  status: RecordStatus;
  txHash: string | null;
  error: string | null;
  setOpen: (open: boolean) => void;
  refresh: () => Promise<void>;
  record: (report: RunReport) => Promise<void>;
};

let boardRequest = 0;

export const useHall = create<HallState>()((set, get) => ({
  open: false, board: null, boardStatus: "idle", boardError: null,
  forReport: null, status: "idle", txHash: null, error: null,

  setOpen: open => {
    set({ open });
    if (open && get().boardStatus !== "loading") void get().refresh();
  },

  refresh: async () => {
    const config = hallConfig();
    const { mezoHallAddress } = await import("@/chain/mezo-config");
    // A Mezo-only site shows the Hall on Mezo here.
    if (!config && !mezoHallAddress()) return;
    const request = ++boardRequest;
    set({ boardStatus: "loading", boardError: null });
    try {
      const board = config
        ? await (await import("@/chain/arc")).readHall(config)
        : await (await import("@/chain/mezo")).readMezoHall();
      if (request === boardRequest) set({ board, boardStatus: "ready" });
    } catch (e) {
      if (request === boardRequest) {
        set({ boardStatus: "error", boardError: e instanceof Error ? e.message.split("\n")[0] : "Could not read the Hall" });
      }
    }
  },

  record: async report => {
    const config = hallConfig();
    const { account } = useWallet.getState();
    if (!config || !account) return;
    const running = get();
    if (running.forReport === report && running.status !== "idle" && running.status !== "error") return;
    set({ forReport: report, status: "attesting", txHash: null, error: null });
    try {
      const descent = useRun.getState().lastDescent;
      if (!descent) throw new Error("The moves of this descent were not kept (it was played in another tab or before an update), so it cannot be signed.");
      const arc = await import("@/chain/arc");
      const attestation = await arc.requestAttestation(ATTEST_URL, { player: account, setup: descent.setup, moves: descent.moves });
      // The server replayed the moves itself. If it reached another result, the game and the server disagree about
      // the rules (most likely different versions), and the record would not be this descent.
      const d = attestation.descent;
      if (d.depth !== Math.min(BOSS_DEPTH, report.depth) || d.gold !== report.gold || d.home !== (report.outcome === "extracted")) {
        throw new Error("The server's replay does not match this descent (the game may have been updated). Nothing was recorded.");
      }
      const { injectedProvider } = await import("@/chain/wallet");
      const provider = injectedProvider();
      if (!provider) throw new Error("No browser wallet found. Install MetaMask, Rabby or another EVM wallet.");
      const hash = await arc.recordOnArc(provider, account, config, attestation, status => set({ status }));
      set({ status: "done", txHash: hash });
      void get().refresh();
    } catch (e) {
      const { explainArcError } = await import("@/chain/arc");
      set({ status: "error", error: explainArcError(e) });
    }
  },
}));
