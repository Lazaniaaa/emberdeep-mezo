import { useState } from "react";
import { Sparkles, Ticket, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { playSfx } from "@/audio/sfx";
import { RARITIES, RARITY_INFO, type HeroNft } from "@/game/catalog";
import { DRAW_MINTS, FIELD_WEEK_SPEND, PASSES, REVENUE_SHARE, SIGIL_RARITY_WEIGHTS, TICKET_DROP_CHANCE, type PassId } from "@/game/config";
import { mintsLeft } from "@/game/economy";
import { passCost, ticketChance, type DrawResult } from "@/game/raffle";
import { money, usd } from "@/lib/format";
import { campMode, crystalsFor } from "@/lib/camp-mode";
import { activePass, useGame, InsufficientFunds } from "@/state/store";
import { nftVisual } from "./hero-info";
import { HeroAvatar } from "./art";

export function RaffleTab() {
  const g = useGame();
  const [draw, setDraw] = useState<{ result: DrawResult; won: HeroNft[] } | null>(null);
  const total = g.tickets + g.fieldTickets;
  const odds = total > 0 ? g.tickets / total : 0;
  const soldOut = RARITIES.every(r => mintsLeft(r, g.minted[r]) <= 0);
  const won = g.heroes.filter(h => h.source === "draw");

  const reveal = () => {
    const result = g.drawRaffle();
    if (!result) {
      toast.error("Nobody holds a ticket this week.");
      return;
    }
    const mine = result.prizes.filter(p => p.rarity !== undefined).length;
    playSfx(mine > 0 ? "mint" : "burn", g.muted);
    setDraw({ result, won: useGame.getState().heroes.slice(0, mine) });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <Card className="ring-sigil/30">
        <CardHeader>
          <CardTitle className="font-pixel text-sigil">Weekly Delver draw</CardTitle>
          <CardDescription>
            Every week {DRAW_MINTS} Delvers are minted free for the winning tickets: nothing is bought for the draw, a win is a mint from the fixed supply.
            Tickets are not for sale. Gold, crystals, chests, vaults and kills drop one {Math.round(ticketChance(activePass(g)) * 1000) / 10}% of the time, and only a ticket you carry home goes into the drum.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Free mints" value={`${DRAW_MINTS}`} sub={`Week ${g.week}`} />
            <Stat label="Your tickets" value={`${g.tickets}`} sub={total ? `${Math.round(odds * 100)}% of the drum` : "Extract to earn"} accent="text-sigil" />
            <Stat label="Field tickets" value={`${g.fieldTickets}`} sub="Other delvers" />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>This week's mints</span>
              <span>Each ticket is one chance at each mint</span>
            </div>
            <div className="flex gap-2">
              {Array.from({ length: DRAW_MINTS }, (_, i) => (
                <div key={i} className="grid h-20 flex-1 place-items-center rounded-lg border border-sigil/60 bg-sigil/10">
                  <HeroAvatar portrait={{ kind: "wanderer", rarity: "epic" }} px={3} showEdition={false} className="opacity-70" />
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              A win rolls its rarity like a Soul Sigil: {RARITIES.map(r => `${RARITY_INFO[r].label} ${SIGIL_RARITY_WEIGHTS[r] / 100}%`).join(", ")}. Sold-out rarities are skipped.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => { g.addFieldWeek(); toast(campMode.crystals ? "A week of other delvers' play: their tickets are in the drum." : `Other delvers spent ${usd(FIELD_WEEK_SPEND)}. Their cut is in the pools, their gold in the round and their tickets in the drum.`); }}>
              <Users data-icon="inline-start" /> {campMode.crystals ? "Fast-forward a week" : "Add a simulated week of play"}
            </Button>
            <Button onClick={reveal} disabled={total <= 0}>
              <Ticket data-icon="inline-start" /> Draw the week
            </Button>
          </div>
          {soldOut && <p className="text-xs text-destructive">Every Delver has been minted, so a win has nothing left to give.</p>}
          <p className="text-xs text-muted-foreground">
            In production the draw is weekly and automatic. The button is here so a judge can see one resolve.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-pixel">Weekly pass</CardTitle>
          <CardDescription>
            A pass lasts until this week's draw. It raises the drop rate. It never hands you a ticket, and its price is split like every other spend ({Math.round((1 - REVENUE_SHARE) * 100)}% back to players). Free rate is {Math.round(TICKET_DROP_CHANCE * 1000) / 10}%.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(PASSES) as PassId[]).map(id => <PassCard key={id} id={id} />)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-pixel">Delvers you won</CardTitle>
          <CardDescription>A Delver from the draw is yours like a minted one: pick it to descend, lock it or send it on an expedition.</CardDescription>
        </CardHeader>
        <CardContent>
          {won.length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet. Extract a run for tickets, fill the week, then draw.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {won.map(h => {
                const v = nftVisual(h);
                const on = g.hero.kind === "nft" && g.hero.id === h.id;
                return (
                  <button key={h.id} onClick={() => g.selectHero({ kind: "nft", id: h.id })} className={`flex items-center gap-2 rounded-lg border p-2 text-left ${on ? "border-sigil bg-sigil/10" : "border-white/10"}`}>
                    {v.portrait && <HeroAvatar portrait={v.portrait} px={2} />}
                    <span className="min-w-0">
                      <span className="block font-pixel text-[10px]" style={{ color: v.color }}>{v.name}</span>
                      <span className="block text-[10px] text-muted-foreground">{v.perk}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <DrawDialog draw={draw} onClose={() => setDraw(null)} />
    </div>
  );
}

function PassCard({ id }: { id: PassId }) {
  const g = useGame();
  const current = activePass(g);
  const pass = PASSES[id];
  const cost = passCost(id, current);
  const buy = () => {
    try {
      g.buyPass(id);
      playSfx("buy", useGame.getState().muted);
      toast.success(`${pass.name} is on until this week's draw.`);
    } catch (e) {
      toast.error(e instanceof InsufficientFunds ? `Not enough ${campMode.crystals ? "crystals" : "USDC"} for ${pass.name}.` : "Could not start the pass.");
    }
  };
  return (
    <div className={`rounded-lg border p-3 ${current === id ? "border-sigil bg-sigil/10" : "border-white/10 bg-black/40"}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-pixel text-sm">{pass.name}</span>
        <span className="text-xs text-muted-foreground">{money(pass.price)} / week</span>
      </div>
      <div className="mt-1 font-pixel text-2xl text-sigil">{Math.round(pass.chance * 1000) / 10}%</div>
      <p className="text-xs text-muted-foreground">drop chance, from {Math.round(TICKET_DROP_CHANCE * 1000) / 10}% free</p>
      <Button className="mt-3 w-full" size="sm" disabled={cost === null || cost === 0 || (campMode.crystals ? crystalsFor(cost ?? 0) > g.crystals : (cost ?? 0) > g.balance)} onClick={buy}>
        {cost === 0 ? "Active this week" : cost === null ? "Included in Deep Pass" : money(cost)}
      </Button>
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/40 p-2">
      <div className="text-[10px] tracking-wider text-muted-foreground uppercase">{label}</div>
      <div className={`font-pixel text-sm ${accent ?? ""}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function DrawDialog({ draw, onClose }: { draw: { result: DrawResult; won: HeroNft[] } | null; onClose: () => void }) {
  const yours = draw?.result.prizes.filter(p => p.fate === "you").length ?? 0;
  return (
    <Dialog open={!!draw} onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {draw && (
          <>
            <DialogHeader>
              <DialogTitle className="font-pixel">{draw.won.length > 0 ? `You won ${draw.won.length} Delver${draw.won.length === 1 ? "" : "s"}` : "The field won this week"}</DialogTitle>
              <DialogDescription>
                {draw.result.mints} free mints. Your {draw.result.yourTickets} tickets against {draw.result.fieldTickets} in the field.
                {yours > draw.won.length && " Some of your wins found the supply sold out."}
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {draw.won.map(h => {
                const v = nftVisual(h);
                return (
                  <div key={h.id} className="rounded-lg border border-sigil p-2 text-center">
                    {v.portrait && <HeroAvatar portrait={v.portrait} px={3} />}
                    <div className="mt-1 font-pixel text-[10px]" style={{ color: v.color }}>{v.name}</div>
                    <Badge variant="outline"><Sparkles className="size-3" /> Yours</Badge>
                  </div>
                );
              })}
              {draw.result.prizes.filter(p => p.fate === "field").map((_, i) => (
                <div key={`field-${i}`} className="grid place-items-center rounded-lg border border-white/10 p-2 text-center">
                  <HeroAvatar portrait={{ kind: "wanderer", rarity: "common" }} px={3} showEdition={false} className="opacity-40" />
                  <Badge variant="outline" className="mt-1">Field</Badge>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button onClick={onClose} className="w-full">Close</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
