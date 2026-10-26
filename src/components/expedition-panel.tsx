import { useEffect, useState } from "react";
import { Compass, Hourglass, PackageOpen } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { playSfx } from "@/audio/sfx";
import {
  EXPEDITION_BASE_LOOT, EXPEDITION_COST, EXPEDITION_DURATION_MS, EXPEDITION_PACKS, EXPEDITION_POOL, EXPEDITION_REVENUE,
  EXPEDITION_TIERS, type PackId,
} from "@/game/config";
import { chanceAtLeast, hasReturned, secondsLeft, type Outcome } from "@/game/expedition";
import { usd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ExpeditionError, InsufficientFunds, useGame } from "@/state/store";
import { HeroAvatar } from "./art";
import { nftVisual } from "./hero-info";
import { campMode, crystalsFor } from "@/lib/camp-mode";
import { money } from "@/lib/format";

const PACK_IDS = Object.keys(EXPEDITION_PACKS) as PackId[];
const pct = (p: number, digits = 0) => `${(p * 100).toFixed(digits)}%`;

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** One line for what a trip brought home. */
function describe(o: Outcome) {
  if (!o.success) return "came back empty-handed";
  const tier = EXPEDITION_TIERS.find(t => t.id === o.tier)?.label ?? "";
  const n = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`;
  return `${tier} haul ×${o.multiplier}: ${n(o.loot.keys, "key")}, ${n(o.loot.tickets, "ticket")}, ${o.loot.gold} gold`;
}

export function ExpeditionPanel() {
  const game = useGame();
  const now = useNow();
  const [heroId, setHeroId] = useState<string | null>(null);
  const [pack, setPack] = useState<PackId>("none");

  const away = new Map(game.expeditions.map(e => [e.heroId, e]));
  const ready = game.heroes.filter(h => !away.has(h.id));
  const chosen = ready.find(h => h.id === heroId) ?? ready[0];
  const cost = EXPEDITION_COST + EXPEDITION_PACKS[pack].price;
  const previewSeconds = Math.round(EXPEDITION_DURATION_MS / 1000);

  const act = <T,>(action: () => T, ok: (result: T) => string) => {
    try {
      const result = action();
      playSfx("buy", useGame.getState().muted);
      toast.success(ok(result));
    } catch (e) {
      toast.error(e instanceof InsufficientFunds || e instanceof ExpeditionError ? e.message : "That did not work.");
    }
  };

  const canPay = campMode.crystals ? game.crystals >= crystalsFor(cost) : game.balance >= cost;
  const nameOf = (id: string) => {
    const h = game.heroes.find(x => x.id === id);
    return h ? nftVisual(h) : null;
  };

  return (
    <div className="space-y-4">
      <Card className="ring-crystal/25">
        <CardHeader>
          <CardTitle className="font-pixel text-crystal">Expeditions</CardTitle>
          <CardDescription>
            Send a Delver into unmapped land. It costs {money(EXPEDITION_COST)} plus an optional pack. It may come back with a haul of keys, tickets and gold, or empty-handed; it is never lost.
            {" "}While it is away it cannot descend.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p>
            <b className="text-foreground">Preview: {previewSeconds} seconds.</b> That is only so a whole trip fits in one session. A live version would send the Delver away for a few hours up to a day, and the
            trip is decided when it leaves, so reloading cannot re-roll it.
          </p>
          <p>
            {!campMode.crystals && <>Every trip is split {Math.round(EXPEDITION_POOL * 100)}% into the round's reward pool and {Math.round(EXPEDITION_REVENUE * 100)}% to the studio. </>}
            A haul is between ×{EXPEDITION_TIERS[0].min} and ×{EXPEDITION_TIERS[EXPEDITION_TIERS.length - 1].max} of a basic haul ({EXPEDITION_BASE_LOOT.keys} key, {EXPEDITION_BASE_LOOT.tickets} ticket, {EXPEDITION_BASE_LOOT.gold} gold),
            and most are small: about {Math.round(EXPEDITION_TIERS[0].weight / 100)}% are Common.{campMode.crystals ? "" : " Gold joins this round's pool share, so the return cap applies to it."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-pixel">Send a Delver</CardTitle>
          <CardDescription>Pick who goes and how well they are equipped. A better pack raises the chance of coming back with a haul.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {game.heroes.length === 0 ? (
            <p className="text-sm text-muted-foreground">You need a Delver to send. Mint one on the Mint tab, or bring a Soul Sigil home from the deep. Your Wanderer stays behind to descend.</p>
          ) : ready.length === 0 ? (
            <p className="text-sm text-muted-foreground">Every Delver you own is already away.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Delver to send">
                {ready.map(h => {
                  const v = nftVisual(h);
                  const active = chosen?.id === h.id;
                  return (
                    <button
                      key={h.id} type="button" role="radio" aria-checked={active} onClick={() => setHeroId(h.id)}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-lg border bg-black/40 p-2 text-center outline-none focus-visible:ring-2 focus-visible:ring-lime",
                        active ? "border-lime bg-lime/[0.07]" : "border-white/10 hover:border-white/30",
                      )}
                    >
                      {v.portrait && <HeroAvatar portrait={v.portrait} px={3} />}
                      <span className="font-pixel text-[10px]" style={{ color: v.color }}>{v.name}</span>
                      <span className="text-[10px] text-muted-foreground">{v.subtitle}</span>
                    </button>
                  );
                })}
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="Expedition pack">
                {PACK_IDS.map(id => {
                  const p = EXPEDITION_PACKS[id];
                  const active = pack === id;
                  return (
                    <button
                      key={id} type="button" role="radio" aria-checked={active} onClick={() => setPack(id)}
                      className={cn(
                        "flex flex-col gap-0.5 rounded-lg border bg-black/40 p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-lime",
                        active ? "border-lime bg-lime/[0.07]" : "border-white/10 hover:border-white/30",
                      )}
                    >
                      <span className="flex items-center gap-1.5 font-pixel text-xs"><PackageOpen className="size-3.5 text-crystal" /> {p.name}</span>
                      <span className="text-xs text-muted-foreground">{p.blurb}</span>
                      <span className="mt-1 text-xs">
                        <b className="text-lime">{pct(p.chance)}</b> to return with a haul
                      </span>
                      <span className="text-xs text-muted-foreground">{p.price === 0 ? "Free" : `+${money(p.price)}`} · ×5 or more: {pct(chanceAtLeast(id, 5), 1)}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/40 p-3">
                <p className="text-xs text-muted-foreground">
                  Total <b className="text-foreground">{money(cost)}</b>{campMode.crystals ? "." : <>: {usd(cost * EXPEDITION_POOL)} to the round pool, {usd(cost * EXPEDITION_REVENUE)} to the studio.</>}
                </p>
                <Button
                  disabled={!chosen || !canPay}
                  onClick={() => chosen && act(() => game.sendExpedition(chosen.id, pack), () => `${nameOf(chosen.id)?.name ?? "Delver"} set out. Back in ${previewSeconds} seconds.`)}
                >
                  <Compass data-icon="inline-start" /> Send on expedition · {money(cost)}
                </Button>
              </div>
              {!canPay && <p className="text-xs text-destructive">{campMode.crystals ? "Not enough crystals. Bring more home from the deep." : "Not enough USDC. Grab a simulated top-up in the Vault."}</p>}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-pixel">Away ({game.expeditions.length})</CardTitle>
          <CardDescription>A Delver comes home when its time is up. Collect the haul to free it.</CardDescription>
        </CardHeader>
        <CardContent>
          {game.expeditions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody is away.</p>
          ) : (
            <ul className="space-y-2">
              {game.expeditions.map(e => {
                const v = nftVisual(game.heroes.find(h => h.id === e.heroId) ?? game.heroes[0]);
                const back = hasReturned(e.returnsAt, now);
                const left = secondsLeft(e.returnsAt, now);
                return (
                  <li key={e.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-black/40 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-pixel text-xs" style={{ color: v.color }}>{v.name}</span>
                        <Badge variant="outline">{EXPEDITION_PACKS[e.pack].name}</Badge>
                        {back
                          ? <Badge className="bg-lime text-black">Back</Badge>
                          : <Badge variant="outline"><Hourglass className="size-3" /> {left}s</Badge>}
                      </div>
                    </div>
                    <Button
                      size="sm" variant={back ? "default" : "outline"} disabled={!back}
                      onClick={() => act(() => game.collectExpedition(e.id), r => `${r.heroName} ${describe(r.outcome)}${r.keysLost > 0 ? ` (${r.keysLost} keys did not fit)` : ""}.`)}
                    >
                      {back ? "Collect haul" : "Away"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {game.returns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-pixel">Recent returns</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {game.returns.map((r, i) => (
                <li key={`${r.at}-${i}`} className="flex flex-wrap items-baseline justify-between gap-2 rounded bg-white/[0.03] px-2 py-1">
                  <span className="truncate">{r.heroName} · {EXPEDITION_PACKS[r.pack].name}</span>
                  <span className={cn("text-xs", r.outcome.success ? "text-gold" : "text-muted-foreground")}>{describe(r.outcome)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
