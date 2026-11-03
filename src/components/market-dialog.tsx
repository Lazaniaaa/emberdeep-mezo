// The Market on Mezo: found weapons for sale in MUSD, paid with MUSD, or with BTC or MEZO swapped on Tigris in the same
// transaction. A share of every sale goes into this week's Ember Pot. Sellers list from their wallet and can take an
// unsold item back at any time.
import { useState } from "react";
import { Bitcoin, Coins, Flame, Loader2, RefreshCw, Store, Tag, Undo2, Wallet } from "lucide-react";
import { parseUnits, type Address } from "viem";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ACCENT, WINDOW_CLASS, windowStyle } from "@/lib/camp-style";
import type { PayToken } from "@/chain/mezo-config";
import type { MarketListing } from "@/chain/items";
import type { OwnedItem } from "@/game/items";
import { shortAddress, tokens } from "@/lib/format";
import { useItems } from "@/state/items";
import { useWallet } from "@/state/wallet";
import { Section, WindowHead } from "./camp-ui";
import { FoundWeaponRow } from "./found-weapon";

const STEP_LABEL = { switching: "Switching to Mezo…", approving: "Approve in your wallet…", buying: "Confirm in your wallet…", confirming: "Writing it to Mezo…", cancelling: "Taking it back…" } as const;
const PAY: { token: PayToken; icon: typeof Coins }[] = [
  { token: "MUSD", icon: Coins },
  { token: "BTC", icon: Bitcoin },
  { token: "MEZO", icon: Flame },
];

const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

export function MarketDialog() {
  const { marketOpen, setMarketOpen, listings, feeBps, marketLoading, marketError, refreshMarket, owned, busy } = useItems();
  const wallet = useWallet();
  const mine = listings.filter(l => same(l.seller, wallet.account));
  const forSale = listings.filter(l => !same(l.seller, wallet.account));

  return (
    <Dialog open={marketOpen} onOpenChange={setMarketOpen}>
      <DialogContent className={`${WINDOW_CLASS} sm:max-w-3xl`} style={windowStyle(ACCENT.market)}>
        <DialogTitle className="sr-only">Market on Mezo</DialogTitle>
        <DialogDescription className="sr-only">Buy and sell weapons found in the deep, in MUSD.</DialogDescription>
        <WindowHead icon={Store} title="Market" accent={ACCENT.market}
          badge={<span className="rounded-full border px-2 py-0.5 text-[10px] tracking-wider uppercase" style={{ color: ACCENT.market, borderColor: `${ACCENT.market}66` }}>Mezo Testnet</span>}
          subtitle={<>Weapons found in the deep, priced in MUSD. Pay with MUSD, or with BTC or MEZO swapped on Tigris in the same transaction. {feeBps > 0 && <>{feeBps / 100}% of every sale goes into this week's Ember Pot.</>}</>} />

        {marketError && <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{marketError}</p>}

        <Section title={`For sale${forSale.length ? ` · ${forSale.length}` : ""}`} icon={Tag} tone={ACCENT.market}
          action={<Button variant="ghost" size="icon-sm" aria-label="Refresh the market" onClick={() => void refreshMarket()} disabled={marketLoading}><RefreshCw className={marketLoading ? "animate-spin" : undefined} /></Button>}>
          {marketLoading && listings.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Reading the market on Mezo…</p>
          ) : forSale.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing for sale right now. Slay Cerberus, open its chest and be the first to list.</p>
          ) : forSale.map(l => <ForSale key={l.item.id} listing={l} />)}
        </Section>

        {!wallet.account ? (
          <Button variant="outline" onClick={() => void wallet.connect()} disabled={wallet.status === "connecting"}>
            <Wallet data-icon="inline-start" /> Connect a wallet to buy or sell
          </Button>
        ) : (
          <div className="space-y-3">
            <Section title="Sell a weapon" icon={Coins}>
              {owned.length === 0
                ? <p className="text-sm text-muted-foreground">You hold no found weapons.</p>
                : owned.map(item => <SellRow key={item.id} item={item} />)}
            </Section>
            <Section title="Your listings" icon={Undo2}>
              {mine.length === 0
                ? <p className="text-sm text-muted-foreground">Nothing listed.</p>
                : mine.map(l => (
                  <FoundWeaponRow key={l.item.id} item={l.item} note={`${tokens(l.price)} MUSD`}>
                    <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void useItems.getState().cancel(l.item)}>
                      {busy?.id === l.item.id ? <><Loader2 className="animate-spin" data-icon="inline-start" /> {STEP_LABEL[busy.step]}</> : "Take back"}
                    </Button>
                  </FoundWeaponRow>
                ))}
            </Section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ForSale({ listing }: { listing: MarketListing }) {
  const wallet = useWallet();
  const busy = useItems(s => s.busy);
  const working = busy?.id === listing.item.id;
  return (
    <FoundWeaponRow item={listing.item} note={<>Sold by {shortAddress(listing.seller as Address)}</>}>
      <div className="flex flex-col items-end gap-1.5">
        <span className="font-pixel text-sm" style={{ color: ACCENT.market }}>{tokens(listing.price)} MUSD</span>
        {working ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" /> {STEP_LABEL[busy.step]}</span>
        ) : (
          <div className="flex gap-1">
            {PAY.map(({ token, icon: Icon }) => (
              <Button key={token} size="sm" variant={token === "MUSD" ? "default" : "outline"} disabled={!wallet.account || !!busy}
                aria-label={`Buy with ${token}`} onClick={() => void useItems.getState().buy(listing, token)}>
                <Icon data-icon="inline-start" /> {token}
              </Button>
            ))}
          </div>
        )}
      </div>
    </FoundWeaponRow>
  );
}

function SellRow({ item }: { item: OwnedItem }) {
  const [price, setPrice] = useState("");
  const busy = useItems(s => s.busy);
  const working = busy?.id === item.id;
  const amount = /^\d+(\.\d{1,6})?$/.test(price.trim()) ? parseUnits(price.trim(), 18) : 0n;
  return (
    <FoundWeaponRow item={item}>
      <form className="flex items-center gap-1.5" onSubmit={e => { e.preventDefault(); if (amount > 0n) void useItems.getState().list(item, amount).then(ok => { if (ok) setPrice(""); }); }}>
        <input value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal" placeholder="MUSD" aria-label={`Price for #${item.id} in MUSD`}
          className="h-8 w-20 rounded-md border border-white/15 bg-black/40 px-2 text-sm outline-none focus:border-white/40" disabled={!!busy} />
        <Button size="sm" type="submit" disabled={amount === 0n || !!busy}>
          {working ? <><Loader2 className="animate-spin" data-icon="inline-start" /> {STEP_LABEL[busy.step]}</> : "List"}
        </Button>
      </form>
    </FoundWeaponRow>
  );
}
