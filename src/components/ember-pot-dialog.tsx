import { useState } from "react";
import { Bitcoin, Coins, ExternalLink, Flame, KeyRound, Loader2, Minus, Plus, RefreshCw, Trophy, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ACCENT, WINDOW_CLASS, windowStyle } from "@/lib/camp-style";
import { Section, Tile, WindowHead } from "./camp-ui";
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
      <DialogContent className={`${WINDOW_CLASS} sm:max-w-3xl`} style={windowStyle(ACCENT.pot)}>
        <DialogTitle className="sr-only">Ember Pot on Mezo</DialogTitle>
        <DialogDescription className="sr-only">This week's MUSD prize pool, your keys and prize descents.</DialogDescription>
        <WindowHead icon={Coins} title="Ember Pot" accent={ACCENT.pot}
          badge={<span className="rounded-full border border-gold/40 px-2 py-0.5 text-[10px] tracking-wider text-gold uppercase">Mezo Testnet</span>}
          subtitle="A real weekly prize pool in MUSD. Every key adds to it; when the week ends the game pays it out automatically, split by the gold players carried home. Nobody can take it out." />

        {loadError && <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">Could not read the pot: {loadError}</p>}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label={snapshot ? `Round ${snapshot.round} pot` : "This week"} value={snapshot ? `${tokens(snapshot.pot)} MUSD` : loading ? "…" : "—"} tone={ACCENT.pot} />
          <Tile label="Ends in" value={snapshot ? timeLeft(snapshot.endsAt) : "…"} sub="Then paid out automatically" />
          <Tile label="Players" value={snapshot ? snapshot.players : "…"} sub={snapshot ? `${snapshot.totalGold} gold in` : undefined} />
          <Tile label="Your keys" value={me ? me.keys : "—"} tone={ACCENT.gate} sub={me ? `${me.gold} gold · ~${tokens(me.share)} MUSD` : "Connect a wallet"} />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Section title="Buy prize keys" icon={KeyRound} tone={ACCENT.pot}>
            {!wallet.account ? (
              <Button variant="outline" onClick={() => void wallet.connect().then(() => refresh())} disabled={wallet.status === "connecting"}>
                <Wallet data-icon="inline-start" /> Connect a wallet
              </Button>
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
                    const unavailable = token === "MEZO" && !router;
                    const busy = buying?.token === token;
                    return (
                      <Button key={token} variant={token === "MEZO" ? "default" : "secondary"} disabled={!!buying || unavailable} onClick={() => void buy(token, quantity)}
                        title={unavailable ? "The BTC/MEZO key router is not deployed yet" : `Pay with ${label}`}>
                        {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Icon data-icon="inline-start" />}
                        {label}
                      </Button>
                    );
                  })}
                </div>
                {buying && <p className="text-xs text-gold" aria-live="polite">{BUY_LABEL[buying.step]}</p>}
                <p className="text-[11px] text-muted-foreground">BTC and MEZO are swapped to MUSD on Tigris and the keys bought in one transaction; leftover MUSD comes back to you.</p>
                {buyError && <p className="text-xs text-destructive" role="alert">{buyError}</p>}
                {lastBuyTx && (
                  <a className="inline-flex items-center gap-1 text-xs text-lime underline underline-offset-2" href={mezoTxUrl(lastBuyTx)} target="_blank" rel="noreferrer">
                    Keys bought · transaction <ExternalLink className="size-3" aria-hidden />
                  </a>
                )}
              </>
            )}
          </Section>

          <Section title="Prize descent" icon={Flame} tone={ACCENT.gate}>
            <p className="text-sm text-foreground/80">
              Everyone starts equal: {PRIZE_FLASKS} flasks, the {PRIZE_WEAPON.name}, no Delver perks, no potions. Level perks are earned in the deep.
              Come home and press <b>Claim</b>: the game checks every move, records your gold and pays the gas. One key per claim.
            </p>
            <Button className="w-full font-pixel" onClick={startPrize} disabled={!me || me.keys < 1}>
              <Flame data-icon="inline-start" /> Start a prize descent
            </Button>
            {me && me.keys < 1 && <p className="text-xs text-muted-foreground">Buy a key first.</p>}
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
          <a className="inline-flex items-center gap-1 underline underline-offset-2" href={mezoAddressUrl(MEZO_POT.address)} target="_blank" rel="noreferrer">Pot contract <ExternalLink className="size-3" aria-hidden /></a>
          <a className="inline-flex items-center gap-1 underline underline-offset-2" href={mezoAddressUrl(router ?? BTC_ROUTER)} target="_blank" rel="noreferrer">Key router <ExternalLink className="size-3" aria-hidden /></a>
          <span>80% to the pot · 20% to the treasury</span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} data-icon="inline-start" /> Refresh
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
