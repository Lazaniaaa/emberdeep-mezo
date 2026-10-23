import { useState } from "react";
import { Check, Copy, ExternalLink, Flame, Loader2, Trophy, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { hallConfig, txUrl } from "@/chain/arc-config";
import { RARITY_INFO } from "@/game/catalog";
import { usd } from "@/lib/format";
import { useHall } from "@/state/hall";
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
    extracted ? `${report.gold} gold banked for the round` : `${report.gold} gold lost in the dark`,
    `Spent ${usd(report.spent)} of simulated USDC on oil`,
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

        <div className="grid grid-cols-2 gap-2 text-sm">
          <Row label="Oil spent" value={usd(report.spent)} sub="Simulated USDC · 1 entry key used" />
          <Row label="Back to players" value={usd(report.spent - report.revenue)} sub="Into the round and lock pools" accent="text-lime" icon />
          <Row label="Gold" value={`${report.gold}`} sub={extracted ? "Banked for this round" : "Left in the deep"} accent="text-gold" />
          <Row label="Round pool share" value={extracted ? "Counted" : "None"} sub={extracted ? "Your share arrives when you close the round in the Vault" : "Lost gold counts for nobody"} accent={extracted ? "text-lime" : "text-foreground"} />
          <Row label="Crystals" value={extracted ? `+${report.crystals}` : "0"} accent="text-crystal" />
          <Row label="Soul Sigils" value={`${extracted ? report.sigils : 0}`} accent="text-sigil" />
          <Row label="Raffle tickets" value={extracted ? `+${report.tickets}` : "0"} sub={extracted ? `${report.ticketsFound} found` : `${report.ticketsFound} found, lost in the dark`} accent="text-sigil" />
        </div>

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

        {extracted && <ArcRecord report={report} />}

        <pre className="rounded-lg border border-white/10 bg-black p-3 text-xs whitespace-pre-wrap text-muted-foreground select-all">{share}</pre>

        <DialogFooter>
          <Button variant="outline" onClick={() => void copy()}><Copy data-icon="inline-start" /> {copied ? "Copied" : "Copy run summary"}</Button>
          {extracted && (
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

function Row({ label, value, sub, accent, icon }: { label: string; value: string; sub?: string; accent?: string; icon?: boolean }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/40 p-2.5">
      <div className="text-[10px] tracking-wider text-muted-foreground uppercase">{label}</div>
      <div className={`flex items-center gap-1 font-pixel ${accent ?? ""}`}>{icon && <Flame className="size-3.5" />}{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
