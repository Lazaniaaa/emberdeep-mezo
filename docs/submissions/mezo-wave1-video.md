# Mezo Buildathon Wave 1 — 2-minute video script

Deadline: 2026-10-26, 17:00. Record the screen (OBS or Win+G), voice in English, ~120 s.
Built around the judging weights: Mezo integration 30%, product and business viability 30%, technical 20%, UX 10%, materials 10%.
Notes for the owner are in Ukrainian in square brackets.

| Time | Part | On screen | Voice |
| --- | --- | --- | --- |
| 0:00–0:15 | Problem | Title slide [слайд 1–2 презентації] | "BTC holders can mint MUSD on Mezo, but there is little fun to do with it. And most web3 games pay out through an inflating token, so early players win and the game dies." |
| 0:15–0:35 | Solution | Emberdeep descent: lantern, a fight, gold, rift exit [живий сайт або `npm run dev`, 15 с гри] | "Emberdeep is a roguelike where skill wins: light is your only resource, and you escape through a rift with the gold you found. Every run is replayed and signed by our server, so scores can't be faked." |
| 0:35–1:00 | How MUSD flows | Slide with the Ember Pot model [слайд зі схемою пулу] | "Players buy keys for 1 MUSD. 80% goes into this week's prize pot, 20% to the treasury. After the week anyone can call distribute, and the pot is split by gold carried out. There is no admin withdrawal: no token, no inflation, real MUSD." |
| 1:00–1:25 | Mezo integration, live | Ember Pot site on Mezo Testnet: buy a key with BTC → wallet confirm → success [купити 1 ключ наживо; у гаманці трохи тестового BTC] | "You don't even need MUSD first. Our EmberKeyRouter swaps BTC to MUSD through Tigris and buys the key in one transaction." |
| 1:25–1:40 | Proof | Mezo Testnet explorer: that transaction, then EmberPotV2 with the pot balance [показати tx і баланс пулу] | "Here it is on Mezo: one transaction, swap plus key. The router has no owner and no admin functions. The pot now holds the MUSD from that key." |
| 1:40–2:00 | Business and next | Roadmap slide [останній слайд] | "Revenue is the 20% treasury share, and it grows with every key. Next wave: server-recorded runs into the pot, and Delver NFTs with a MUSD marketplace. Emberdeep: bet your light, win real MUSD." |

Honest scope (say it if asked, don't hide it): the game and the pot are both live, but recording runs into the Mezo pot from the game server is the next step (Wave 2). The current scores go to the Hall of Descents on Arc.

Addresses (Mezo Testnet, chain 31611):
- EmberPotV2: `0xaf6d0eb582900417d635ff43348052b8cf68e3ea`
- EmberKeyRouter: `0xd261fc219ef4f48dde9a9ff0ede3a133c78c114e`
- MUSD: `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`
- Tigris BTC/MUSD pool: `0xd16A5Df82120ED8D626a1a15232bFcE2366d6AA9`
