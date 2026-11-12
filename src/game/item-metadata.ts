// A found weapon as wallets and explorers read it: the ERC-721 metadata JSON that EmberItems' tokenURI points to. The
// chain holds only three numbers per item (kind, rarity, seed); what they mean is in items.ts, and this file puts it in
// the standard shape. The signing server answers GET /api/item/<id> with it (server/attest.ts); the pictures are the
// site's own static files, made by `node scripts/sprite-sheets.mjs items`.
import { RARITY_INFO } from "./catalog";
import { ITEM_KIND_INFO, finishOf, isItem, itemName, itemStats, kindOf, rarityOf, type Item } from "./items";
import { LEVEL_PERKS, rankLabel } from "./level-perks";

export type ItemAttribute = { trait_type: string; value: string | number; display_type?: "number" | "boost_percentage" };

export type ItemMetadata = {
  name: string;
  description: string;
  /** Absolute, as the standard asks. Left out for an item this version of the game cannot draw. */
  image?: string;
  external_url: string;
  attributes: ItemAttribute[];
};

/** Where the site keeps an item's picture: one per kind and rarity (the finish is a name and a colour, not a drawing). */
export const itemImagePath = (i: Item) => `items/nft/${kindOf(i)}-${rarityOf(i)}.png`;

/**
 * The metadata of item `id`. `site` is the published game's address without a trailing slash, for the picture and the
 * link back. An item with numbers this game does not know (a later kind, or one a minter made up) still gets honest
 * metadata: its numbers, and no picture.
 */
export function itemMetadata(id: number, item: Item, site: string): ItemMetadata {
  if (!isItem(item)) {
    return {
      name: `Emberdeep item #${id}`,
      description: "An item from Emberdeep that this version of the game does not know.",
      external_url: site,
      attributes: [
        { trait_type: "Kind", value: item.kind, display_type: "number" },
        { trait_type: "Rarity", value: item.rarity, display_type: "number" },
      ],
    };
  }
  const kind = ITEM_KIND_INFO[kindOf(item)];
  const rarity = RARITY_INFO[rarityOf(item)].label;
  const finish = finishOf(item).name;
  const stats = itemStats(item);
  const light = stats.perks.lightOnKill ?? 0;
  const gold = stats.perks.goldPct ?? 0;
  const perk = stats.perk ? `${LEVEL_PERKS[stats.perk.id].name} ${rankLabel(stats.perk.rank)}` : null;
  const perkText = stats.perk ? LEVEL_PERKS[stats.perk.id].effects[stats.perk.rank - 1] : null;

  const does = [
    `${stats.damage} damage`,
    ...(light ? [`+${light} light per kill`] : []),
    ...(gold ? [`+${gold}% gold`] : []),
    ...(perk ? [`the level perk ${perk} from the first step (${perkText})`] : []),
  ];
  return {
    name: `${itemName(item)} #${id}`,
    description: `${rarity} ${kind.name.toLowerCase()} with a ${finish} finish, found in a Cerberus chest in Emberdeep, a roguelike with a weekly MUSD prize pool on Mezo. `
      + `Carried into a descent it gives ${does.join(", ")}. ${kind.blurb}`,
    image: `${site}/${itemImagePath(item)}`,
    external_url: site,
    attributes: [
      { trait_type: "Kind", value: kind.name },
      { trait_type: "Rarity", value: rarity },
      { trait_type: "Finish", value: finish },
      { trait_type: "Damage", value: stats.damage, display_type: "number" },
      ...(light ? [{ trait_type: "Light per kill", value: light, display_type: "number" } as const] : []),
      ...(gold ? [{ trait_type: "Gold bonus", value: gold, display_type: "boost_percentage" } as const] : []),
      ...(perk ? [{ trait_type: "Level perk", value: perk }] : []),
    ],
  };
}
