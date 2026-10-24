# Промпти для героїв, мобів і предметів (ChatGPT / Nano Banana)

Промпти англійською, бо так моделі розуміють точніше. Порядок роботи:

1. **Спершу еталон.** Згенеруй одного персонажа промптом 1 і прикріпи `reference-cat.png` (наш кіт 48×48) як зразок стилю.
   Коли вийде добре, саме цей результат прикріплюй до всіх наступних запитів: «Same style as the attached image». Так усі вийдуть однаковими.
2. **Nano Banana** (Gemini) краще тримає одного й того самого персонажа між правками, тож добре підходить для «тепер цей самий кіт у латах» і для кадрів анімації.
   **ChatGPT** краще тримає сітку (sprite sheet) і вміє прозорий фон.
3. **Пікселі в AI «несправжні»:** квадратики різного розміру, з розмиттям. Після генерації:
   зменшити до 48×48 з **Nearest Neighbor** (Aseprite: Sprite → Sprite Size; або безкоштовний Pixelorama / онлайн «pixel art downscaler»), потім підчистити зайві пікселі.
   Простіше, коли просиш модель малювати «on an exact 48x48 grid, upscaled 10x», тоді зменшуєш рівно в 10 разів.
4. **Готові аркуші** (5 кадрів × 4 напрямки на рожевому фоні) клади в `art/heroes/raw/<тваринка>.webp` і запускай `node scripts/sprite-sheets.mjs heroes`:
   він сам прибере фон, зменшить до ігрового розміру й покладе `public/heroes/<тваринка>.png`. Нову тваринку ще треба дописати в `src/game/animals.ts`.
---

## Стиль (цей блок вставляй у кожен промпт)

```
Pixel art game sprite, exactly 48x48 pixels, shown upscaled 10x with perfectly square pixels.
Chibi proportions: very big round head (about 60% of the height), small body, short stubby legs, standing upright on two legs.
A clean 1-pixel dark outline around every separate part (ears, head, clothes, paws, weapon), 3-tone shading with light from the top-left.
Big shiny eyes with a dark lid, two-tone iris, pupil and two white highlights; small pink nose, tiny "ω" cat-like mouth, pink blush on the cheeks.
Small details: fur strands, buckles, rivets, seams, cuffs. Limited palette, no anti-aliasing, no gradients, no blur, hard pixel edges.
Holds a short sword in its right paw (left side of the picture) and a small iron lantern with a lit flame in its left paw.
Cute fantasy dungeon-crawler hero. Plain flat magenta background (#FF00FF) for easy removal.
```

## 1. Один герой (еталон)

```
[STYLE BLOCK]
Front view, facing the viewer.
Character: a tuxedo cat (black fur, white muzzle, white blaze between the eyes, white paws, white tail tip), cyan eyes,
wearing a short teal robe with gold trim down the front, a small gold star on the chest, a brown leather belt with a gold buckle and a pouch, dark boots.
```

## 1б. Кіт, який виглядає як кіт (після першої спроби)

Перша спроба з прикріпленим `reference-cat.png` майже скопіювала наш малюнок, а голова «смокінга» з білим трикутником читалась як гібрид кота й миші.
Тут **без** прикріпленого зразка, з явними котячими рисами й іншим забарвленням:

```
Pixel art game sprite of a cute chibi cat hero, exactly 48x48 pixels, shown upscaled 10x with perfectly square pixels, front view, standing on two legs.
Make it clearly a CAT, not a mouse or a bear:
- head wider than tall, slightly flat on top, with fluffy cheek tufts sticking out at the lower sides of the head (classic cat face silhouette)
- two big TRIANGULAR pointed ears at the top corners of the head, set wide apart, pink inside with small tufts of fur
- big almond-shaped eyes with vertical slit pupils and white highlights
- a small pink triangle nose, a tiny "w" mouth, whisker pads with 2-3 thin whiskers on each side
- tabby markings: an "M" on the forehead and stripes on the cheeks
Fur: orange ginger tabby with a cream muzzle and chest.
Proportions: head about 55% of the height, small body, short legs, little paws.
Outfit: short teal adventurer's tunic with gold trim, brown leather belt with a buckle and a pouch, small dark boots.
Holds a short sword in its right paw (left side of the picture) and a small iron lantern with a lit flame in its left paw. A striped tail curls up behind it.
Style: 1-pixel dark outline around every part, 3-tone shading with light from the top-left, limited palette, no anti-aliasing, no gradients, no blur, hard pixel edges.
Plain flat magenta background (#FF00FF).
```

Щоб вибрати забарвлення, додай у кінець:

```
Make 4 versions side by side, same pose and outfit, different coats:
1 orange ginger tabby, 2 grey tabby, 3 calico (white with orange and black patches), 4 siamese (cream body, dark brown face, ears, paws and tail, blue eyes).
```

**Затверджено власником (2026-10-06):** рудий таббі — `approved-cat.webp`. Це тепер еталон стилю: прикріплюй його до всіх наступних запитів.

## 1в. Пес (на вибір замість кота)

Прикріпи `approved-cat.webp`:

```
Same style, size, pose, outfit and pixel density as the attached cat, but make it a DOG instead of a cat.
Make it clearly a DOG:
- a short rounded snout that sticks out a little from the face, a big black nose with a white highlight, a happy open mouth with a small pink tongue
- triangular ears with rounded tips set on top of the head
- round friendly eyes with white highlights, small cream "eyebrow" dots above the eyes
- cream cheeks, muzzle and chest
- a fluffy tail curled over its back
Fur: shiba inu, red-orange with cream markings.
Keep the teal tunic with gold trim, the belt with buckle and pouch, the boots, the sword in its right paw and the lantern in its left paw exactly the same.
Plain flat magenta background (#FF00FF).
```

Варіанти породи — допиши в кінець:

```
Make 4 versions side by side, same pose and outfit:
1 shiba inu (red-orange and cream), 2 corgi (orange and white, big upright ears), 3 husky (grey and white, blue eyes), 4 beagle (brown, black and white, long floppy ears).
```

**Затверджено власником (2026-10-06):** усі 4 пси — `approved-dogs.webp` (шиба, коргі, хаскі, бігль).

## 1г. Чотири коти (як пси)

Прикріпи `approved-cat.webp` і `approved-dogs.webp`:

```
Same style, size, pose, outfit, layout and pixel density as the attached images (one cat, four dogs).
Make 4 CATS side by side, arranged exactly like the four dogs, all wearing the same teal tunic with gold trim, the belt with buckle and pouch and the boots, with the sword in the right paw and the lantern in the left paw.
Each must clearly read as a cat: head wider than tall with fluffy cheek tufts, big triangular pointed ears, almond-shaped eyes with vertical slit pupils and white highlights, a small pink triangle nose, a tiny "w" smile, whiskers, a long tail curling up behind.
1 orange ginger tabby with an "M" on the forehead and green eyes (exactly like the attached cat),
2 grey silver tabby with dark stripes and yellow eyes,
3 calico: white with orange and black patches, amber eyes,
4 siamese: cream body with a dark brown face mask, ears, paws and tail, blue eyes.
Plain flat magenta background (#FF00FF).
```

## 1д. Коти різних порід (силуети різні, не лише колір)

Пси вийшли трохи однаковими: та сама голова, лише інший колір. Тому тут кожна порода має свою форму голови, вух і хутра.
Прикріпи `approved-cat.webp` і `approved-dogs.webp`:

```
Same style, size, pose, outfit, layout and pixel density as the attached images.
Make 4 CATS of very different breeds side by side, each with its OWN head shape, ears, fur length and silhouette (not just a recolor of one cat).
All wear the same teal tunic with gold trim, the belt with buckle and pouch and the boots, with the sword in the right paw and the lantern in the left paw.
1 Maine Coon: big and fluffy, brown tabby, long lynx tufts on the tips of its ears, a thick fur ruff around the neck, a huge bushy tail, green eyes.
2 Scottish Fold: very round chubby face, small ears folded down flat against the head, huge round copper eyes, short blue-grey plush fur.
3 Sphynx: hairless, pink-beige skin with a few wrinkles on the forehead, giant wide bat-like ears, big lemon-green eyes, a thin whip-like tail.
4 Siamese: slim, wedge-shaped face, large pointed ears, cream body with a dark brown face mask, ears, paws and tail, bright blue eyes.
Plain flat magenta background (#FF00FF).
```

Якщо захочеш перегенерувати псів так само, заміни список порід на: pug (flat wrinkled face, curly tail), poodle (curly fluffy fur, pom-pom ears), dachshund (long body, long floppy ears), french bulldog (bat ears, squished face).

## 2. Усі сім класів (аркуш)

```
[STYLE BLOCK]
Character sheet: 7 different heroes in one row, same style, same size and same pose (front view), each in its own 48x48 cell, evenly spaced.
1. Wanderer: small grey mouse with big round pink-lined ears, simple brown jacket, no hat.
2. Prospector: brown bear cub with round ears, yellow miner's helmet with a headlamp, blue overalls.
3. Seer: tuxedo cat (black, white muzzle and paws), glowing cyan eyes, teal robe with gold trim, pointed teal wizard hat with a gold star.
4. Lamplighter: orange fox with white cheeks and a big fluffy white-tipped tail, black top hat with a red band, dark purple coat with brass buttons.
5. Pathfinder: white rabbit with long upright ears poking through a green ranger cap with a white feather, green tunic, leather belt.
6. Duelist: black-and-tan shiba inu dog with a curled tail, steel helmet with small horns and holes for its ears, blue tunic.
7. Scavenger: grey raccoon with a dark eye mask and a striped tail, brass goggles on its forehead, olive jacket with pouches.
```

## 3. Обладунки (на одному персонажі, щоб вибрати)

```
[STYLE BLOCK]
Same tuxedo cat as the attached image, front view, in 12 different armour sets, arranged in a 4x3 grid, each in its own 48x48 cell, same pose:
1 leather (leather cap, jerkin with shoulder pads, belt pouch),
2 chain mail (mail coif around the face, ears poking out),
3 knight plate (open-face steel helmet with cheek guards, rivets and a red feather plume, ears through holes in the helmet, round pauldrons, blue tabard),
4 ember plate (black obsidian plate with glowing orange cracks, flame-shaped horns on the helmet),
5 samurai (black kabuto helmet with a gold crescent, red lacquered plates),
6 viking (iron cap, fur mantle on the shoulders),
7 paladin (white winged helmet, gold pauldrons, gold cross on the chest),
8 assassin (dark hood with cat ears, scarf mask over the lower face),
9 crystal (cyan crystal plates and a crystal tiara),
10 dark knight (black spiked plate, closed helmet with a glowing red eye slit),
11 royal (gold crown with gems, ermine collar, red cape),
12 mage (long starry robe and a tall pointed hat).
Keep the face visible except for the dark knight.
```

Готові ідеї обладунків, які ми вже малювали, є в `armor-ideas.png`.

## 4. Аркуш анімації (для гри)

Робиться **окремо для кожного героя**, з прикріпленим еталоном цього героя.

```
[STYLE BLOCK]
Sprite sheet of the attached character, a grid of 5 columns x 4 rows, each cell exactly 48x48 pixels, no gaps, no labels, the feet on the same baseline in every cell.
Rows: 1 facing down (toward the viewer), 2 facing left, 3 facing right, 4 facing up (back view).
Columns: 1 idle, 2 walk step (left foot forward), 3 walk step (right foot forward), 4 sword wind-up (sword raised behind the head), 5 sword strike (sword swung forward, body leaning into the blow).
The sword is ALWAYS in the right paw and the lantern in the left paw: do not mirror left and right.
Seen from the left the sword is behind the body; seen from the right it is in front.
```

## 5. Обладунок на конкретного героя (правка в Nano Banana)

```
Same character as the attached image, same pose, same style and palette, but now wearing [NAME OF THE ARMOUR SET from prompt 3].
Keep the face, ears and tail exactly the same.
```

---

Порада: якщо модель «з'їжджає» зі стилю, повтор фразу `no anti-aliasing, hard pixel edges, perfectly square pixels` і зменш кількість персонажів в одному запиті.

---

# Моби (2026-10-06)

Власник: «мінімалізм, і щоб підходили під тему підземелля», і можна **нових мобів**.
Поведінку в грі не міняємо (хто б'є хрестом навколо себе, хто лінією вперед, хто не рухається, хто швидкий): змінюються тільки вигляд і назва.
Внутрішні id у коді лишаються старими (`src/game/enemies.ts`), тож сейви й перевірка рекордів не ламаються.

| Новий моб | Замість (id) | Як б'є в грі |
| --- | --- | --- |
| Воскова свічечка (Waxling) | `wickgnaw` | слабкий, кусає все навколо себе (хрест, 1) |
| Печерний павук | `snaretoad` | повільний, стріляє павутиною на 3 клітинки лінією, замах 2 ходи |
| Печерний міль (Lantern Moth) | `cinder-hound` | швидкий, пікірує на 3 клітинки лінією |
| Скелет-лучник | `chaincoil` | не рухається, стріляє на 4 клітинки лінією |
| Блукаючий вогник (Wisp) | `needle-wraith` | крихкий і швидкий, кидає іскру на 3 клітинки |
| Кам'яний голем | `sootplate` | броньований, 2 ходи замаху, б'є навколо себе |
| Краб у черепі (Skull Crab) | `hollow-burrower` | вистрибує поруч і кусає навколо себе |
| Гриб-спороносець | `fourfold-bell` | випускає спори в 4 боки на 2 клітинки |
| Біс (Imp) | `rift-leaper` | дуже швидкий, стрибає на 3 клітинки лінією |
| Цербер (бос) | — | лишається |

У грі моби дивляться **вправо** (вліво гра віддзеркалює сама) і мають 4 кадри: стоїть, рух, замах, удар.

## М1. Усі моби одним рядком

Прикріпи одного з героїв, наприклад `characters/cat-ginger-tabby.png`, щоб збіглись стиль і розмір:

```
Pixel art game sprites for a dark dungeon crawler, the same pixel density, outline and shading as the attached hero (a cat in a teal tunic).
Minimalist classic dungeon monsters: a simple, instantly readable silhouette, 2-3 main colours plus a 1-pixel dark outline, one small glowing accent (eyes, embers or runes), no text.
Colours chosen to stand out on a dark stone floor. Cute-creepy, not gory.
Side view, every monster facing RIGHT, each noticeably smaller than the hero (about 50-75% of its height; the slime, wisp and bat are the smallest, the golem the biggest).
A lineup of 9 monsters in one row, evenly spaced, all on the same baseline:
1 Slime: a small translucent green slime blob with two dot eyes.
2 Cave Spider: a dark purple spider with a round body and a few glowing red eyes.
3 Bat: a small brown-black bat with spread wings and pointy ears, hovering.
4 Skeleton Archer: a short chibi skeleton holding a small bow, bone white with dark eye sockets.
5 Wisp: a floating ball of pale blue fire with a small face.
6 Stone Golem: a chunky grey stone golem with moss on its shoulders and glowing rune eyes.
7 Mimic: a wooden treasure chest with a toothy mouth and a tongue, on little legs.
8 Spore Shroom: a walking red-capped mushroom with white spots and tiny feet.
9 Imp: a small red imp with little horns, bat wings and a pointed tail.
Plain flat magenta background (#FF00FF).
```

**Затверджено (2026-10-06):** рядок `mobs-lineup-v1.webp` — павук, скелет-лучник, вогник, голем, гриб, біс.
Слиз, кажана й скриню-міміка власник прибрав: надто схожі на OCH. Поведінку лишаємо, вигляд новий (М1б).

## М1б. Три нові замість слизу, кажана й міміка

Прикріпи `mobs-lineup-v1.webp`:

```
Same style, pixel density, outline, palette and scale as the attached lineup of monsters.
Make 3 NEW monsters in one row, evenly spaced, same baseline, side view facing RIGHT. They must not look like slimes, bats or treasure-chest mimics.
1 Waxling (about the size of the green slime in the lineup): a small living stub of melted candle wax, a tiny flame burning on its head, two dot eyes, drips of wax for feet.
2 Lantern Moth (about the size of the bat): a dusty grey-brown cave moth hovering, big fuzzy wings with two glowing orange eye-spots, feathery antennae.
3 Skull Crab (about the size of the chest): a small hermit crab living in a cracked old skull as its shell, two claws out, eyes on stalks.
Plain flat magenta background (#FF00FF).
```

## М2. Анімація одного моба

Виріж моба з рядка М1 і прикріпи **тільки його**. У промпті заміни `[ЗАМАХ]` і `[УДАР]` рядком із таблиці нижче.

```
Sprite strip of the attached monster, same style, palette, size and pixel density.
4 frames in one row, no gaps, no labels, the same baseline in every frame, always facing RIGHT, everything inside its frame:
1 idle, 2 moving (a step, a hop or a flap), 3 wind-up: [ЗАМАХ], 4 attack: [УДАР].
Plain flat magenta background (#FF00FF).
```

| Моб | [ЗАМАХ] | [УДАР] |
| --- | --- | --- |
| Waxling | its flame flares up, body squashes down | springs forward, dripping wax |
| Cave Spider | rears up on its back legs | shoots a strand of web forward |
| Lantern Moth | pulls its wings up high | dives forward, wings swept back |
| Skeleton Archer | draws the bow | releases the arrow forward |
| Wisp | flickers brighter and shrinks | throws a small spark forward |
| Stone Golem | raises both fists overhead | slams the ground with a shockwave |
| Skull Crab | hides inside the skull, claws raised | pops out snapping both claws |
| Spore Shroom | the cap puffs up | bursts a cloud of spores around it |
| Imp | crouches, wings spread | leaps forward, claws out |

## М3. Бос — Цербер (за бажанням)

```
Same style and pixel density as the attached images. Boss monster: Cerberus, a three-headed hound of the deep, about twice the hero's height,
dark purple-grey fur, glowing red eyes, a mane of small flames along its back. Minimalist, readable silhouette, 1-pixel dark outline.
Side view facing RIGHT. 4 frames in one row, same baseline: 1 idle, 2 step, 3 wind-up (the heads rear back), 4 attack (all three heads lunge, the flames flare).
Plain flat magenta background (#FF00FF).
```

Готові смужки клади в `art/mobs/raw/<id>.webp` і запускай `node scripts/sprite-sheets.mjs mobs`, де id — старий id з таблиці вгорі (наприклад, слиз — `wickgnaw.webp`; Цербер має окремий конвеєр `bosses`, див. M3b).

---

## Виправлення очей на аркушах героїв (2026-10-06)

Прикріпи оригінальний аркуш героя (`art/heroes/raw/<герой>.webp`) і встав промпт, замінивши `[ОЧІ]` рядком з таблиці.

```
Edit the attached sprite sheet. Keep EVERYTHING exactly the same: the grid of 5 columns x 4 rows, every pose, the outfit, the sword, the lantern, the colours, the size and the magenta background. Change ONLY the eyes.
In every frame where the face shows, both eyes must be identical to each other and the same in every frame: [ОЧІ].
Each eye: a dark outline, a solid iris, a dark pupil and one small white shine in its top-left corner, the shine on the same side in both eyes. Both eyes the same size and shape, level with each other, open and round (not narrow, not flat).
In side-view frames the one visible eye is drawn the same way.
```

| Герой | [ОЧІ] |
| --- | --- |
| Рудий таббі | broad round green eyes with a round black pupil and a friendly expression |
| Мейн-кун | big round green eyes with a vertical black pupil |
| Шотландська висловуха | big round amber-orange eyes with a round black pupil |
| Коргі | round shiny dark brown, almost black eyes |
| Хаскі | round bright blue eyes with a round black pupil |

Оновлення 2026-10-07: очі більше не перемальовуються скриптом. `PLAIN`, `sameEyes` і `paintEyes` видалені; ігрові PNG мають щільність 2× (клітинка 128×112, аркуш 640×448) при незмінному логічному розмірі героя. Спершу перенось новий оригінал через `node scripts/sprite-sheets.mjs heroes <герой>` і дивись у грі. Задні кадри котів і корекція кінчика хвоста рудого ще прив'язані до старих картинок — після заміни оригіналу перевір їх окремо.

### Округлі очі рудого таббі та хаскі (2026-10-07)

Власник попросив прибрати тонкі очі й непривітний вираз у цих двох героїв. Застосовано вбудований `image_gen`:
ширші округлі зелені/блакитні райдужки, круглі темні зіниці, маленькі білі відблиски; усе інше збережено.
Точні промпти й результати: [art/heroes/eye-edits/2026-10-07](../../art/heroes/eye-edits/2026-10-07/README.md).
Із згенерованих аркушів перенесено лише 20 ділянок очей на кожного героя; пікселі джерела поза ними незмінні.
Оновлені джерела вже в `art/heroes/raw/`, ігрові PNG — у `public/heroes/`.
Старі джерела збережені в `art/heroes/eye-edits/2026-10-07/originals/`.
Для цих двох героїв більше не просити вертикальні зіниці: власник обрав округлий, дружній вираз.

---

# Предмети й лут (2026-10-10)

Власник: «глечики й інші предмети, з яких падає лут, мають бути як мінімум рівня мобів і героїв, а не 2D-фігня».
Зараз вони намальовані кодом (16×16). Гра вже вміє брати AI-арт: щойно з'являється файл, вона малює його, а поки файлу немає — старий спрайт.

| Що | Файл | Розмір у грі (висота) |
| --- | --- | --- |
| Глек (Clay Urn) | `art/props/raw/urn.webp` | 20 px |
| Ящик (Wooden Crate) | `art/props/raw/crate.webp` | 20 px |
| Бочка (Iron-bound Barrel) | `art/props/raw/barrel.webp` | 24 px |
| Старий мішок (Old Sack) | `art/props/raw/sack.webp` | 18 px |
| Лут і скрині одним рядком | `art/props/raw/loot.webp` | золото 12, кристал 16, олія 16, скриня 18, Sealed Vault 22, скриня Цербера 24 |

Для порівняння: герой 42 px, найменший моб 20, голем 36. Предмети стоять на клітинці підлоги 32×32, вигляд **спереду й трохи згори** (як герої), не збоку.

**Затверджено (2026-10-11):** глек, ящик і бочка з `docs/art/props-lineup-v2.webp`, мішок з `props-lineup-v1.webp` (замість купи кісток: власник — «кістки дивно виглядають, хай будуть просто інтер'єром»).
Вирізані з них кадри «ціле» вже в `art/props/raw/` і в грі (щільність 2×, як у героїв). Для П2 прикріплюй саме їх.

Порядок: **П1** (усі чотири разом, щоб вибрати вигляд) → **П2** для кожного затвердженого (3 кадри) → **П3** (лут і скрині).
Готові картинки клади у `art/props/raw/` під іменами з таблиці і запускай `node scripts/sprite-sheets.mjs props`:
скрипт прибере фон, зменшить і покладе `public/props/<ім'я>.png`. Після цього перезавантаж гру.

## П1. Чотири предмети одним рядком

Прикріпи `docs/art/mobs-lineup-v2.webp` і `docs/art/characters/cat-ginger-tabby.png`, щоб збіглись стиль, щільність пікселів і масштаб:

```
Pixel art game sprites for a dark dungeon crawler, the same pixel density, 1-pixel dark outline, 3-tone shading with light from the top-left and limited palette as the attached hero and monsters.
Breakable dungeon props, NOT characters: no faces, no eyes, no legs.
A lineup of 4 props in one row, evenly spaced, all on the same baseline, seen from the front and slightly from above (3/4 view), each with a small dark contact shadow:
1 Clay Urn: a round terracotta urn with a narrow neck and a rolled lip, two painted ochre bands, a small chip on the rim. About half the hero's height.
2 Wooden Crate: a square wooden crate, plank seams, darker diagonal cross-brace, iron corner brackets with nails. About half the hero's height, wider than the urn.
3 Iron-bound Barrel: a stout oak barrel, two dark iron hoops with rivets, a bung hole on the side. About 60% of the hero's height.
4 Bone Pile: a low heap of old bones with a cracked skull on top and a rusty coin peeking out between them. About a third of the hero's height.
Rich materials and small details (wood grain, glaze cracks, rivets, worn edges), colours that read clearly on a dark teal stone floor. No text, no glow.
Plain flat magenta background (#FF00FF).
```

## П2. Смужка одного предмета (3 кадри)

Виріж затверджений предмет із П1 і прикріпи **тільки його**. Заміни `[ПРЕДМЕТ]`, `[УШКОДЖЕННЯ]` і `[РОЗЛАМ]` рядком із таблиці:

```
Sprite strip of the attached [ПРЕДМЕТ], same style, palette, size and pixel density.
3 frames in one row, no gaps, no labels, the prop in the same place and on the same baseline in every frame:
1 whole, exactly as attached.
2 damaged: [УШКОДЖЕННЯ]. Same size and outline as frame 1.
3 breaking apart: [РОЗЛАМ], a few pieces flying outward a little and a puff of dust, everything staying inside its own frame.
Plain flat magenta background (#FF00FF).
```

| Предмет | [ПРЕДМЕТ] | [УШКОДЖЕННЯ] | [РОЗЛАМ] |
| --- | --- | --- | --- |
| Глек | clay urn | a big crack running down the body and a missing chip at the lip | the urn bursting into curved terracotta shards |
| Ящик | wooden crate | a split plank and a loose, bent corner bracket | the planks splitting apart, splinters and a nail flying |
| Бочка | iron-bound barrel | a dented hoop and a cracked stave | the staves falling outward, a hoop springing loose |
| Мішок | burlap sack | a rip in the side with a few coins peeking out | the sack tearing open, coins and scraps of cloth flying |

## П3. Лут і скрині одним рядком

Прикріпи затверджений рядок П1:

```
Same style, pixel density, outline and palette as the attached props.
Six loot items in one row, evenly spaced, same baseline, seen from the front and slightly from above, each with a small dark contact shadow, left to right:
1 a small pile of gold coins (the smallest, about a quarter of the urn's height), bright yellow with one white glint;
2 a cluster of three cyan crystals, faint inner glow;
3 a small glass oil flask with a cork, lime-green oil inside;
4 a small wooden treasure chest with brass trim and a keyhole (closed);
5 a Sealed Vault: a heavy grey stone coffer with a purple glowing rune lock, a bit bigger than the chest;
6 the Cerberus Hoard: a dark iron chest wrapped in chains, an orange-glowing seam under the lid and two small flames on top, the biggest of the six.
Plain flat magenta background (#FF00FF).
```

Скрипт сам розріже рядок на шість клітинок (за проміжками між предметами) і зменшить кожну до її висоти з таблиці вгорі, тож однаковий розмір на картинці не потрібен.

**Затверджено (2026-10-11):** `art/props/raw/loot.webp` (промпт вище, але «no shadows» замість контактної тіні).

## П2б. Довша анімація: 6 етапів (2026-10-11)

Власник: «ахірена анімація вийде, можна навіть розбити на 5-6 етапів». Гра й скрипт розуміють смужку з 1, 3 або 6 кадрів:
**6 = ціле, 2 стадії тріщин, 3 стадії розламу.** Тріщини гра показує за тим, скільки ударів лишилось (друга — коли взято половину або більше: ящик після першого з двох), розлам програється за ~0,56 с.

**Затверджено (2026-10-11):** глек і ящик (6 кадрів). Для предмета з одним кадром (`props-lineup-v2.webp`) — промпт нижче, але «the wooden crate from the attached image (the second prop from the left)» замість 3-кадрової смужки.
Прикріпи готову 3-кадрову смужку цього предмета (`art/props/raw/<предмет>.webp`):

```
Make a longer version of the attached 3-frame sprite strip of a [ПРЕДМЕТ]: 6 frames in one row, the same style, palette, size, pixel density and baseline; no gaps, no labels:
1 whole: the same as frame 1 of the attached strip.
2 a small crack: between frame 1 and frame 2 of the attached strip.
3 badly damaged: the same as frame 2 of the attached strip.
4 starting to break: the cracks open up, the first chips flying off, the [ПРЕДМЕТ] still mostly standing.
5 bursting apart: the same as frame 3 of the attached strip.
6 the pieces lying low on the floor, a fading puff of dust.
Everything stays inside its own frame. Plain flat magenta background (#FF00FF).
```

## Л1. Лоббі як підземний табір (2026-10-13)

Власник: лоббі має виглядати «+- як печера», усі локації (Dungeon Gate і будиночки) лишаються, але в темі; стару схему
тримати не обов'язково, «можна трохи логічніше розкидати». Тож розкладка нова, за змістом: зайшов знизу з поверхні → табличка
з поясненнями → вогнище посередині → ворота вниз у глибині. Гра візьме картинку фоном, як карти поверхів
(`art/maps/painted/depth-0X.webp`, тепер лише архів), а клітинки будівель, стіни й вода підганяються під неї. Теперішнє лоббі для порівняння:
`docs/art/lobby-layout-now.png`.

Прикріпи `art/maps/painted/depth-01.webp` (стиль печери, архів):

```
Top-down pixel-art game map (seen from above at a slight angle), the same style, palette and pixel density as the attached cave floor. Wide 3:2 landscape, the whole map in frame, no text, no labels, no UI, no characters.

The place: Emberdeep Camp, a lit camp inside a huge underground cavern, the last safe place before the descent. Dark rough rock walls all around, glowing cyan crystal clusters, a dark underground pool or two, patches of glowing moss and pink mushrooms, worn stone-slab paths linking everything.

Layout, from the bottom to the top, the way a visitor walks:
- bottom centre: a narrow tunnel coming in from the surface, with daylight-blue light at its mouth; right beside it, Welcome Board: a wooden signpost with a glowing cyan question-mark sign;
- centre: a round stone plaza with a big campfire, the heart of the camp, with room to walk around it;
- left side, the quiet mystic corner among crystals: Ember Altar (a stone altar with a floating magenta ember crystal) and, near it, Hall of Delvers (a small stone shrine with a crowned statue and trophy plaques, lavender glow);
- right side, the trade corner: Armory (a small blacksmith's stall with an anvil, a weapon rack and a glowing forge), and near it Vault (a heavy round gold-trimmed vault door set into a boulder) and Draw Board (a wooden notice board with pinned tickets and a small prize wheel);
- top centre, at the back of the cavern, the deepest point: Dungeon Gate, a big stone arch carved into the rock wall, stairs going down into darkness, a lime-green glow inside, a torch on each side, a wide path leading up to it from the plaza.
Each building is about two map squares wide, faces the viewer, stands in its own small open space and is easy to tell apart by its own colour of glow. Warm firelight in the middle, the edges of the cavern darker.
```

## L2. Modular low stone curbs for the lobby (2026-10-15)

Status: implemented locally (2026-10-15). Owner source: Pixel Art Stone Curb Tile Set.png; lossless copy at `art/lobby/sprites/curbs.webp`, game atlas at `public/lobby/curbs.png`. Decorative placement and browser QA are complete; see `docs/screenshots/camp-curbs-whole.png`.

Attach `art/lobby/sprites/buildings.webp` as the style reference and `public/maps/camp-ground.webp` as the paving/palette
reference. Generate a **single row of six separate sprites**, not a new map. Supply a PNG or lossless WebP with a solid
magenta background; the accepted source will go to `art/lobby/sprites/curbs.webp`.

```text
Create a modular LOW STONE CURB sprite row for Emberdeep, a pixel-art cave game. Match the pixel density, dark outlines,
stone texture and muted blue-grey/violet palette of the attached buildings; use the cave image only as a paving reference.
This is a narrow raised border beside a path, like a low Minecraft stone edging, only ankle-high beside a 42-pixel hero.

Use the same straight-on orthographic game view as the building fronts, with a small visible top surface. No isometric
projection, diagonal recession, camera rotation or vanishing point. Every piece runs exactly along horizontal or vertical
screen axes and fits a virtual 32 x 32 game-pixel tile. The stone strip is about 6 game pixels thick, including a small
2-pixel dark raised lip. Keep identical thickness, scale, material and join cross-sections in every piece.

ONE horizontal row of exactly SIX isolated sprites, left to right:
1. Horizontal straight: 32 pixels long and about 8 pixels high overall; flat open join at BOTH left and right ends.
2. Vertical straight: 32 pixels long and about 6 pixels wide; flat open join at BOTH top and bottom ends.
3. Outer convex right-angle corner: an L fitting a 32 x 32 tile, along its top and left edges, square outside bend,
   open joins at the right end of the top arm and the bottom end of the left arm. Empty interior stays magenta.
4. Inner concave right-angle corner: a matching L-shaped return for a recessed path corner, with a clearly concave
   inside bend; same arm lengths, thickness and open join profiles. Empty interior stays magenta.
5. Horizontal end piece: same length and thickness as piece 1, open join at the LEFT, neatly capped at the RIGHT.
6. Vertical end piece: same length and thickness as piece 2, open join at the TOP, neatly capped at the BOTTOM.

Make these reusable joining modules, not six decorative piles of rocks. Straight pieces must repeat seamlessly: no
endcaps, flared ends or overhanging stones at their open joins. Use a few subtle block seams and small chips; keep the
silhouette straight and readable. No moss or props spilling beyond the strip. No ground slabs filling the corners.

Wide landscape canvas, about 3:1, equal-width invisible cells, every sprite fully inside its own cell, bottoms aligned,
generous empty gaps between sprites. Render the virtual pixels enlarged crisply with nearest-neighbour edges. Do not
draw cell borders or labels. Entire background and every empty hole: perfectly flat #FF00FF, no gradient, no texture,
no cast shadow, glow, magenta reflections or antialiasing. No characters, buildings, scene, UI, text or numbers.
```

Integration plan used (completed 2026-10-15):

- Extend the existing `lobby` variant in `scripts/sprite-sheets.mjs` with a six-cell `curbs` row in the order above.
  Target heights are 8 / 32 / 32 / 32 / 8 / 32 world pixels; inspect the actual joins and adjust crop/anchors to exactly
  32-pixel spans without stretching the stone thickness. Keep the existing 224 x 208 lobby cells and foot convention.
- Cut with `node scripts/sprite-sheets.mjs lobby curbs`; do not regenerate unrelated rows. Review enlarged joins first.
- Put curb placements in a separate table in `src/game/camp-art.ts`, aligned to the 32-pixel grid. Keep them decorative:
  do not add them to solid `CAMP_OBJECTS` or change `CAMP_GROUND`/`CAMP_WALK_MAP`. Leave visible openings at path junctions,
  plaza entrances and every building door; do not draw a curb across a traversable entrance.
- After integration: typecheck, tests, build, lint and desktop/phone `camp-smoke.mjs`, plus an image of the whole lobby.

## L3. Straight benches and a west-facing Vault (2026-10-15)

The owner asked the assistant to redraw the benches and turn the Vault toward the campfire. Generated with the built-in `image_gen` tool, then saved losslessly in the project. Only these two new rows are cut; the approved original buildings and furniture rows remain unchanged.

### Bench row

Source: `art/lobby/sprites/benches.webp`; atlas: `public/lobby/benches.png`. Reference: `art/lobby/sprites/furniture.webp` (wood palette/style only). Order: horizontal, vertical; heights: 26, 72 world pixels. Cut: `node scripts/sprite-sheets.mjs lobby benches`.

```text
Use case: stylized-concept. Asset type: production pixel-art lobby sprite sheet for Emberdeep, two views of the SAME backless wooden camp bench. Reference image: the existing furniture row is ONLY a reference for wood palette, dark outlines, pixel density and fantasy cave-game style. Create a NEW TWO-SPRITE ROW: left half a horizontal bench; right half a vertical bench. Flat solid magenta #FF00FF background everywhere outside the sprites, no ground, no cast shadows, no text or labels. The bench has two golden-brown wooden seat planks, dark brown sturdy legs, small iron nails, lightly worn wood. LEFT bench: perfectly straight east-west rectangular seat, long edges exactly horizontal, short edges exactly vertical, front legs descend vertically, no diagonal tilt, long axis at precisely 0 degrees. RIGHT bench: seen slightly from overhead with its long axis exactly north-south on the ground, two long seat planks running vertically, rectangular footprint, short top and bottom edges horizontal, legs extend downwards in screen space. This is a flat orthographic top-down RPG view, NOT isometric, NOT diagonal. Both benches must be clearly recognizable as matching backless benches, naturally scaled in the same game; left overall width-to-height approximately 2.5:1, right overall width-to-height approximately 0.4:1. Each sprite isolated with generous magenta space around it, full legs visible. Coarse crisp pixel clusters, limited warm brown palette, dark outline, no antialiasing, no smooth illustration. Do not include the reference campfire, crates, barrel, chair or tent. Only two benches.
```

### Vault, entrance facing the plaza on the left

Previous source: `art/lobby/raw/vault-three-quarter-v1.webp` (147 world pixels tall). Superseded by the grid-aligned L4 view below. Reference: the original Vault cropped from `art/lobby/sprites/buildings.webp`.

```text
Use case: precise-object-edit. Asset type: single production pixel-art building sprite on magenta. Edit target: the reference round gold-trimmed stone vault. Repaint this SAME vault so its entrance FACES WEST (LEFT in the image), toward a plaza on the LEFT of the building. The attached sprite currently faces SOUTH toward the bottom of the image; change its world orientation, do not rotate the bitmap or turn it upside down. Camera remains the fixed slightly-overhead orthographic camera of a 2D top-down dungeon RPG. The wall/entrance plane runs north-south on the ground; vault doorway, short stairs and access landing are on the LEFT edge of the building; the solid stone backing extends to the RIGHT. Keep the large closed circular blue steel safe door, golden lock wheel and trim, matching blue-grey stone arch, warm amber lanterns and a few gold bars. Make the round safe door recognizable in the west-facing perspective with a vertically elongated visible door ellipse, and the stair tread edges north-south leading outward to the LEFT. All upright stones, hanging lanterns and vertical structures remain upright. Compact almost square ground footprint, no diagonal/isometric alignment to the map grid, straight north-south and east-west ground edges, no diamond platform. Preserve the same crisp coarse pixel-art style, pixel density, blue stone and gold palette and dark outline as the reference. Whole building visible, isolated and centered with generous space. Flat solid #FF00FF background and empty holes, no ground outside its small stone foundation, no shadows on magenta, no text, no labels, no extra props, no character, no UI. One building only.
```

## L4. Clear plaza approaches and a rectangular west-facing Vault (2026-10-15)

The owner confirmed a rectangle aligned to the map grid, with the body on the right and entrance/steps pointing strictly left. This replaces the three-quarter L3 Vault; the previous source is preserved in `art/lobby/raw/vault-three-quarter-v1.webp`.

Built-in `image_gen` generated `art/lobby/raw/vault-axis-base-v1.webp`, then edited only the staircase into a left-to-right approach. This stage is preserved in `art/lobby/raw/vault-flat-stairs-v1.webp` and superseded by L5 below. Height: 144 world pixels, foundation foot `(1360, 534)`. Cut only this row: `node scripts/sprite-sheets.mjs lobby vault`.

Base prompt (references: the original front Vault crop, and the owner's annotated lobby screenshot):

```text
Use case: precise-object-edit. Asset type: one production pixel-art building sprite for a fixed-camera 2D top-down RPG lobby. Input 1 is a STYLE AND IDENTITY reference: blue-grey stone Vault with blue steel circular safe door, gold wheel and trim, warm lanterns. Input 2 is the owner's placement sketch: the RED RECTANGLE below the existing vault specifies a flat, AXIS-ALIGNED RECTANGULAR FOUNDATION. Output ONLY a newly redrawn isolated Vault sprite on solid magenta #FF00FF; do not redraw the map or include the red markings.
PRIMARY REQUIREMENT: exact WEST-FACING / LEFT-FACING side orientation. The vault body stands along the RIGHT (east) side of its rectangular platform; its doorway and short access steps project STRICTLY LEFT (west) onto the empty LEFT half of the platform. In screen coordinates, the entrance WALL and the long stair risers run exactly VERTICAL, parallel to the image's left/right borders. The steps run from the left edge toward the right-hand vault body, in horizontal screen direction. Base is a true screen-aligned rectangle: upper/lower edges exactly horizontal, left/right edges exactly vertical; four 90-degree corners, no diagonal platform edges. The solid rear stone structure is on the RIGHT of the door, running north-south, with a little visible top. Camera is fixed above the game looking down at its grid; ALL ground edges remain east-west / north-south. Turn this building all the way to face LEFT; the blue/gold door appears strongly foreshortened as a thin VERTICAL OVAL on the LEFT face, not a broad circular front-facing door. The gold wheel can be a small oval. Upright stones and lanterns stay upright. Lower stairs should NOT face toward the viewer or lower-left. Do not use a three-quarter or isometric view. No diamond floor. No diagonal floor lines or diagonal step risers.
Identity: compact upright blue stone arch/body, recognizable heavy gold-trimmed blue safe door, two warm lanterns beside the doorway, a very small gold stack on the platform. Keep modest readable detail in the same coarse pixel clusters, dark outlines, blue-grey/gold palette and pixel density as the reference. Overall bounding box roughly 0.85 as wide as tall. Foundation roughly 3:2 width/depth, with enough flat landing to the left of the body. Crisp native pixel-art game sprite, no smooth painting, no antialiasing. Whole object visible with generous magenta margin, including all rectangular platform corners. Background and empty holes exactly #FF00FF; no cast shadow or glow spill outside the platform, no ground elsewhere, no scene, labels, words, characters or extra buildings.
```

Targeted staircase edit (reference: `art/lobby/raw/vault-axis-base-v1.webp`):

```text
Use case: precise-object-edit. Edit target: the supplied pixel-art Vault sprite. CHANGE ONLY THE STAIRCASE/LEFT LANDING in the lower-left part. Keep the entire tall right-hand stone Vault, strongly foreshortened gold/blue door, two lanterns, right-hand gold crate, magenta background, sprite scale, style and overall rectangular foundation boundary unchanged.
The existing staircase points DOWN, with long horizontal front step risers; this is the wrong entrance direction. Redraw that staircase so it rises from LEFT TO RIGHT toward the vault door. Its THREE long stair riser lines must be perfectly VERTICAL, parallel to the image sides, NOT horizontal or diagonal. Think of parallel vertical bands at x=160, x=290, x=420: each band runs north-south, from roughly y=860 to y=1150. The leftmost vertical riser is the low west entrance, the middle vertical riser is the second step, the rightmost is the top step and landing touching the door at x=570. The treads are axis-aligned rectangles between these VERTICAL risers. Fill any old front-facing steps with flat blue-grey platform flagstones. The front/lower platform edge is a SINGLE straight horizontal rectangular stone edge, with no staircase descending toward the viewer. Walk from the LEFT screen edge HORIZONTALLY RIGHT onto successive steps into the vault. This is a game sprite with west entrance, not an isometric architectural render; use orthographic screen-aligned rectangles even if that simplifies the perspective. NO horizontal staircase risers, NO diagonal ground or platform edges, NO front-facing downward staircase. No labels/arrows/text. Preserve coarse pixel clusters, palette, outlines and flat #FF00FF background. Output the entire single sprite, not a crop.
```

## L5. Overhead volume for the Vault; remove the corner benches (2026-10-15)

The owner asked to delete the two vertical corner benches, keeping only the horizontal pair, and improve the Vault's volume for the slightly-overhead game camera. The tall pillar-like stairs are replaced by low broad treads with visible upper surfaces. The body remains on the right and the entrance faces left. The outer foundation stays rectangular and aligned to the map grid.

Built-in `image_gen`, two edits. Previous source: `art/lobby/raw/vault-flat-stairs-v1.webp`; intermediate: `art/lobby/raw/vault-volume-v1.webp`; final source: `art/lobby/sprites/vault.webp`; game atlas: `public/lobby/vault.png`. Same height 144 and foot `(1360, 534)`. Cut: `node scripts/sprite-sheets.mjs lobby vault`.

Volume/stair prompt (edit the previous L4 Vault):

```text
Use case: precise-object-edit. Asset type: production pixel-art Vault sprite for Emberdeep. Edit target: the provided blue-grey stone Vault with gold-trimmed blue safe door, currently facing LEFT, standing on the RIGHT side of a rectangular platform. Preserve its identity, colours, two lanterns, gold stack, west-facing entrance, rectangular grid-aligned foundation, scale and composition. Output one isolated sprite, solid #FF00FF background.
REQUEST: improve its volume and the staircase for the game's slightly-overhead camera. We are viewing the building from ABOVE at about 40-45 degrees, so the upper surfaces of the stone arch, its thick rear body and especially the stair treads must be clearly visible. Give the body a solid three-dimensional stone thickness behind the door on the RIGHT, readable top planes, restrained highlights on the upper stone faces and cooler shadow on vertical faces. The gold/blue safe door can become a slightly broader readable oval, while still facing strictly LEFT toward the camp plaza; keep the body on the right. Keep the ground footprint a rectangle parallel to the screen axes.
MOST IMPORTANT CHANGE: replace the huge tall pillar-like blocks in the lower-left with THREE LOW, BROAD, WALKABLE STONE STEPS. A visitor enters from the LEFT of the sprite and ascends horizontally toward the RIGHT into the doorway. Each tread has a large visible upper stone slab surface and only a SHALLOW vertical riser; the current tall blue columns must become squat low steps. The westmost step is lowest; the eastern landing touches the door. The tread tops should read like broad flagstones seen from above, not like tower tops; make their depth several times greater than the riser height. No tall column, fence or wall at the left entrance, keep that edge open for walking. A modest bit of slab thickness and a dark seam under each tread establishes the height; no large vertical blue block faces. Keep the left-to-right direction; do not turn the staircase to face DOWN or diagonally. Use a little top-surface depth in the arch and landing so the whole building shares the slightly-overhead viewpoint. A rectangular horizontal lower foundation edge stays level and all of the footprint stays aligned to the map grid.
STYLE: match the original coarse crisp pixel clusters and blue-grey stone/gold palette, dark outlines, native pixel-art sprite, no smooth painting or antialiasing. Same general size and proportions, preserve generous magenta margins, all foundation corners visible. Background and all empty holes perfectly flat #FF00FF, no outside ground or cast shadow, no text or labels. Change the staircase and necessary nearby stone geometry, keep the design recognizable.
```

Targeted foundation correction (edit `art/lobby/raw/vault-volume-v1.webp`):

```text
Use case: precise-object-edit. Edit target: supplied slightly-overhead pixel-art stone Vault. Keep the improved thick arched body, visible top stone surfaces, gold/blue left-facing door, two lanterns, low broad left-to-right steps, gold crate, all colours and pixel style exactly as shown. Make ONE LOCAL GEOMETRY CORRECTION to the OUTERMOST PLATFORM/FOUNDATION ONLY. Its overall footprint must be a true SCREEN-ALIGNED RECTANGLE like the game map grid, not a skewed quadrilateral. Keep the existing front/bottom horizontal blue foundation edge at y about 1190, extend it left to x about 72 so the entire bottom silhouette is a single perfectly horizontal line from x=72 to x=1100. Make the outer left platform edge a perfectly vertical line at x about 72, from y about 925 down to y=1190. Fill the triangular missing lower-left corner with matching flat blue-grey foundation slabs so the low steps sit on a solid rectangular plinth. The front lower-left corner is exactly 90 degrees. The rectangle must not be rotated or skewed. Keep the low, broad stair treads and their overhead depth; only extend the surrounding flat foundation below them, do not replace the steps with tall pillars and do not move or rotate the Vault. Preserve the same dark pixel outline and a shallow dark blue vertical foundation lip along the bottom. Preserve everything above the low staircase and the entire right-hand building; no changes to the arch, door, lanterns, gold crate or perspective of those parts. Solid #FF00FF background elsewhere, empty margin all around, one whole isolated sprite, no text, no map.
```


## M3b. Cerberus: four facings and four states (2026-10-15)

Integrated from the owner's supplied PNG (2026-10-15), without AI regeneration. Exact original: `art/bosses/original/cerberus.png`; lossless working source: `art/bosses/raw/cerberus.webp`. Cut with `node scripts/sprite-sheets.mjs bosses cerberus` into `public/bosses/cerberus.png`: 4x4 frames, 1024x896 texture pixels, logical cell 128x112 at 2x density, foot (64,104). Runtime: `src/render/cerberus-sprites.ts`. Rows down/left/right/up; columns idle/step/wind-up/attack. Ordinary mobs retain their separate right-facing pipeline.

The old code-only reference is `docs/art/cerberus-current.png`; the new in-game view is `docs/screenshots/cerberus-closeup.png`. Style references were `docs/art/mobs/stone-golem.png` and `docs/art/characters/cat-ginger-tabby.png`. The owner also set boss contact damage to 40 light before armour; HP and 2x2 collision size stay unchanged. Original generation prompt:

```text
Create a production pixel-art SPRITE SHEET for Emberdeep. Match the attached approved monster and hero references: crisp pixel clusters, dark outline, restrained shading, readable on a dark dungeon floor. No smooth painting, antialiasing, 3D render or isometric view.

Character: CERBERUS, one broad, powerful three-headed hound. Exactly THREE distinct canine heads, FOUR legs, ONE body and ONE tail. Dark purple-grey fur, lighter slate muzzle and paws, small round glowing ember-red eyes, short fangs, small orange flames along the back and at the tail tip. Cute-creepy dark fantasy, imposing but not gory. Compact silhouette suitable for a 2x2-tile boss, visibly larger than regular monsters. Match the references' pixel density; do not merely enlarge their pixels. Keep all heads and anatomy consistent across frames.

ONE square PNG, 2048x2048 pixels, arranged as a strict 4-column by 4-row grid of sixteen equal 512x512 cells. Background everywhere perfectly flat magenta #FF00FF. No visible grid lines, text, numbers, labels, floor, platform or cast shadow. Generous empty margins in EVERY cell; nothing crosses cell boundaries.

Rows, top to bottom:
1 facing DOWN toward the viewer: front view, all three faces readable.
2 facing LEFT: strict left-facing side view, three distinct heads/necks with natural overlap.
3 facing RIGHT: strict right-facing side view of the same creature.
4 facing UP away from the viewer: rear view, backs of the three heads visible; no faces looking toward us.
Use the same slightly overhead dungeon camera in every row. No diagonal facings and no change of camera elevation.

Columns, left to right, identical state order in every row:
1 IDLE: planted paws, alert stance.
2 STEP: one clear walking step, alternating legs, same body scale.
3 WIND-UP: crouched shoulders, heads pull back, jaws begin opening; readable preparation.
4 ATTACK: all three heads lunge FORWARD in that row's facing direction, jaws open, flames flare. The body stays anchored; do not depict a leap across the frame or add a projectile.

Keep the creature's ground-contact anchor in exactly the same place in all cells, near the lower centre. Keep scale, colours, head identities and flame positions consistent. Attack and flame silhouettes remain fully inside their own cells. Deliver the sprite sheet only.
```


## Runtime ordinary-mob sizing (2026-10-15)

No new artwork was generated. The approved sources in `art/mobs/raw/` were recut with `node scripts/sprite-sheets.mjs mobs`: small creatures now occupy roughly one 32px tile along their longer side, preserving proportions; the already-large crab/golem remain the same scale. Logical heights: Waxling 30, Spider 22, Lantern Moth 28, Archer 29, Wisp 26, Golem 36, Skull Crab 22, Shroom 32, Imp 28. All nine textures now use 2x density (768x112, four logical 96x56 cells) to retain eyes and outlines. Cerberus sources and atlas were not changed.
