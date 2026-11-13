# Mezo Buildathon Wave 2 — the 2-minute video

Deadline: 2026-11-15, 15:00 UTC (17:00 Kyiv). **Hard limit: 2:00 on the exported file.** In Wave 1 the judge cut
Materials for every video over 2:15, so the narration below is about 240 words (1:40 of calm ElevenLabs voice) and the
picture is planned to 1:58. Judging: Mezo integration 30%, product and business viability 30%, technical 20%, UX 10%,
materials 10%. Notes for the owner are in Ukrainian in square brackets.

[Перед записом: сайт і всі контракти Wave 2 мають бути живі. Якщо якогось кроку наживо показати не можна, викинь
відповідне речення з голосу, а не показуй макет: суддя звіряє відео з ланцюгом.]

## Narration (paste into ElevenLabs as one block)

Bitcoin holders on Mezo can borrow dollars without selling their Bitcoin. Emberdeep gives them a reason to: a game where skill wins real MUSD.

You go down a cave with a lantern. Light is your only resource. Bring gold home through the rift before the dark takes you.

A prize key costs one MUSD. No MUSD? Press one button. The game opens a Mezo trove, locks your Bitcoin as collateral, and borrows MUSD at a safe sixty-five percent. Your Bitcoin stays yours. Or pay with BTC or MEZO, swapped on Tigris in the same transaction.

Every prize descent starts with the same kit. Come home and press Claim. Our server replays every move and signs only the truth. The relayer records your gold in the pot and pays the gas.

Slay Cerberus, and the claimed descent earns a chest: a weapon, minted to your wallet as an NFT. One chest per pot record, so every chest cost a key.

Carry the weapon into your next descent, or list it at the Market. Buyers pay in MUSD, or in BTC or MEZO through Tigris. Five percent of every sale flows back into this week's pot.

When the week ends, the pot is paid out by gold, automatically. Nobody can withdraw it, us included.

In Wave one, the judges asked for troves inside the game, proof on chain, and a pitch deck. All shipped.

One loop, all on Mezo: borrow, play, win, trade. Emberdeep.

[Останній абзац перед «One loop» кажи лише про те, що справді зроблено на день запису. Якщо контракти
верифіковані й seed уже від сервера, можна замінити на: "…asked for troves inside the game, verified contracts,
server-issued seeds, proof on chain, and a pitch deck. All shipped." Це на 5 слів довше, у 2:00 влазить.]

## Second by second

Times are for the picture; let the voice breathe, it ends around 1:50. Cut on the voice, not on the clock, but the
exported file must stay under 2:00.

| Time | On screen | Voice |
| --- | --- | --- |
| 0:00–0:09 | The loop diagram from the deck (slide 2), title "Emberdeep on Mezo" over it [3 с], then the camp with the Ember Pot and Market cards in the corner | "Bitcoin holders on Mezo… skill wins real MUSD." |
| 0:09–0:19 | A descent, sped up 2x: lantern light shrinking, a fight with a windup dodged, gold picked up, the green rift | "You go down a cave… before the dark takes you." |
| 0:19–0:27 | Ember Pot window: the week's pot, timer, "From Market sales" line; hover the key price | "A prize key costs one MUSD. No MUSD? Press one button." |
| 0:27–0:40 | The borrow card: "≈0.045 BTC locked as collateral, 1,800 MUSD borrowed" → click **Borrow 1,800 MUSD on Mezo** → wallet confirm → "Borrowed on Mezo" with the loan transaction link. [Вставка 2 с: та сама позика на testnet.mezo.org/borrow, щоб було видно, що це trove самого Mezo] | "The game opens a Mezo trove… Your Bitcoin stays yours." |
| 0:40–0:46 | Back in the pot window: click **BTC** (or **MEZO**) to buy a key → "Keys bought · transaction" | "Or pay with BTC or MEZO, swapped on Tigris in the same transaction." |
| 0:46–0:52 | **Start a prize descent** → a few seconds of play at depth 7, Cerberus falls [заздалегідь записаний забіг, 3x] | "Every prize descent starts with the same kit." |
| 0:52–1:02 | The report: **Claim N gold** → "Checking every move…" → "Claimed" with the pot transaction link | "Come home and press Claim… pays the gas." |
| 1:02–1:14 | Right under it: **Open the chest** → the weapon appears (name, rarity, stats) → click **The NFT on Mezo**: the item's page on the explorer with its picture and traits | "Slay Cerberus… every chest cost a key." |
| 1:14–1:20 | **Carry it** → the pot window shows "Carrying … Change it in the Armory" | "Carry the weapon into your next descent," |
| 1:20–1:34 | Market: type a price, the row shows "You get … · … goes into the Ember Pot" → **List**. Cut to another wallet: a listing with "≈0.0002 BTC" on the button → buy with BTC → done | "or list it at the Market… through Tigris." |
| 1:34–1:40 | Ember Pot window again: the pot grew, "From Market sales: … MUSD this week" highlighted | "Five percent of every sale flows back into this week's pot." |
| 1:40–1:47 | The explorer: a `distribute` transaction with MUSD transfers to several wallets [виплата старого поту V2 або першого раунду V3, з PROOF.md] | "When the week ends… us included." |
| 1:47–1:54 | Deck slide "Wave 1 → Wave 2": the judge's points with ticks | "In Wave one, the judges asked… All shipped." |
| 1:54–1:58 | The loop diagram again, then the address of the site and the repo | "One loop, all on Mezo: borrow, play, win, trade. Emberdeep." |

## Before upload

- [ ] The exported file is **2:00 or shorter** (check the file's own duration, not the editor's timeline).
- [ ] Every transaction shown is real and its hash is in `docs/PROOF.md`.
- [ ] Nothing is said or shown that the live site cannot do today.
- [ ] Uploaded as public or unlisted, and it plays in a private window without signing in. (A private video counted
      as "no video" in Wave 1.)
- [ ] The link is in the AKINDO form, in the README, and on the last slide of the deck.
- [ ] This file stays in the repo as the video's script (the judge asked one team to commit theirs).

## Addresses to have at hand while recording (Mezo Testnet, chain 31611)

- EmberPotV3: TODO · EmberKeyRouter: TODO · EmberItems: TODO · EmberMarket: TODO
- Hall of Descents: `0x0fa55bd6f5a0c7831bc2fadbae90cb62b347bdd6`
- Mezo BorrowerOperations: `0xCdF7028ceAB81fA0C6971208e83fa7872994beE5`
- MUSD `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`, MEZO `0x7b7c…0001`, BTC `0x7b7c…0000`
- Site: TODO · Explorer: https://explorer.test.mezo.org · Faucet: https://faucet.test.mezo.org
