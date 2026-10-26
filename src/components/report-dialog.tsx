import { useState } from "react";
import { Check, Coins, Copy, ExternalLink, Flame, Loader2, Trophy, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { hallConfig, txUrl } from "@/chain/arc-config";
import { mezoTxUrl } from "@/chain/mezo-config";
import { isPrizeSetup } from "@/game/prize";
import { validateSetup } from "@/game/replay";
import { RARITY_INFO } from "@/game/catalog";
import { usd } from "@/lib/format";
import { useHall } from "@/state/hall";
import { useMezo, type MezoRecordStatus } from "@/state/mezo";
import { useRun } from "@/state/run-store";
import { campMode } from "@/lib/camp-mode";
import { useUi } from "@/state/ui";
import { useGame, type RunReport } from "@/state/store";
import { useWallet } from "@/state/wallet";
import { nftVisual } from "./hero-info";
import { HeroAvatar } from "./art";
import { reportDeath } from "./death-cause";

export function ReportDialog() {
  const report = useGame(s => s.lastReport);
  const dismiss = useGame(s => s.dismissReport);
  const [copied, setCopied] = useState(false);
  if (!report) return null;

  const extracted = report.outcome === "extracted";
  const cause = reportDeath(report);
  const share = [
    `Emberdeep`,
    extracted ? `Extracted from depth ${report.depth}` : `Lost in the dark at depth ${report.depth}`,
    cause,
    extracted ? `${report.gold} gold ${report.prize ? "for the Ember Pot on Mezo" : campMode.crystals ? "carried home" : "banked for the round"}` : `${report.gold} gold lost in the dark`,
    report.prize ? `Prize descent: equal loadout` : campMode.crystals ? `Practice descent` : `Spent ${usd(report.spent)} of simulated USDC on oil`,
    report.bossSlain ? `Slew Cerberus` : null,
    report.minted.length ? `Found ${report.minted.length} Soul Sigil${report.minted.length > 1 ? "s" : ""}` : null,
  ].filter(Boolean).join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(share);
      setCopied(true);
      toast.success("Run summary copied. Share it.");
    } catch {
      toast.error("Clipboard is blocked here. Select the text to copy it.");
    }
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) { dismiss(); setCopied(false); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className={`font-pixel ${extracted ? "text-lime" : "text-destructive"}`}>
            {extracted ? `Home from depth ${report.depth}` : `Lost at depth ${report.depth}`}
          </DialogTitle>
          <DialogDescription>
            {report.steps} steps · {report.kills} dimling{report.kills === 1 ? "" : "s"} dispersed
            {report.bossSlain && <span className="text-sigil"> · Cerberus slain</span>}
          </DialogDescription>
        </DialogHeader>

        {cause && <p className="text-sm text-orange-200" aria-label="Last cause">{cause}</p>}

        <LootSummary report={report} />

        {!report.prize && campMode.crystals && (
          <div className="grid grid-cols-3 gap-2 text-sm">
            <Row label="Crystals" value={extracted ? `+${report.crystals}` : "0"} sub={extracted ? "Added to your camp" : "Lost in the dark"} accent="text-crystal" />
            <Row label="Soul Sigils" value={`${extracted ? report.sigils : 0}`} accent="text-sigil" />
            <Row label="Draw tickets" value={extracted ? `+${report.tickets}` : "0"} accent="text-sigil" />
          </div>
        )}

        {report.prize || campMode.crystals ? null : (
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Row label="Oil spent" value={usd(report.spent)} sub="Simulated USDC · 1 entry key used" />
          <Row label="Back to players" value={usd(report.spent - report.revenue)} sub="Into the round and lock pools" accent="text-lime" icon />
          <Row label="Gold" value={`${report.gold}`} sub={extracted ? "Banked for this round" : "Left in the deep"} accent="text-gold" />
          <Row label="Round pool share" value={extracted ? "Counted" : "None"} sub={extracted ? "Your share arrives when you close the round in the Vault" : "Lost gold counts for nobody"} accent={extracted ? "text-lime" : "text-foreground"} />
          <Row label="Crystals" value={extracted ? `+${report.crystals}` : "0"} accent="text-crystal" />
          <Row label="Soul Sigils" value={`${extracted ? report.sigils : 0}`} accent="text-sigil" />
          <Row label="Raffle tickets" value={extracted ? `+${report.tickets}` : "0"} sub={extracted ? `${report.ticketsFound} found` : `${report.ticketsFound} found, lost in the dark`} accent="text-sigil" />
        </div>
        )}

        {report.minted.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs tracking-wider text-sigil uppercase">Minted from Soul Sigils</h3>
            <div className="flex flex-wrap gap-2">
              {report.minted.map(h => {
                const v = nftVisual(h);
                return (
                  <div key={h.id} className="flex items-center gap-2 rounded-lg border bg-black/50 p-2" style={{ borderColor: RARITY_INFO[h.rarity].color }}>
                    {v.portrait && <HeroAvatar portrait={v.portrait} px={3} showEdition={false} />}
                    <div className="text-xs">
                      <div className="font-pixel" style={{ color: v.color }}>{v.name}</div>
                      <div className="text-muted-foreground">{v.perk}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {extracted && <ClaimPanel report={report} />}
        {extracted && !report.prize && <ArcRecord report={report} />}

        <pre className="rounded-lg border border-white/10 bg-black p-3 text-xs whitespace-pre-wrap text-muted-foreground select-all">{share}</pre>

        <DialogFooter>
          <Button variant="outline" onClick={() => void copy()}><Copy data-icon="inline-start" /> {copied ? "Copied" : "Copy run summary"}</Button>
          {extracted && !report.prize && (
            <Button variant="secondary" onClick={() => { dismiss(); setCopied(false); useUi.getState().request("ledger"); }}>Open the Vault</Button>
          )}
          <Button onClick={() => { dismiss(); setCopied(false); }}>Back to camp</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const RECORD_LABEL = {
  attesting: "The server is replaying it…",
  switching: "Switching the wallet to Arc…",
  signing: "Confirm in your wallet…",
  confirming: "Writing it to Arc…",
} as const;

/** Puts a descent that came home on the Hall of Descents on Arc: one signature, about a cent of USDC for gas. */
function ArcRecord({ report }: { report: RunReport }) {
  const config = hallConfig();
  const wallet = useWallet();
  const { forReport, status, txHash, error, record, setOpen } = useHall();
  if (!config) return null;

  const step = forReport === report ? status : "idle";
  const busy = step === "attesting" || step === "switching" || step === "signing" || step === "confirming";
  const canSign = wallet.account !== null;

  return (
    <div className="space-y-2 rounded-lg border border-white/10 bg-black/40 p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] tracking-wider text-muted-foreground uppercase">
        <Trophy className="size-3" aria-hidden /> Hall of Descents · Arc
      </div>
      {step === "done" && txHash ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="flex items-center gap-1 text-lime"><Check className="size-4" aria-hidden /> Recorded on Arc</span>
          <a className="inline-flex items-center gap-1 text-xs underline underline-offset-2" href={txUrl(txHash)} target="_blank" rel="noreferrer">
            Transaction <ExternalLink className="size-3" aria-hidden />
          </a>
          <Button size="sm" variant="secondary" className="ml-auto" onClick={() => setOpen(true)}>Open the Hall</Button>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Write this descent to Arc. The game's server replays every move first and signs only the true result;
            then one signature from you, well under a cent of USDC for gas. No tokens move.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {canSign ? (
              <Button size="sm" onClick={() => void record(report)} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Trophy data-icon="inline-start" />}
                {busy ? RECORD_LABEL[step as keyof typeof RECORD_LABEL] : "Record on Arc"}
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => void wallet.connect()} disabled={wallet.status === "connecting"}>
                <Wallet data-icon="inline-start" /> Connect a wallet to record
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>See the Hall</Button>
          </div>
          {step === "error" && error && <p className="text-xs text-destructive" role="alert">{error}</p>}
        </>
      )}
    </div>
  );
}

const isBusy = (s: MezoRecordStatus) => s === "attesting" || s === "login" || s === "relaying" || s === "switching" || s === "signing" || s === "confirming";

/** Whether the descent behind this report was played with the prize loadout, so the Ember Pot can take it. */
function usePrizeDescent() {
  const descent = useRun(s => s.lastDescent);
  if (!descent) return false;
  try { return isPrizeSetup(validateSetup(descent.setup)); } catch { return false; }
}

/** Everything the descent picked up, at a glance. */
function LootSummary({ report }: { report: RunReport }) {
  const extracted = report.outcome === "extracted";
  const l = report.loot;
  const items: [string, string | number, string][] = [
    ["Gold", report.gold, "text-gold"],
    ...(l ? [
      ["Crystals", l.crystals, "text-crystal"],
      ["Potions", l.potions, "text-lime"],
      ["Gear", l.gear, "text-foreground"],
      ["Broken", l.smashed, "text-foreground"],
    ] as [string, number, string][] : []),
    ["Dispersed", report.kills, "text-foreground"],
    ...(l ? [[l.perks ? `Level · ${l.perks} perk${l.perks === 1 ? "" : "s"}` : "Level", l.level, "text-lime"]] as [string, number, string][] : []),
  ];
  return (
    <section aria-label="Loot" className="space-y-1.5">
      <h3 className="text-[10px] tracking-wider text-muted-foreground uppercase">{extracted ? "Carried home" : "Lost in the dark"}</h3>
      <div className={`grid grid-cols-4 gap-1.5 ${extracted ? "" : "opacity-50"}`}>
        {items.map(([label, value, accent]) => (
          <div key={label} className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-center">
            <div className={`font-pixel text-sm ${accent}`}>{value}</div>
            <div className="text-[10px] text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

const CLAIM_LABEL: Partial<Record<MezoRecordStatus, string>> = {
  attesting: "Checking every move…",
  login: "Sign in once in your wallet (no gas)…",
  relaying: "Claiming on Mezo…",
  switching: "Switching the wallet to Mezo…",
  signing: "Confirm in your wallet…",
  confirming: "Claiming on Mezo…",
};

/**
 * The one step after a prize descent: Claim puts the gold into this week's Ember Pot (spending one key) and adds the
 * descent to the Hall on Mezo. The game's server checks the moves and pays the gas.
 */
function ClaimPanel({ report }: { report: RunReport }) {
  const wallet = useWallet();
  const prizeDescent = usePrizeDescent();
  // A report from a prize descent is one; the server checks the loadout again before it signs.
  const prize = report.prize === true || prizeDescent;
  const { potFor, pot, hallFor, hall, claim, setOpen } = useMezo();
  const job = potFor === report ? pot : { status: "idle" as const, txHash: null, error: null };
  const hallJob = hallFor === report ? hall : null;
  const gold = Math.min(5000, report.gold);
  if (!prize) {
    return (
      <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <Coins className="size-3 text-gold" aria-hidden /> Only a prize descent (equal loadout) can be claimed into the Ember Pot on Mezo.
        <button className="underline underline-offset-2" onClick={() => setOpen(true)}>Open the pot</button>
      </p>
    );
  }
  const busy = isBusy(job.status) || (hallJob !== null && isBusy(hallJob.status));
  return (
    <div className="space-y-2 rounded-lg border border-gold/50 bg-gold/[0.07] p-3">
      {job.status === "done" && job.txHash ? (
        <div className="space-y-1.5 text-sm">
          <p className="flex items-center gap-1.5 font-pixel text-lime"><Check className="size-4" aria-hidden /> Claimed: {gold} gold in this week's pot</p>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <a className="inline-flex items-center gap-1 underline underline-offset-2" href={mezoTxUrl(job.txHash)} target="_blank" rel="noreferrer">Pot transaction <ExternalLink className="size-3" aria-hidden /></a>
            {hallJob?.status === "done" && hallJob.txHash && (
              <a className="inline-flex items-center gap-1 underline underline-offset-2" href={mezoTxUrl(hallJob.txHash)} target="_blank" rel="noreferrer">On the Hall <ExternalLink className="size-3" aria-hidden /></a>
            )}
            {hallJob && isBusy(hallJob.status) && <span className="inline-flex items-center gap-1 text-muted-foreground"><Loader2 className="size-3 animate-spin" aria-hidden /> Adding it to the Hall…</span>}
            <Button size="sm" variant="secondary" className="ml-auto" onClick={() => setOpen(true)}>See the pot</Button>
          </div>
          {hallJob?.status === "error" && <p className="text-xs text-muted-foreground">The Hall on Mezo did not take it ({hallJob.error}). Your gold is in the pot all the same.</p>}
        </div>
      ) : wallet.account ? (
        <>
          <Button className="h-11 w-full font-pixel text-base" onClick={() => void claim(report)} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Coins data-icon="inline-start" />}
            {CLAIM_LABEL[job.status] ?? `Claim ${gold} gold`}
          </Button>
          <p className="text-[11px] text-muted-foreground">Into this week's MUSD pot on Mezo · uses 1 key · the game checks every move and pays the gas.</p>
          {job.status === "error" && job.error && <p className="text-xs text-destructive" role="alert">{job.error}</p>}
        </>
      ) : (
        <Button className="w-full" variant="outline" onClick={() => void wallet.connect()}><Wallet data-icon="inline-start" /> Connect a wallet to claim</Button>
      )}
    </div>
  );
}

function Row({ label, value, sub, accent, icon }: { label: string; value: string; sub?: string; accent?: string; icon?: boolean }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/40 p-2.5">
      <div className="text-[10px] tracking-wider text-muted-foreground uppercase">{label}</div>
      <div className={`flex items-center gap-1 font-pixel ${accent ?? ""}`}>{icon && <Flame className="size-3.5" />}{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
