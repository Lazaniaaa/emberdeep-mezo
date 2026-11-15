import { useState } from "react";
import { Bitcoin, Coins, ExternalLink, Flame, KeyRound, Loader2, Minus, Plus, RefreshCw, Trophy, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ACCENT, WINDOW_CLASS, windowStyle } from "@/lib/camp-style";
import { BorrowMusd } from "./borrow-musd";
import { Section, Tile, WindowHead } from "./camp-ui";
import { BTC_ROUTER, MEZO_POTS, MEZO_QUICK_POTS, WEEKLY_POT, itemsAddress, keyRouterAddress, marketAddress, mezoAddressUrl, mezoTxUrl, type PayToken } from "@/chain/mezo-config";
import { PRIZE_FLASKS, PRIZE_WEAPON, prizeSetup } from "@/game/prize";
import { ATTEST_URL } from "@/chain/arc-config";
import type { Address } from "viem";
import { shortAddress, tokens } from "@/lib/format";
import { itemName, itemStats } from "@/game/items";
import { carriedItem, itemsLive, marketLive, useItems } from "@/state/items";
import { useMezo } from "@/state/mezo";
import { foreignRunActive } from "@/state/run-lock";
import { useRun } from "@/state/run-store";
import { useWallet } from "@/state/wallet";

function timeLeft(endsAt: number) {
  const s = Math.max(0, endsAt - Math.floor(Date.now() / 1000));
  const d = Math.floor(s / 86_400), h = Math.floor((s % 86_400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
}

const BUY_LABEL = { switching: "Switching to Mezo…", approving: "Approve in your wallet…", buying: "Confirm the purchase…", confirming: "Writing it to Mezo…" } as const;
const PAY: { token: PayToken; label: string; icon: typeof Coins }[] = [
  { token: "MUSD", label: "MUSD", icon: Coins },
  { token: "BTC", label: "BTC", icon: Bitcoin },
  { token: "MEZO", label: "MEZO", icon: Flame },
];

/** The Ember Pot on Mezo: this week's real MUSD pool, the player's keys, buying keys and starting a prize descent. */
export function EmberPotDialog() {
  const { open, setOpen, snapshot, loading, loadError, refresh, buy, buying, buyError, lastBuyTx, payOut, payout, potInfo, setPot } = useMezo();
  // A quick test pot runs in minutes and takes MUSD only (the key router serves the weekly pot).
  const quick = potInfo.address !== WEEKLY_POT.address;
  const wallet = useWallet();
  const [quantity, setQuantity] = useState(1);
  const router = keyRouterAddress();
  const me = snapshot?.me ?? null;
  const marketFunding = snapshot?.marketFunding ?? 0n;
  const found = useItems(s => s.equipped && carriedItem());

  // The way to pay this wallet can afford, lit as the main button: MUSD when it holds enough, else BTC, else MEZO.
  // (BTC and MEZO are swapped on Tigris, so holding some is a fair sign; the swap itself says if it falls short.)
  const suggested: PayToken | null = !me || !snapshot ? "MUSD"
    : me.balances.MUSD >= snapshot.keyPrice * BigInt(quantity) ? "MUSD"
    : quick ? null
    : me.balances.BTC > 10n ** 14n ? "BTC"
    : me.balances.MEZO > 0n && router ? "MEZO" : null;
  const [starting, setStarting] = useState(false);
  const startPrize = async () => {
    if (foreignRunActive()) { toast.error("A descent is already running in another tab. Finish it there first."); return; }
    if (!me || me.keys < 1 || !wallet.account) { toast.error("You need an Ember Pot key on Mezo first."); return; }
    setStarting(true);
    try {
      // The weapons are read again first, so a weapon sold from another device is not carried into a descent the pot
      // would then refuse. A found weapon the wallet holds replaces the dagger.
      if (itemsLive()) await useItems.getState().refresh();
      const item = carriedItem();
      // The server picks the map and signs it with the weapon: the pot takes no prize descent it did not start.
      const { requestStart } = await import("@/chain/mezo");
      const { seed, start } = await requestStart(ATTEST_URL, wallet.account as Address, item?.id ?? null, potInfo.address);
      useRun.getState().start(prizeSetup(seed, item, start), true);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className={`${WINDOW_CLASS} sm:max-w-3xl`} style={windowStyle(ACCENT.pot)}>
        <DialogTitle className="sr-only">Ember Pot on Mezo</DialogTitle>
        <DialogDescription className="sr-only">This week's MUSD prize pool, your keys and prize descents.</DialogDescription>
        <WindowHead icon={Coins} title="Ember Pot" accent={ACCENT.pot}
          badge={<span className="rounded-full border border-gold/40 px-2 py-0.5 text-[10px] tracking-wider text-gold uppercase">Mezo Testnet</span>}
          subtitle="A real weekly prize pool in MUSD. Every key adds to it; when the week ends the game pays it out automatically, split by the gold players carried home. Nobody can take it out." />

        {MEZO_QUICK_POTS.length > 0 && (
          <div className="space-y-1">
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Which pot">
              {MEZO_POTS.map(p => (
                <Button key={p.address} size="sm" role="tab" aria-selected={p.address === potInfo.address}
                  variant={p.address === potInfo.address ? "default" : "outline"} onClick={() => setPot(p)}>{p.label}</Button>
              ))}
            </div>
            {quick && (
              <p className="text-xs text-muted-foreground">
                A quick test pot: the same contract as the weekly pot, with {Math.round(potInfo.roundSeconds / 60)}-minute rounds, so you can
                see the whole cycle in one sitting. Buy a key with MUSD, play a short prize descent (pick up some gold, walk back to the
                rift), press Claim, and watch the game pay the round out by gold a minute after it ends.
              </p>
            )}
          </div>
        )}

        {loadError && <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">Could not read the pot: {loadError}</p>}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label={snapshot ? `Round ${snapshot.round} pot` : quick ? "This round" : "This week"} value={snapshot ? `${tokens(snapshot.pot)} MUSD` : loading ? "…" : "—"} tone={ACCENT.pot} />
          <Tile label="Ends in" value={snapshot ? timeLeft(snapshot.endsAt) : "…"} sub="Then paid out automatically" />
          <Tile label="Players" value={snapshot ? snapshot.players : "…"} sub={snapshot ? `${snapshot.totalGold} gold in` : undefined} />
          <Tile label="Your keys" value={me ? me.keys : "—"} tone={ACCENT.gate} sub={me ? `${me.gold} gold · ~${tokens(me.share)} MUSD` : "Connect a wallet"} />
        </div>

        {/* Where the pot comes from. The Market's line is shown from the first day, so its share is not a surprise. */}
        {marketLive() && snapshot && !quick && (
          <p className="text-sm text-gold">
            From Market sales: {marketFunding === 0n ? "0" : marketFunding < 10n ** 16n ? "<0.01" : tokens(marketFunding)} MUSD this week
            <span className="text-muted-foreground"> · 5% of every weapon sold goes into the pot · </span>
            <button type="button" className="underline underline-offset-2" onClick={() => { setOpen(false); useItems.getState().setMarketOpen(true); }}>Open the Market</button>
          </p>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <Section title="Buy prize keys" icon={KeyRound} tone={ACCENT.pot}>
            {!wallet.account ? (
              <>
                <p className="text-sm text-foreground/80">
                  A key costs <b className="text-gold">1 MUSD</b> and enters one prize descent: 80% of it goes into {quick ? "this round's" : "this week's"} pot.
                  {quick ? " This test pot takes MUSD." : " Pay with MUSD, or with BTC or MEZO, swapped on Tigris in the same transaction."} No MUSD and you would rather keep
                  your BTC? Borrow MUSD against it on Mezo, from this window.
                </p>
                <Button variant="outline" onClick={() => void wallet.connect().then(() => refresh())} disabled={wallet.status === "connecting"}>
                  <Wallet data-icon="inline-start" /> Connect a wallet
                </Button>
                {wallet.error && <p className="text-xs text-destructive" role="alert">{wallet.error} On a phone, open this page in your wallet's own browser.</p>}
              </>
            ) : (
              <>
                {me && (
                  <p className="text-xs text-muted-foreground">
                    Your wallet on Mezo: {tokens(me.balances.BTC, 6)} BTC · {tokens(me.balances.MEZO)} MEZO · {tokens(me.balances.MUSD)} MUSD
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Keys</span>
                  <Button variant="outline" size="icon-sm" aria-label="Fewer keys" onClick={() => setQuantity(q => Math.max(1, q - 1))} disabled={quantity <= 1}><Minus /></Button>
                  <span className="w-7 text-center font-pixel text-lg text-gold" aria-live="polite">{quantity}</span>
                  <Button variant="outline" size="icon-sm" aria-label="More keys" onClick={() => setQuantity(q => Math.min(10, q + 1))} disabled={quantity >= 10}><Plus /></Button>
                  <span className="ml-auto text-xs text-muted-foreground">{quantity} MUSD</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {PAY.map(({ token, label, icon: Icon }) => {
                    const unavailable = (token === "MEZO" && !router) || (quick && token !== "MUSD");
                    const busy = buying?.token === token;
                    // MUSD the wallet does not hold would only fail in the wallet, so that button waits for a top-up.
                    const short = token === "MUSD" && !!me && !!snapshot && me.balances.MUSD < snapshot.keyPrice * BigInt(quantity);
                    return (
                      <Button key={token} variant={token === suggested ? "default" : "secondary"} disabled={!!buying || unavailable || short} onClick={() => void buy(token, quantity)}
                        title={unavailable ? "The BTC/MEZO key router is not deployed yet" : short ? "Not enough MUSD in your wallet: pay with BTC or MEZO, or borrow MUSD below" : `Pay with ${label}`}>
                        {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Icon data-icon="inline-start" />}
                        {label}
                      </Button>
                    );
                  })}
                </div>
                {buying && <p className="text-xs text-gold" aria-live="polite">{BUY_LABEL[buying.step]}</p>}
                <p className="text-[11px] text-muted-foreground">BTC and MEZO are swapped to MUSD on Tigris and the keys bought in one transaction; leftover MUSD comes back to you.</p>
                {me && snapshot && <BorrowMusd need={snapshot.keyPrice * BigInt(quantity)} have={me.balances.MUSD} btc={me.balances.BTC} what={`${quantity} key${quantity === 1 ? "" : "s"}`} onBorrowed={() => void refresh()} />}
                {buyError && <p className="text-xs text-destructive" role="alert">{buyError}</p>}
                {lastBuyTx && (
                  <a className="inline-flex items-center gap-1 text-xs text-lime underline underline-offset-2" href={mezoTxUrl(lastBuyTx)} target="_blank" rel="noreferrer">
                    Keys bought · transaction <ExternalLink className="size-3" aria-hidden />
                  </a>
                )}
              </>
            )}
          </Section>

          {/* A player who holds a key came here to play: on a phone that block goes first. */}
          <Section title="Prize descent" icon={Flame} tone={ACCENT.gate} className={me && me.keys > 0 ? "order-first md:order-none" : undefined}>
            <p className="text-sm text-foreground/80">
              Everyone starts with the same kit: {PRIZE_FLASKS} flasks, the {PRIZE_WEAPON.name}, no Delver perks, no potions. Level perks are earned in the deep.
              Come home and press <b>Claim</b>: the game checks every move, records your gold and pays the gas. Your gold is your share of the pot. A key is spent only when you claim.
              {itemsLive() && <> Slay Cerberus on the way and its chest holds a weapon, minted to you as an NFT on Mezo. A found weapon you carry replaces the {PRIZE_WEAPON.name} and keeps its bonuses: the one thing you can bring.</>}
            </p>
            {found && <p className="text-xs" style={{ color: ACCENT.market }}>Carrying {itemName({ ...found, seed: BigInt(found.seed) })} ({itemStats({ ...found, seed: BigInt(found.seed) }).damage} dmg). Change it in the Armory.</p>}
            <Button className="w-full font-pixel" onClick={() => void startPrize()} disabled={!me || me.keys < 1 || starting}>
              {starting ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Flame data-icon="inline-start" />} {starting ? "Starting on the game's server…" : "Start a prize descent"}
            </Button>
            {me && me.keys < 1 && <p className="text-xs text-muted-foreground">Buy a key first.</p>}
            {!wallet.account && <p className="text-xs text-muted-foreground">Connect a wallet and buy a key to start. Want to try the cave first? Close this window and press PLAY: practice descents are free.</p>}
          </Section>
        </div>

        {snapshot && snapshot.standings.length > 0 && (
          <Section title="This week's gold" icon={Trophy}>
            <ol className="space-y-1" aria-label="This round's gold">
              {snapshot.standings.slice(0, 10).map((s, i) => {
                const mine = wallet.account?.toLowerCase() === s.player.toLowerCase();
                return (
                  <li key={s.player} className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${mine ? "border-lime/60 bg-lime/10" : "border-white/[0.07] bg-black/30"}`}>
                    <span className="w-5 text-center font-pixel text-muted-foreground">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">{shortAddress(s.player)}{mine && <span className="ml-1 text-lime">you</span>}</span>
                    <span className="text-right text-xs"><span className="text-gold">{s.gold} gold</span> · ~{tokens(s.share)} MUSD</span>
                  </li>
                );
              })}
            </ol>
          </Section>
        )}

        {snapshot?.previous && (
          <Section title={`Round ${snapshot.previous.round} has ended`} icon={Coins}>
            <p className="text-sm text-foreground/80">{tokens(snapshot.previous.pot)} MUSD for {snapshot.previous.totalGold} gold, {snapshot.previous.unpaid.length} player{snapshot.previous.unpaid.length === 1 ? "" : "s"} not paid yet. The game pays rounds out automatically within minutes; if it has not, anyone can press this, and the MUSD goes straight to the players, by their gold.</p>
            <Button size="sm" variant="secondary" onClick={() => void payOut()} disabled={!wallet.account || payout.status === "confirming" || snapshot.previous.unpaid.length === 0}>
              {payout.status === "confirming" ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Coins data-icon="inline-start" />} Pay out round {snapshot.previous.round}
            </Button>
            {payout.error && <p className="text-xs text-destructive" role="alert">{payout.error}</p>}
          </Section>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <a className="inline-flex items-center gap-1 underline underline-offset-2" href={mezoAddressUrl(potInfo.address)} target="_blank" rel="noreferrer">Pot contract <ExternalLink className="size-3" aria-hidden /></a>
          <a className="inline-flex items-center gap-1 underline underline-offset-2" href={mezoAddressUrl(router ?? BTC_ROUTER)} target="_blank" rel="noreferrer">Key router <ExternalLink className="size-3" aria-hidden /></a>
          {itemsAddress() && <a className="inline-flex items-center gap-1 underline underline-offset-2" href={mezoAddressUrl(itemsAddress()!)} target="_blank" rel="noreferrer">Weapon NFTs <ExternalLink className="size-3" aria-hidden /></a>}
          {marketAddress() && <a className="inline-flex items-center gap-1 underline underline-offset-2" href={mezoAddressUrl(marketAddress()!)} target="_blank" rel="noreferrer">Market <ExternalLink className="size-3" aria-hidden /></a>}
          <span>80% to the pot · 20% to the treasury</span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} data-icon="inline-start" /> Refresh
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
