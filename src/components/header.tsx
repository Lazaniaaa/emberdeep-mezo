import { Flame, Volume2, VolumeX, Wallet, Sparkles, Loader2, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { hallConfig } from "@/chain/arc-config";
import { shortAddress, usd } from "@/lib/format";
import { useHall } from "@/state/hall";
import { useGame } from "@/state/store";
import { useWallet } from "@/state/wallet";
import { DEFAULT_TUNING, tuning } from "@/game/tuning";
import { AudioControls } from './audio-controls';

/** The top bar. In the lobby it floats over the picture as a HUD; in a descent it is a normal sticky header. */
export function Header({ overlay = false }: { overlay?: boolean }) {
  const { balance, pool, round, muted, reducedMotion, setMuted, setReducedMotion } = useGame();
  const wallet = useWallet();

  return (
    <header className={overlay
      ? "absolute inset-x-0 top-0 z-30 border-b border-white/15 bg-[#150c2b]/80 backdrop-blur"
      : "sticky top-0 z-40 border-b border-white/10 bg-black/80 backdrop-blur"}>
      <div className={overlay
        ? "flex h-12 items-center gap-x-3 px-3 sm:h-14 sm:px-4"
        : "mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"}>
        <div className="flex items-center gap-2">
          <Flame className="size-5 text-lime" aria-hidden />
          <span className={overlay ? "hidden font-pixel text-lg text-lime sm:inline" : "font-pixel text-lg text-lime"}>Emberdeep</span>
          <Tooltip>
            <TooltipTrigger render={<Badge variant="outline" className="border-gold/50 text-gold">Simulated</Badge>} />
            <TooltipContent className="max-w-64">
              Balances, payouts and mints are simulated USDC kept in this browser. The only thing written on chain is a descent you choose to record in the Hall of Descents on Arc.
            </TooltipContent>
          </Tooltip>
          {tuning.dropOil !== DEFAULT_TUNING.dropOil && (
            <Tooltip>
              <TooltipTrigger render={<Badge variant="outline" className="border-lime/60 text-lime">Oil ×{tuning.dropOil}</Badge>} />
              <TooltipContent className="max-w-64">
                Local test: all oil that drops in the deep is multiplied by {tuning.dropOil} (VITE_DROP_OIL in .env.local). Descents played like this cannot be recorded in the Hall.
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        <div className={overlay ? "ml-auto flex items-center gap-2 text-sm" : "ml-auto flex flex-wrap items-center gap-2 text-sm"}>
          <Stat label="Balance" value={usd(balance)} hint={overlay ? undefined : "USDC"} />
          <Stat label={`Round ${round} pool`} value={usd(pool)} accent className={overlay ? "hidden sm:flex" : "hidden sm:flex"} />

          {hallConfig() && (
            <Tooltip>
              <TooltipTrigger render={
                <Button variant="ghost" size="icon" aria-label="Open the Hall of Descents on Arc" onClick={() => useHall.getState().setOpen(true)}>
                  <Trophy />
                </Button>
              } />
              <TooltipContent>Hall of Descents on Arc</TooltipContent>
            </Tooltip>
          )}
          <Button variant="ghost" size="icon" aria-label={muted ? "Unmute sound" : "Mute sound"} title={muted ? "Enable music and effects" : "Mute music and effects"} onClick={() => setMuted(!muted)}>
            {muted ? <VolumeX /> : <Volume2 />}
          </Button>
          <AudioControls />
          <Button
            variant={reducedMotion ? "secondary" : "ghost"} size="icon"
            aria-label={reducedMotion ? "Enable motion effects" : "Reduce motion"}
            aria-pressed={reducedMotion}
            onClick={() => setReducedMotion(!reducedMotion)}
          >
            <Sparkles className={reducedMotion ? "opacity-40" : ""} />
          </Button>

          {wallet.account ? (
            <Button variant="outline" size="sm" onClick={wallet.disconnect} aria-label="Disconnect wallet">
              <Wallet data-icon="inline-start" /> {shortAddress(wallet.account)}
            </Button>
          ) : (
            <Button size="sm" onClick={() => void wallet.connect()} disabled={wallet.status === "connecting"}>
              {wallet.status === "connecting" ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Wallet data-icon="inline-start" />}
              <span className={overlay ? "hidden sm:inline" : undefined}>Connect</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

function Stat({ label, value, hint, accent, className }: { label: string; value: string; hint?: string; accent?: boolean; className?: string }) {
  return (
    <div className={`flex flex-col items-end leading-tight ${className ?? ""}`}>
      <span className="text-[10px] tracking-wider text-muted-foreground uppercase">{label}</span>
      <span className={`font-pixel text-sm ${accent ? "text-lime" : "text-foreground"}`}>
        {value}{hint && <span className="ml-1 font-sans text-[11px] text-muted-foreground">{hint}</span>}
      </span>
    </div>
  );
}
