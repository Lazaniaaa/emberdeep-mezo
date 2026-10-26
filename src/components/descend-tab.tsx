import { Coins, Flame, KeyRound, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { playSfx } from "@/audio/sfx";
import { ACTIVE_SHARE, FLASK_LIGHT, FLASK_PRICE, HOLD_FACTOR, KEY_PRICE, LOCK_SHARE, MAX_FLASKS, MAX_KEYS, PASSES, REVENUE_SHARE } from "@/game/config";
import { ARMORS, POTIONS, POTION_IDS, WEAPONS } from "@/game/catalog";
import { heroLockKey, strength } from "@/game/locks";
import { ticketChance } from "@/game/raffle";
import { randomSeed } from "@/game/rng";
import { money, usd } from "@/lib/format";
import { PRACTICE_KEYS, campMode } from "@/lib/camp-mode";
import { useMezo } from "@/state/mezo";
import { Price } from "./camp-ui";
import { cn } from "@/lib/utils";
import { useRun } from "@/state/run-store";
import { activePass, computeRunPerks, useGame, type HeroChoice } from "@/state/store";
import { InsufficientFunds } from "@/state/store";
import { foreignRunActive } from "@/state/run-lock";
import { WANDERER, nftVisual, type HeroVisual } from "./hero-info";
import { HeroAvatar, ItemArt } from "./art";

export function DescendTab() {
  const game = useGame();
  const start = useRun(s => s.start);

  const perks = computeRunPerks(game);
  const pass = activePass(game);
  const drop = ticketChance(pass);
  const cost = campMode.crystals ? 0 : game.flasks * FLASK_PRICE;
  const light = game.flasks * FLASK_LIGHT + perks.startLight;
  const weapon = WEAPONS[game.weapon];

  // What a perk is worth depends on whether the thing behind it is locked, and for how long.
  const lockOf = (key: string) => game.locks.find(l => l.key === key);
  const lockedTag = (v: HeroVisual, key: string): HeroVisual => (lockOf(key) ? { ...v, subtitle: `${v.subtitle} · locked` } : v);
  const awayIds = new Set(game.expeditions.map(e => e.heroId));
  const heroChoices: { choice: HeroChoice; visual: HeroVisual; key: string; away?: boolean }[] = [
    { choice: { kind: "wanderer" }, visual: WANDERER, key: "wanderer" },
  ];
  for (const h of game.heroes) {
    const key = heroLockKey(h.id);
    const visual = lockedTag(nftVisual(h, strength(lockOf(key), game.round)), key);
    const away = awayIds.has(h.id);
    heroChoices.push({ choice: { kind: "nft", id: h.id }, visual: away ? { ...visual, subtitle: `${visual.subtitle} · away` } : visual, key: h.id, away });
  }

  const isSelected = (c: HeroChoice) => {
    if (c.kind !== game.hero.kind) return false;
    if (c.kind === "nft" && game.hero.kind === "nft") return c.id === game.hero.id;
    return true;
  };
  // A Delver that is on an expedition cannot descend, so it counts as not picked.
  const selectedValid = heroChoices.some(h => !h.away && isSelected(h.choice));

  const buyKeys = (count: number) => {
    try {
      game.buyKey(count);
      playSfx("buy", useGame.getState().muted);
      toast.success(`${count} entry key${count > 1 ? "s" : ""} bought.`);
    } catch (e) {
      toast.error(e instanceof InsufficientFunds ? `Not enough USDC for ${count} key${count > 1 ? "s" : ""}.` : "You are holding as many keys as you can.");
    }
  };

  const descend = () => {
    if (foreignRunActive()) {
      toast.error("A descent is already running in another tab. Finish it there first.");
      return;
    }
    if (!selectedValid) game.selectHero({ kind: "wanderer" });
    // A tab closed mid-descent loses the run but not the paid flag; count it as lost so play can go on.
    if ((useGame.getState().runSpent > 0 || useGame.getState().runId) && !useRun.getState().run) {
      game.abandonRun();
      toast("Your last descent was lost when the page closed. Its key and oil are gone.");
    }
    if (useGame.getState().keys < 1) {
      toast.error(campMode.crystals ? "Out of practice keys. Take more below, they are free." : `You need an entry key (${usd(KEY_PRICE)}). Buy one below.`);
      return;
    }
    if (!game.payForRun()) {
      toast.error(`You need ${money(cost)} for ${game.flasks} flask${game.flasks > 1 ? "s" : ""}. Top up in the Vault.`);
      return;
    }
    playSfx("burn", game.muted);
    const state = useGame.getState();
    start({
      seed: randomSeed(),
      flasks: state.flasks,
      perks: computeRunPerks(state),
      ticketChance: ticketChance(activePass(state)),
      weaponDamage: WEAPONS[state.weapon].damage,
      bag: { ...state.carried },
      runId: state.runId ?? undefined,
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="font-pixel">Choose who descends</CardTitle>
          <CardDescription>{campMode.crystals
            ? "Every character has a perk for practice descents. Mint more at the Ember Altar with crystals, or find a Soul Sigil in a Sealed Vault. Prize descents start equal, without these perks."
            : `Every character has a perk, and it works at ${Math.round(HOLD_FACTOR * 100)}% strength while you only hold it. Lock it at the Ember Altar to make it stronger over time. Mint more there, or find a Soul Sigil in a Sealed Vault.`}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Character">
            {heroChoices.map(({ choice, visual, key, away }) => {
              const active = isSelected(choice) || (!selectedValid && choice.kind === "wanderer");
              return (
                <button
                  key={key}
                  role="radio"
                  aria-checked={active}
                  aria-disabled={away || undefined}
                  disabled={away}
                  onClick={() => game.selectHero(choice)}
                  className={cn(
                    "group flex flex-col items-center gap-2 rounded-lg border bg-black/40 p-3 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-lime",
                    active ? "border-lime bg-lime/[0.07]" : "border-white/10 hover:border-white/30",
                    away && "cursor-not-allowed opacity-40",
                  )}
                >
                  <HeroAvatar portrait={visual.portrait} px={4} />
                  <span className="font-pixel text-[11px] leading-tight" style={{ color: visual.color }}>{visual.name}</span>
                  <span className="text-[10px] tracking-wide text-muted-foreground uppercase">{visual.subtitle}</span>
                  <span className="text-xs text-foreground/80">{visual.perk}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {campMode.crystals && (
          <Card className="border-gold/40 bg-gold/[0.06]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-pixel text-gold"><Coins className="size-4" /> Prize descent</CardTitle>
              <CardDescription>
                For real MUSD: everyone starts equal, and the gold you bring home takes its share of this week's Ember Pot on Mezo.
                A prize key costs 1 MUSD, or pay with BTC or MEZO.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full font-pixel" variant="secondary" onClick={() => useMezo.getState().setOpen(true)}>
                <Coins data-icon="inline-start" /> Open the Ember Pot
              </Button>
            </CardContent>
          </Card>
        )}

        {campMode.crystals ? (
          <Card>
            <CardHeader>
              <CardTitle className="font-pixel">Practice keys</CardTitle>
              <CardDescription>One key opens one practice descent. They are free: take more whenever you run low.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <KeyRound className="size-5 text-gold" />
                <span className="font-pixel text-2xl text-gold" aria-live="polite">{game.keys}</span>
                <span className="text-xs text-muted-foreground">practice keys</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => game.refillKeys()} disabled={game.keys >= PRACTICE_KEYS}>Top up to {PRACTICE_KEYS}</Button>
            </CardContent>
          </Card>
        ) : (
        <Card>
          <CardHeader>
            <CardTitle className="font-pixel">Entry keys</CardTitle>
            <CardDescription>
              One key opens one descent and is spent when you light the lantern. A key costs {usd(KEY_PRICE)} of simulated USDC, split like every other spend: {Math.round(ACTIVE_SHARE * 100)}% into this round's reward pool, {Math.round(LOCK_SHARE * 100)}% to the lock pool, {Math.round(REVENUE_SHARE * 100)}% to the studio.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <KeyRound className="size-5 text-gold" />
              <span className="font-pixel text-2xl text-gold" aria-live="polite">{game.keys}</span>
              <span className="text-xs text-muted-foreground">held (max {MAX_KEYS})</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => buyKeys(1)} disabled={game.balance < KEY_PRICE || game.keys + 1 > MAX_KEYS}>Buy 1 · {usd(KEY_PRICE)}</Button>
              <Button variant="outline" size="sm" onClick={() => buyKeys(5)} disabled={game.balance < KEY_PRICE * 5 || game.keys + 5 > MAX_KEYS}>Buy 5 · {usd(KEY_PRICE * 5)}</Button>
            </div>
          </CardContent>
        </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="font-pixel">Lantern oil</CardTitle>
            <CardDescription>
              {campMode.crystals ? "Oil is free in practice." : `Each flask costs ${usd(FLASK_PRICE)}.`} Each flask gives {FLASK_LIGHT} light. More light, wider vision. Finds drop a draw ticket {Math.round(drop * 1000) / 10}% of the time{pass ? ` (${PASSES[pass].name})` : ""}. Carry it home or lose it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" aria-label="Fewer flasks" onClick={() => game.setFlasks(game.flasks - 1)} disabled={game.flasks <= 1}><Minus /></Button>
                <span className="w-16 text-center font-pixel text-2xl text-lime" aria-live="polite">{game.flasks}</span>
                <Button variant="outline" size="icon" aria-label="More flasks" onClick={() => game.setFlasks(game.flasks + 1)} disabled={game.flasks >= MAX_FLASKS}><Plus /></Button>
              </div>
              <div className="text-right">
                <div className="font-pixel text-sm"><Price cents={cost} /></div>
                <div className="text-xs text-muted-foreground">{light} light{campMode.crystals ? "" : ` · ${usd(cost * (1 - REVENUE_SHARE))} back to players`}</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <Badge variant="outline"><ItemArt id={game.weapon} px={1} /> {weapon.name} ({weapon.damage} dmg)</Badge>
              {game.armor !== "none" && <Badge variant="outline"><ItemArt id={game.armor} px={1} /> {ARMORS[game.armor].name}</Badge>}
              {POTION_IDS.filter(id => game.potions[id] > 0).map(id => (
                <Badge key={id} variant="outline"><ItemArt id={id} px={1} /> {POTIONS[id].name} ×{game.potions[id]}</Badge>
              ))}
            </div>

            <Button size="lg" className="h-12 w-full font-pixel text-base" onClick={descend} disabled={cost > game.balance || game.keys < 1}>
              <Flame data-icon="inline-start" /> Light it and descend
            </Button>
            {game.keys < 1 && <p className="text-xs text-destructive">{campMode.crystals ? "No practice key. Take more above, they are free." : "No entry key. Buy one to descend."}</p>}
            {cost > game.balance && <p className="text-xs text-destructive">Not enough USDC. Grab a simulated top-up in the Vault.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
