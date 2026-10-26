import { Coins, ExternalLink, Gem, KeyRound, Landmark, RefreshCw, RotateCcw, Ticket, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MEZO_POT, mezoAddressUrl } from "@/chain/mezo-config";
import { PRACTICE_KEYS } from "@/lib/camp-mode";
import { ACCENT } from "@/lib/camp-style";
import { tokens } from "@/lib/format";
import { useMezo } from "@/state/mezo";
import { useGame } from "@/state/store";
import { useWallet } from "@/state/wallet";
import { Section, Tile } from "./camp-ui";

function timeLeft(endsAt: number) {
  const s = Math.max(0, endsAt - Math.floor(Date.now() / 1000));
  const d = Math.floor(s / 86_400), h = Math.floor((s % 86_400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
}

/**
 * The Vault in the Mezo release: the real money (this week's Ember Pot on Mezo, read from the chain) at the top, the
 * camp's own crystals, keys and records below. No simulated rounds or pools.
 */
export function CampVault() {
  const g = useGame();
  const wallet = useWallet();
  const { snapshot, loading, loadError, refresh, setOpen } = useMezo();
  const me = snapshot?.me ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
      <Section title="Ember Pot · this week on Mezo" icon={Coins} tone={ACCENT.pot}
        action={<Button size="sm" variant="ghost" onClick={() => void refresh()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} data-icon="inline-start" /> Refresh</Button>}>
        {loadError && <p className="text-sm text-destructive" role="alert">Could not read the pot: {loadError}</p>}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label={snapshot ? `Round ${snapshot.round}` : "Round"} value={snapshot ? `${tokens(snapshot.pot)} MUSD` : "…"} tone={ACCENT.pot} sub="In the pot" />
          <Tile label="Ends in" value={snapshot ? timeLeft(snapshot.endsAt) : "…"} sub="Then paid out automatically" />
          <Tile label="Players" value={snapshot ? snapshot.players : "…"} sub={snapshot ? `${snapshot.totalGold} gold in` : undefined} />
          <Tile label="Your share" value={me ? `${tokens(me.share)} MUSD` : "—"} tone={ACCENT.gate} sub={me ? `${me.gold} gold · ${me.keys} key${me.keys === 1 ? "" : "s"}` : wallet.account ? "Reading…" : "Connect a wallet"} />
        </div>
        <ul className="space-y-1 text-sm text-foreground/80">
          <li>A prize key costs <b className="text-gold">1 MUSD</b> (or BTC or MEZO, swapped on Tigris): <b>80%</b> goes into this week's pot, 20% to the treasury.</li>
          <li>Prize descents start equal. Bring gold home, press Claim, and the game records it in the pot.</li>
          <li>When the week ends, the game pays everyone out automatically, by gold, straight to their wallets. Nobody, us included, can take the pot out.</li>
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button className="font-pixel" onClick={() => setOpen(true)}><Coins data-icon="inline-start" /> Open the Ember Pot</Button>
          <a className="inline-flex items-center gap-1 self-center text-xs text-muted-foreground underline underline-offset-2" href={mezoAddressUrl(MEZO_POT.address)} target="_blank" rel="noreferrer">
            The pot on Mezo <ExternalLink className="size-3" aria-hidden />
          </a>
        </div>
      </Section>

      <Section title="Your camp" icon={Landmark}>
        <div className="grid grid-cols-2 gap-2">
          <Tile label="Crystals" value={<span className="inline-flex items-center gap-1">{g.crystals}<Gem className="size-3.5" /></span>} tone="#7fe7ff" sub="Buy gear, Delvers, passes" />
          <Tile label="Practice keys" value={<span className="inline-flex items-center gap-1">{g.keys}<KeyRound className="size-3.5" /></span>} tone={ACCENT.pot} sub="Free" />
          <Tile label="Draw tickets" value={<span className="inline-flex items-center gap-1">{g.tickets}<Ticket className="size-3.5" /></span>} tone={ACCENT.board} sub="Weekly Delver draw" />
          <Tile label="Delvers" value={<span className="inline-flex items-center gap-1">{g.heroes.length}<Users className="size-3.5" /></span>} tone={ACCENT.altar} sub={`${g.expeditions.length} away`} />
          <Tile label="Descents" value={g.stats.runs} sub={`${g.stats.extracts} home · ${g.stats.deaths} lost`} />
          <Tile label="Deepest" value={g.stats.deepest || "—"} sub={`${g.stats.bosses} boss${g.stats.bosses === 1 ? "" : "es"} slain`} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => { g.refillKeys(); toast.success(`Practice keys topped up to ${PRACTICE_KEYS}.`); }} disabled={g.keys >= PRACTICE_KEYS}>
            <KeyRound data-icon="inline-start" /> Top up practice keys
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { if (confirm("Reset your camp progress in this browser? Your Ember Pot keys and gold on Mezo are not affected.")) { g.reset(); toast("Camp progress reset."); } }}>
            <RotateCcw data-icon="inline-start" /> Reset camp
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Camp progress lives in this browser. Real money is only in the Ember Pot on Mezo.</p>
      </Section>
    </div>
  );
}
