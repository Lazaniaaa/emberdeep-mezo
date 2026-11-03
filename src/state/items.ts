import type { Address } from "viem";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ATTEST_URL } from "@/chain/arc-config";
import { itemsAddress, marketAddress, type PayToken } from "@/chain/mezo-config";
import type { BuyStep } from "@/chain/mezo";
import type { MarketListing } from "@/chain/items";
import { isItem, toSetupItem, type OwnedItem } from "@/game/items";
import type { SetupItem } from "@/game/run";
import { useRun } from "./run-store";
import type { RunReport } from "./store";
import { useWallet } from "./wallet";

/** `login`: the one sign-in signature for relaying. `opening`: the server replays the descent and mints the item. */
export type ChestStatus = "idle" | "login" | "opening" | "done" | "empty" | "error";
type Chest = { status: ChestStatus; item: OwnedItem | null; hash: string | null; error: string | null };
const CLOSED: Chest = { status: "idle", item: null, hash: null, error: null };

type ItemsState = {
  /** The wallet the items below were read for. */
  account: string | null;
  owned: OwnedItem[];
  loading: boolean;
  error: string | null;
  /** The found weapon the next practice descent carries, if the wallet still holds it. Kept between visits. */
  equipped: SetupItem | null;
  /** The report whose Cerberus chest is being opened, and how that is going. */
  chestFor: RunReport | null;
  chest: Chest;
  marketOpen: boolean;
  listings: MarketListing[];
  feeBps: number;
  marketLoading: boolean;
  marketError: string | null;
  /** A market action in progress: which item, and its step. */
  busy: { id: number; step: BuyStep | "cancelling" } | null;
  refresh: () => Promise<void>;
  equip: (item: OwnedItem | null) => void;
  openChest: (report: RunReport) => Promise<void>;
  setMarketOpen: (open: boolean) => void;
  refreshMarket: () => Promise<void>;
  list: (item: OwnedItem, price: bigint) => Promise<boolean>;
  cancel: (item: OwnedItem) => Promise<void>;
  buy: (listing: MarketListing, token: PayToken) => Promise<void>;
};

/** Whether found weapons are live in this build: the items contract is set. */
export const itemsLive = () => !!itemsAddress();
export const marketLive = () => !!itemsAddress() && !!marketAddress();

const message = (e: unknown) => e instanceof Error ? e.message.split("\n")[0] : String(e);

async function walletOrThrow() {
  const { account } = useWallet.getState();
  if (!account) throw new Error("Connect a wallet first.");
  const { injectedProvider } = await import("@/chain/wallet");
  const provider = injectedProvider();
  if (!provider) throw new Error("No browser wallet found. Install MetaMask, Rabby or another EVM wallet.");
  return { account: account as Address, provider };
}

/** Whether a report's descent earned the Cerberus chest: Cerberus slain and the delver home. */
export const earnedChest = (report: RunReport) => report.bossSlain === true && report.outcome === "extracted";

/** The equipped weapon, if the wallet the items were read for still holds that very item. */
export function carriedItem(): SetupItem | null {
  const { equipped, owned, account } = useItems.getState();
  const wallet = useWallet.getState().account;
  if (!equipped || !wallet || account?.toLowerCase() !== wallet.toLowerCase()) return null;
  return owned.some(i => i.id === equipped.id) ? equipped : null;
}

let reading = 0;
let readingMarket = 0;

export const useItems = create<ItemsState>()(persist((set, get) => ({
  account: null, owned: [], loading: false, error: null, equipped: null,
  chestFor: null, chest: CLOSED,
  marketOpen: false, listings: [], feeBps: 0, marketLoading: false, marketError: null, busy: null,

  refresh: async () => {
    const account = useWallet.getState().account;
    if (!itemsLive() || !account) { set({ owned: [], account: null }); return; }
    const id = ++reading;
    set({ loading: true, error: null });
    try {
      const { readOwnedItems } = await import("@/chain/items");
      const owned = await readOwnedItems(account as Address);
      if (id === reading) set({ owned, account, loading: false });
    } catch (e) {
      if (id === reading) set({ loading: false, error: message(e) });
    }
  },

  equip: item => set({ equipped: item ? toSetupItem(item) : null }),

  openChest: async report => {
    const busy = get().chest.status;
    if (get().chestFor === report && (busy === "login" || busy === "opening" || busy === "done" || busy === "empty")) return;
    set({ chestFor: report, chest: { ...CLOSED, status: "opening" } });
    const chain = await import("@/chain/items");
    const mezo = await import("@/chain/mezo");
    try {
      const descent = useRun.getState().lastDescent;
      if (!descent) throw new Error("The moves of this descent were not kept (it was played in another tab or before an update), so the chest cannot be opened.");
      const { account, provider } = await walletOrThrow();
      const body = { player: account, setup: descent.setup, moves: descent.moves };
      let result = null;
      if (await mezo.relayerAddress(ATTEST_URL)) {
        if (!mezo.savedLogin(account)) set({ chest: { ...CLOSED, status: "login" } });
        const { until, login } = await mezo.relayLogin(provider, account);
        set({ chest: { ...CLOSED, status: "opening" } });
        result = await chain.openChestRelayed(ATTEST_URL, { ...body, until, login });
      }
      result ??= await chain.openChestFromWallet(ATTEST_URL, provider, account, body);
      if (result.empty) { set({ chest: { ...CLOSED, status: "empty" } }); return; }
      set({ chest: { status: "done", item: result.item, hash: result.hash, error: null } });
      void get().refresh();
    } catch (e) {
      set({ chest: { ...CLOSED, status: "error", error: mezo.explainMezoError(e) } });
    }
  },

  setMarketOpen: open => {
    set({ marketOpen: open });
    if (open) { void get().refreshMarket(); void get().refresh(); }
  },

  refreshMarket: async () => {
    if (!marketLive()) return;
    const id = ++readingMarket;
    set({ marketLoading: true, marketError: null });
    try {
      const { readMarket } = await import("@/chain/items");
      const { listings, feeBps } = await readMarket();
      if (id === readingMarket) set({ listings, feeBps, marketLoading: false });
    } catch (e) {
      if (id === readingMarket) set({ marketLoading: false, marketError: message(e) });
    }
  },

  list: async (item, price) => {
    if (get().busy) return false;
    set({ busy: { id: item.id, step: "switching" }, marketError: null });
    const mezo = await import("@/chain/mezo");
    try {
      const { listItem } = await import("@/chain/items");
      const { account, provider } = await walletOrThrow();
      await listItem(provider, account, item.id, price, step => set({ busy: { id: item.id, step } }));
      if (get().equipped?.id === item.id) set({ equipped: null });
      set({ busy: null });
      void get().refresh(); void get().refreshMarket();
      return true;
    } catch (e) {
      set({ busy: null, marketError: mezo.explainMezoError(e) });
      return false;
    }
  },

  cancel: async item => {
    if (get().busy) return;
    set({ busy: { id: item.id, step: "cancelling" }, marketError: null });
    const mezo = await import("@/chain/mezo");
    try {
      const { cancelListing } = await import("@/chain/items");
      const { account, provider } = await walletOrThrow();
      await cancelListing(provider, account, item.id);
      set({ busy: null });
      void get().refresh(); void get().refreshMarket();
    } catch (e) {
      set({ busy: null, marketError: mezo.explainMezoError(e) });
    }
  },

  buy: async (listing, token) => {
    if (get().busy) return;
    set({ busy: { id: listing.item.id, step: "switching" }, marketError: null });
    const mezo = await import("@/chain/mezo");
    try {
      const { buyListing } = await import("@/chain/items");
      const { account, provider } = await walletOrThrow();
      await buyListing(provider, account, listing, token, step => set({ busy: { id: listing.item.id, step } }));
      set({ busy: null });
      void get().refresh(); void get().refreshMarket();
    } catch (e) {
      set({ busy: null, marketError: mezo.explainMezoError(e) });
    }
  },
}), {
  name: "emberdeep-items",
  version: 1,
  partialize: s => ({ equipped: s.equipped }),
  merge: (persisted, current) => {
    const e = (persisted as { equipped?: SetupItem | null } | null)?.equipped;
    const valid = e && Number.isSafeInteger(e.id) && typeof e.seed === "string" && /^\d{1,20}$/.test(e.seed)
      && isItem({ kind: e.kind, rarity: e.rarity, seed: BigInt(e.seed) });
    return { ...current, equipped: valid ? e : null };
  },
}));
