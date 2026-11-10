import { isAddress, type Address } from "viem";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ATTEST_URL } from "@/chain/arc-config";
import { itemsAddress, marketAddress, type PayToken } from "@/chain/mezo-config";
import type { BuyStep } from "@/chain/mezo";
import type { MarketListing } from "@/chain/items";
import { isItem, toSetupItem, type OwnedItem } from "@/game/items";
import type { RunSetup, SetupItem } from "@/game/run";
import type { RunReport } from "./store";
import { useWallet } from "./wallet";

/** `login`: the one sign-in signature for relaying. `opening`: the server replays the descent and mints the item. */
export type ChestStatus = "idle" | "login" | "opening" | "done" | "empty" | "error";
type Chest = { status: ChestStatus; item: OwnedItem | null; hash: string | null; error: string | null };
const CLOSED: Chest = { status: "idle", item: null, hash: null, error: null };

/**
 * A Cerberus chest earned and not opened yet: a prize descent claimed into the Ember Pot by `player`. It keeps the
 * descent's setup and moves, which the server replays to open it, so it survives closing the tab or the next descent.
 */
export type PendingChest = { player: string; setup: RunSetup; moves: string[] };
const sameChest = (a: PendingChest, b: PendingChest) => a.player.toLowerCase() === b.player.toLowerCase() && a.setup.seed === b.setup.seed;

type ItemsState = {
  /** The wallet the items below were read for. */
  account: string | null;
  owned: OwnedItem[];
  loading: boolean;
  error: string | null;
  /** The found weapon the next practice descent carries, if the wallet still holds it. Kept between visits. */
  equipped: SetupItem | null;
  /** Chests earned and not opened yet, for any wallet. Kept between visits. */
  chests: PendingChest[];
  /** The seed of the descent whose chest is being opened (or was last), and how that is going. */
  chestFor: number | null;
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
  /** Keeps the chest of a prize descent that slew Cerberus, once it is claimed into the pot. */
  addChest: (chest: PendingChest) => void;
  openChest: (chest: PendingChest) => Promise<void>;
  setMarketOpen: (open: boolean) => void;
  refreshMarket: () => Promise<void>;
  list: (item: OwnedItem, price: bigint) => Promise<boolean>;
  cancel: (item: OwnedItem) => Promise<void>;
  buy: (listing: MarketListing, token: PayToken) => Promise<void>;
};

/** Whether found weapons are live in this build: the items contract is set. */
export const itemsLive = () => !!itemsAddress();
export const marketLive = () => !!itemsAddress() && !!marketAddress();

async function walletOrThrow() {
  const { account } = useWallet.getState();
  if (!account) throw new Error("Connect a wallet first.");
  const { injectedProvider } = await import("@/chain/wallet");
  const provider = injectedProvider();
  if (!provider) throw new Error("No browser wallet found. Install MetaMask, Rabby or another EVM wallet.");
  return { account: account as Address, provider };
}

/** Whether a report's descent earns the Cerberus chest: a prize descent, Cerberus slain and the delver home. */
export const earnedChest = (report: RunReport) => report.prize === true && report.bossSlain === true && report.outcome === "extracted";

/** The unopened chests of the connected wallet. */
export const chestsOf = (chests: readonly PendingChest[], account: string | null) =>
  account ? chests.filter(c => c.player.toLowerCase() === account.toLowerCase()) : [];

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
  chests: [], chestFor: null, chest: CLOSED,
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
      const { explainMezoError } = await import("@/chain/mezo");
      if (id === reading) set({ loading: false, error: explainMezoError(e) });
    }
  },

  equip: item => set({ equipped: item ? toSetupItem(item) : null }),

  addChest: chest => set(s => ({ chests: [...s.chests.filter(c => !sameChest(c, chest)), chest] })),

  openChest: async pending => {
    const busy = get().chest.status;
    if (get().chestFor === pending.setup.seed && (busy === "login" || busy === "opening")) return;
    set({ chestFor: pending.setup.seed, chest: { ...CLOSED, status: "opening" } });
    const chain = await import("@/chain/items");
    const mezo = await import("@/chain/mezo");
    const settled = () => set(s => ({ chests: s.chests.filter(c => !sameChest(c, pending)) }));
    try {
      const { account, provider } = await walletOrThrow();
      if (account.toLowerCase() !== pending.player.toLowerCase()) throw new Error(`This chest belongs to ${pending.player.slice(0, 6)}…${pending.player.slice(-4)}. Switch to that wallet to open it.`);
      const body = { player: account, setup: pending.setup, moves: pending.moves };
      let result = null;
      if (await mezo.relayerAddress(ATTEST_URL)) {
        if (!mezo.savedLogin(account)) set({ chest: { ...CLOSED, status: "login" } });
        const { until, login } = await mezo.relayLogin(provider, account);
        set({ chest: { ...CLOSED, status: "opening" } });
        result = await chain.openChestRelayed(ATTEST_URL, { ...body, until, login });
      }
      result ??= await chain.openChestFromWallet(ATTEST_URL, provider, account, body);
      settled();
      if (result.empty) { set({ chest: { ...CLOSED, status: "empty" } }); return; }
      const item = result.item;
      // Show the new weapon at once, so it can be carried before the chain read below comes back.
      set(s => ({
        chest: { status: "done", item, hash: result.hash, error: null },
        ...(item && s.account?.toLowerCase() === account.toLowerCase() && !s.owned.some(i => i.id === item.id) ? { owned: [...s.owned, item] } : {}),
      }));
      void get().refresh();
    } catch (e) {
      const error = mezo.explainMezoError(e);
      if (/opened already/.test(error)) settled();
      set({ chest: { ...CLOSED, status: "error", error } });
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
      const { explainMezoError } = await import("@/chain/mezo");
      if (id === readingMarket) set({ marketLoading: false, marketError: explainMezoError(e) });
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
  partialize: s => ({ equipped: s.equipped, chests: s.chests }),
  merge: (persisted, current) => {
    const p = persisted as { equipped?: SetupItem | null; chests?: unknown } | null;
    const e = p?.equipped;
    const valid = e && Number.isSafeInteger(e.id) && typeof e.seed === "string" && /^\d{1,20}$/.test(e.seed)
      && isItem({ kind: e.kind, rarity: e.rarity, seed: BigInt(e.seed) });
    // The server replays a chest's descent anyway; this only drops what could not be one.
    const chests = Array.isArray(p?.chests) ? p.chests.filter((c: Partial<PendingChest> | null): c is PendingChest =>
      !!c && typeof c.player === "string" && isAddress(c.player) && Array.isArray(c.moves) && c.moves.every(m => typeof m === "string")
      && !!c.setup && Number.isSafeInteger(c.setup.seed)) : [];
    return { ...current, equipped: valid ? e : null, chests };
  },
}));
