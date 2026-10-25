import { useState } from "react";
import { Bitcoin, Coins, ExternalLink, Flame, KeyRound, Loader2, Minus, Plus, RefreshCw, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BTC_ROUTER, MEZO_POT, keyRouterAddress, mezoAddressUrl, mezoTxUrl, type PayToken } from "@/chain/mezo-config";
import { PRIZE_FLASKS, PRIZE_WEAPON, prizeSetup } from "@/game/prize";
import { randomSeed } from "@/game/rng";
import { shortAddress, tokens } from "@/lib/format";
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
  const { open, setOpen, snapshot, loading, loadError, refresh, buy, buying, buyError, lastBuyTx, payOut, payout } = useMezo();
  const wallet = useWallet();
  const [quantity, setQuantity] = useState(1);
  const router = keyRouterAddress();
  const me = snapshot?.me ?? null;

  const startPrize = () => {
    if (foreignRunActive()) { toast.error("A descent is already running in another tab. Finish it there first."); return; }
    if (!me || me.keys < 1) { toast.error("You need an Ember Pot key on Mezo first."); return; }
    useRun.getState().start(prizeSetup(randomSeed()), true);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-pixel text-gold"><Coins className="size-4" aria-hidden /> Ember Pot · Mezo</DialogTitle>
          <DialogDescription>
            A real weekly prize pool in MUSD. Keys cost 1 MUSD: 80% goes into this week's pot, 20% to the treasury. Play a
            prize descent, come home, and record it: your gold takes its share when the week ends. Nobody can take the pot out.
          </DialogDescription>
        </DialogHeader>

        {loading && !snapshot && <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden /> Reading the pot from Mezo…</p>}
        {loadError && <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">Could not read the pot: {loadError}</p>}

        {snapshot && (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Stat label={`Round ${snapshot.round} pot`} value={`${tokens(snapshot.pot)} MUSD`} accent="text-gold" />
            <Stat label="Ends in" value={timeLeft(snapshot.endsAt)} />
            <Stat label="Players" value={`${snapshot.players}`} sub={`${snapshot.totalGold} gold recorded`} />
            <Stat label="Your keys" value={me ? `${me.keys}` : "—"} sub={me ? `${me.gold} gold · ~${tokens(me.share)} MUSD` : "Connect a wallet"} accent="text-lime" />
          </div>
        )}

        <section className="space-y-2 rounded-lg border border-white/10 bg-black/40 p-3">
          <h3 className="flex items-center gap-1.5 text-[10px] tracking-wider text-muted-foreground uppercase"><KeyRound className="size-3" aria-hidden /> Buy keys</h3>
          {!wallet.account ? (
            <Button size="sm" variant="outline" onClick={() => void wallet.connect().then(() => refresh())} disabled={wallet.status === "connecting"}>
              <Wallet data-icon="inline-start" /> Connect a wallet
            </Button>
          ) : (
            <>
              {me && (
                <p className="text-xs text-muted-foreground">
                  On Mezo: {tokens(me.balances.BTC, 6)} BTC · {tokens(me.balances.MEZO)} MEZO · {tokens(me.balances.MUSD)} MUSD
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" aria-label="Fewer keys" onClick={() => setQuantity(q => Math.max(1, q - 1))} disabled={quantity <= 1}><Minus /></Button>
                  <span className="w-8 text-center font-pixel text-lg text-gold" aria-live="polite">{quantity}</span>
                  <Button variant="outline" size="icon" aria-label="More keys" onClick={() => setQuantity(q => Math.min(10, q + 1))} disabled={quantity >= 10}><Plus /></Button>
                </div>
                {PAY.map(({ token, label, icon: Icon }) => {
                  const unavailable = token === "MEZO" && !router;
                  const busy = buying?.token === token;
                  return (
                    <Button key={token} size="sm" variant={token === "MEZO" ? "default" : "secondary"} disabled={!!buying || unavailable} onClick={() => void buy(token, quantity)}
                      title={unavailable ? "The BTC/MEZO key router is not deployed yet" : undefined}>
                      {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Icon data-icon="inline-start" />}
                      {busy ? BUY_LABEL[buying.step] : `Pay with ${label}`}
                    </Button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                BTC and MEZO are swapped to MUSD on Tigris and the keys are bought in one transaction; leftover MUSD comes back to you.
              </p>
              {buyError && <p className="text-xs text-destructive" role="alert">{buyError}</p>}
              {lastBuyTx && (
                <a className="inline-flex items-center gap-1 text-xs text-lime underline underline-offset-2" href={mezoTxUrl(lastBuyTx)} target="_blank" rel="noreferrer">
                  Keys bought · transaction <ExternalLink className="size-3" aria-hidden />
                </a>
              )}
            </>
          )}
        </section>

        <section className="space-y-2 rounded-lg border border-gold/30 bg-gold/[0.06] p-3">
          <h3 className="text-[10px] tracking-wider text-gold uppercase">Prize descent</h3>
          <p className="text-xs text-muted-foreground">
            Everyone starts equal: {PRIZE_FLASKS} flasks, the {PRIZE_WEAPON.name}, no Delver perks and no potions. Level perks are
            earned in the deep. Recording it spends one key; the server replays every move before it signs.
          </p>
          <Button className="w-full font-pixel" onClick={startPrize} disabled={!me || me.keys < 1}>
            <Flame data-icon="inline-start" /> Start a prize descent
          </Button>
          {me && me.keys < 1 && <p className="text-xs text-muted-foreground">Buy a key above first.</p>}
        </section>

        {snapshot && snapshot.standings.length > 0 && (
          <ol className="space-y-1" aria-label="This round's gold">
            {snapshot.standings.slice(0, 10).map((s, i) => {
              const mine = wallet.account?.toLowerCase() === s.player.toLowerCase();
              return (
                <li key={s.player} className={`flex items-center gap-3 rounded-lg border p-2 text-sm ${mine ? "border-lime/60 bg-lime/10" : "border-white/10 bg-black/40"}`}>
                  <span className="w-5 text-center font-pixel text-muted-foreground">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{shortAddress(s.player)}{mine && <span className="ml-1 text-lime">you</span>}</span>
                  <span className="text-right text-xs"><span className="text-gold">{s.gold} gold</span> · ~{tokens(s.share)} MUSD</span>
                </li>
              );
            })}
          </ol>
        )}

        {snapshot?.previous && (
          <section className="space-y-2 rounded-lg border border-white/10 bg-black/40 p-3 text-xs">
            <p>Round {snapshot.previous.round} has ended: {tokens(snapshot.previous.pot)} MUSD for {snapshot.previous.totalGold} gold, {snapshot.previous.unpaid.length} player{snapshot.previous.unpaid.length === 1 ? "" : "s"} not paid yet.</p>
            <Button size="sm" variant="secondary" onClick={() => void payOut()} disabled={!wallet.account || payout.status === "confirming" || snapshot.previous.unpaid.length === 0}>
              {payout.status === "confirming" ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Coins data-icon="inline-start" />} Pay out round {snapshot.previous.round}
            </Button>
            <p className="text-muted-foreground">Anyone can press this; the MUSD goes straight to the players, by their gold.</p>
            {payout.error && <p className="text-destructive" role="alert">{payout.error}</p>}
          </section>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <a className="inline-flex items-center gap-1 underline underline-offset-2" href={mezoAddressUrl(MEZO_POT.address)} target="_blank" rel="noreferrer">Pot contract <ExternalLink className="size-3" aria-hidden /></a>
          <a className="inline-flex items-center gap-1 underline underline-offset-2" href={mezoAddressUrl(router ?? BTC_ROUTER)} target="_blank" rel="noreferrer">Key router <ExternalLink className="size-3" aria-hidden /></a>
          <span>Mezo Testnet</span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} data-icon="inline-start" /> Refresh
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/40 p-2.5">
      <div className="text-[10px] tracking-wider text-muted-foreground uppercase">{label}</div>
      <div className={`font-pixel ${accent ?? ""}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
