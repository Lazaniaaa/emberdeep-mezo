import { useState } from "react";
import { ExternalLink, Loader2, RefreshCw, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { HallBoard } from "@/chain/arc";
import { addressUrl, hallConfig } from "@/chain/arc-config";
import { mezoAddressUrl, mezoHallAddress } from "@/chain/mezo-config";
import { shortAddress } from "@/lib/format";
import { useHall } from "@/state/hall";
import { useWallet } from "@/state/wallet";

type Net = "arc" | "mezo";

/** The Hall on Mezo, read when its tab is chosen. */
function useMezoBoard() {
  const [state, setState] = useState<{ board: HallBoard | null; status: "idle" | "loading" | "ready" | "error"; error: string | null }>({ board: null, status: "idle", error: null });
  const load = () => {
    setState(s => ({ ...s, status: "loading", error: null }));
    import("@/chain/mezo").then(m => m.readMezoHall())
      .then(board => setState({ board, status: "ready", error: null }))
      .catch((e: unknown) => setState(s => ({ ...s, status: "error", error: e instanceof Error ? e.message.split("\n")[0] : "Could not read the Hall" })));
  };
  return { ...state, load };
}

/** The wall of the deepest descents recorded on Arc, or on Mezo. It reads the chain directly and needs no wallet. */
export function HallDialog() {
  const arcHall = useHall();
  const me = useWallet(s => s.account);
  const [net, setNet] = useState<Net>("arc");
  const config = hallConfig();
  const mezoHall = mezoHallAddress();
  const mezo = useMezoBoard();
  if (!config && !mezoHall) return null;
  // With Arc on, Mezo is a second tab; on a Mezo-only site the Hall store itself reads Mezo.
  const mezoTab = !!config && net === "mezo" && !!mezoHall;
  const { open, setOpen } = arcHall;
  const board = mezoTab ? mezo.board : arcHall.board;
  const boardStatus = mezoTab ? mezo.status : arcHall.boardStatus;
  const boardError = mezoTab ? mezo.error : arcHall.boardError;
  const refresh = mezoTab ? async () => mezo.load() : arcHall.refresh;
  const onMezo = mezoTab || !config;
  const chainName = onMezo ? "Mezo" : "Arc";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-pixel text-lime"><Trophy className="size-4" aria-hidden /> Hall of Descents</DialogTitle>
          <DialogDescription>
            The deepest delvers who came home, replayed and signed by the game, written to {chainName} by their own wallets.
          </DialogDescription>
        </DialogHeader>

        {config && mezoHall && (
          <div className="flex gap-2" role="tablist" aria-label="Chain">
            {(["arc", "mezo"] as const).map(n => (
              <Button key={n} role="tab" aria-selected={net === n} size="sm" variant={net === n ? "default" : "outline"} onClick={() => { setNet(n); if (n === "mezo") mezo.load(); }}>
                {n === "arc" ? "Arc" : "Mezo"}
              </Button>
            ))}
          </div>
        )}

        {boardStatus === "loading" && !board && (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden /> Reading the wall from {chainName}…</p>
        )}
        {boardStatus === "error" && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            Could not read the Hall: {boardError}
          </p>
        )}
        {board && board.entries.length === 0 && boardStatus !== "error" && (
          <p className="py-6 text-sm text-muted-foreground">Nobody has come home and signed the wall yet. Finish a descent and record it, and yours is the first name here.</p>
        )}
        {board && board.entries.length > 0 && (
          <ol className="space-y-1.5" aria-label={`Deepest descents recorded on ${chainName}`}>
            {board.entries.map((e, i) => {
              const mine = me?.toLowerCase() === e.player.toLowerCase();
              return (
                <li key={e.player} className={`flex items-center gap-3 rounded-lg border p-2.5 text-sm ${mine ? "border-lime/60 bg-lime/10" : "border-white/10 bg-black/40"}`}>
                  <span className="w-6 text-center font-pixel text-muted-foreground">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xs">{shortAddress(e.player)}{mine && <span className="ml-1 text-lime">you</span>}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {e.kills} dispersed · {e.runs} record{e.runs === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-pixel text-lime">Depth {e.depth}{e.bossSlain && <span className="ml-1 text-sigil" title="Cerberus slain">★</span>}</span>
                    <span className="block text-[11px] text-gold">{e.gold} gold</span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {board && <span>{board.records} record{board.records === 1 ? "" : "s"} from {board.players} wallet{board.players === 1 ? "" : "s"}.</span>}
          <a className="inline-flex items-center gap-1 underline underline-offset-2" href={onMezo ? mezoAddressUrl(mezoHall!) : addressUrl(config!.address)} target="_blank" rel="noreferrer">
            Contract on {chainName} <ExternalLink className="size-3" aria-hidden />
          </a>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void refresh()} disabled={boardStatus === "loading"}>
            <RefreshCw className={boardStatus === "loading" ? "animate-spin" : ""} data-icon="inline-start" /> Refresh
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          The game's server replayed every one of these descents move by move before it signed it, and the Hall takes no
          record without that signature. The loadout comes from the simulated economy in the player's browser, so it is
          held to what the game allows rather than proven. Nothing here moves tokens, and the Hall holds no funds.
        </p>
      </DialogContent>
    </Dialog>
  );
}
