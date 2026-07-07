// Static keyword/rules-term dataset for /keyword (chunk 4.1, DECISIONS.md
// 2026-07-06). Curated, shipped with the bot — keywords change a few times
// a year with new sets, so a reviewed static file beats a scraper. "N"
// stands in for the numeric value printed on the card.
//
// This glossary is the bot's ONLY text rules reference: /card is
// image-first (chunk 4.8) and prints no effect text, so a wrong entry
// here has nothing to fall back on. The dataset is judge-reviewed
// (DECISIONS.md 2026-07-06); official cross-check source: Comprehensive
// Rules §16 (en.digimoncard.com/rule/).

export interface Keyword {
  /** Canonical display name, without the ＜＞ brackets. */
  name: string;
  /** Rules text, official reminder-text phrasing. */
  text: string;
  /** Extra names users might type; matched after normalization. */
  aliases?: string[];
}

export const KEYWORDS: Keyword[] = [
  // — battle & protection —
  {
    name: "Blocker",
    text: "When an opponent's Digimon attacks, you may suspend this Digimon to change the attack target to it.",
  },
  {
    name: "Armor Purge",
    text: "When this Digimon would be deleted, you may trash this Digimon's top stacked card so it isn't deleted.",
  },
  {
    name: "Barrier",
    text: "When this Digimon would be deleted in battle, you may trash the top card of your security stack so it isn't deleted.",
  },
  {
    name: "Evade",
    text: "When this Digimon would be deleted, you may suspend it so it isn't deleted.",
  },
  {
    name: "Fragment N",
    text: "When this Digimon would be deleted, you may trash N of its digivolution cards so it isn't deleted.",
    aliases: ["Fragment"],
  },
  {
    name: "Scapegoat",
    text: "When this Digimon would be deleted other than by your own effects, you may delete 1 of your other Digimon so it isn't deleted.",
  },
  {
    name: "Decoy",
    text: "When one of your other specified Digimon would be deleted by an opponent's effect, you may delete this Digimon to prevent that deletion.",
  },
  {
    name: "Fortitude",
    text: "When this Digimon with digivolution cards is deleted, you may play this card without paying the cost.",
  },
  {
    name: "Retaliation",
    text: "When this Digimon is deleted after losing a battle, delete the Digimon it was battling.",
  },
  {
    name: "Jamming",
    text: "This Digimon can't be deleted in battles against Security Digimon.",
  },
  {
    name: "Reboot",
    text: "Unsuspend this Digimon during your opponent's unsuspend phase.",
  },
  {
    name: "Iceclad",
    text: "Other than against Security Digimon, this Digimon's battles compare the number of digivolution cards instead of DP.",
  },
  {
    name: "Progress",
    text: "While this Digimon is attacking, your opponent's effects don't affect it.",
  },
  {
    name: "Guard",
    text: "When any of your other Digimon would leave the battle area by an opponent's effect, by deleting this Digimon, it doesn't leave.",
  },

  // — attacking —
  {
    name: "Rush",
    text: "This Digimon can attack the turn it comes into play.",
  },
  {
    name: "Blitz",
    text: "This Digimon can attack if your opponent has 1 or more memory.",
  },
  {
    name: "Piercing",
    text: "When this Digimon attacks and deletes an opponent's Digimon and survives the battle, it performs any security checks it normally would.",
  },
  {
    name: "Security Attack +N / −N",
    text: "This Digimon checks N more (or N fewer) security cards when attacking.",
    aliases: ["Security Attack", "Security A.", "Sec Attack", "SA"],
  },
  {
    name: "Raid",
    text: "When this Digimon attacks, you may switch the attack target to 1 of your opponent's unsuspended Digimon with the highest DP.",
  },
  {
    name: "Alliance",
    text: "When this Digimon attacks, by suspending 1 of your other Digimon, this Digimon gains ＜Security Attack +1＞ and the suspended Digimon's DP for the attack.",
  },
  {
    name: "Collision",
    text: "During this Digimon's attack, all of your opponent's Digimon gain ＜Blocker＞, and your opponent blocks with 1 of them if able.",
  },
  {
    name: "Vortex",
    text: "At the end of your turn, this Digimon may attack an opponent's Digimon, even on the turn it came into play.",
  },
  {
    name: "Execute",
    text: "At the end of your turn, this Digimon may attack, and at the end of that attack it is deleted. It can also attack your opponent's unsuspended Digimon this way.",
  },
  {
    name: "Engage",
    text: "At the end of your turn, this Digimon may attack.",
  },
  {
    name: "Overclock",
    text: "At the end of your turn, by deleting 1 of your Tokens or other specified-trait Digimon, this Digimon attacks a player without suspending.",
  },

  // — resources & recovery —
  {
    name: "Draw N",
    text: "Draw N cards from your deck.",
    aliases: ["Draw"],
  },
  {
    name: "Recovery +N ⟨Deck⟩",
    text: "Place the top N cards of your deck on top of your security stack.",
    aliases: ["Recovery"],
  },
  {
    name: "De-Digivolve N",
    text: "Trash up to N cards from the top of 1 of your opponent's Digimon. If it has no digivolution cards, or becomes a level 3 Digimon, you can't trash any more cards.",
    aliases: ["De-Digivolve", "DeDigivolve"],
  },
  {
    name: "Save",
    text: "You may place this card under 1 of your Tamers.",
  },
  {
    name: "Material Save N",
    text: "When this Digimon is deleted, you may place N cards listed in its DigiXros requirements from its digivolution cards under 1 of your Tamers.",
    aliases: ["Material Save"],
  },
  {
    name: "Ascension",
    text: "When this Digimon is deleted, you may place this card as your top security card.",
  },

  // — digivolution & play mechanics —
  {
    name: "Blast Digivolve",
    text: "One of your Digimon may digivolve into this card without paying the cost.",
  },
  {
    name: "Blast DNA Digivolve",
    text: "One of your specified Digimon and a card from your hand may DNA digivolve into this card without paying the cost.",
  },
  {
    name: "DNA Digivolve",
    text: "Two of your specified Digimon may digivolve into this card together by paying the cost, stacking one on top of the other.",
    aliases: ["DNA Digivolution", "DNA"],
  },
  {
    name: "Burst Digivolve",
    text: "This card may digivolve onto the specified Digimon for its burst digivolve cost; at the end of that turn, trash this Digimon's top stacked card.",
  },
  {
    name: "Digi-Burst N",
    text: "Trash up to N of this Digimon's digivolution cards to activate the effect below.",
    aliases: ["Digi-Burst", "Digiburst"],
  },
  {
    name: "Digisorption N",
    text: "When a Digimon would digivolve into this card in your hand, you may suspend 1 of your Digimon to reduce the digivolution cost by N.",
    aliases: ["Digisorption"],
  },
  {
    name: "DigiXros N",
    text: "When you would play this card, you may place the specified cards from your hand or battle area under it. Each placed card reduces the play cost.",
    aliases: ["DigiXros", "Xros"],
  },
  {
    name: "Decode",
    text: "When this Digimon would leave the battle area other than in battle, you may play 1 specified Digimon card from its digivolution cards without paying the cost.",
  },
  {
    name: "Partition",
    text: "When this Digimon, with each of the specified cards in its digivolution cards, would leave the battle area other than by your own effects or battle, you may play 1 of each specified card without paying their costs.",
  },
  {
    name: "Overflow ⟨−N⟩",
    text: "As this card moves from the field or from under a card to another area, you lose N memory. (This is the ACE mechanic's cost.)",
    aliases: ["Overflow", "ACE"],
  },
  {
    name: "Assembly",
    text: "When you would play this card, by placing the specified cards from your trash under it, reduce the play cost by the specified value.",
  },

  // — Tamers & linking —
  {
    name: "Mind Link",
    text: "Place this Tamer as the bottom digivolution card of 1 of your specified Digimon if it has no Tamer cards in its digivolution cards.",
    aliases: ["MindLink"],
  },
  {
    name: "Link",
    text: "Plug this card sideways from your hand or battle area under the specified Digimon in the battle area; while linked, it grants that Digimon its link effects and link DP.",
    aliases: ["Linked", "Linking"],
  },
  {
    name: "Link +N",
    text: "This Digimon's maximum number of linked cards increases by N.",
  },
  {
    name: "App Fusion",
    text: "If the 2 specified cards are linked together, you may stack the App Fusion card on top of them and digivolve into it.",
  },

  // — Option/board mechanics —
  {
    name: "Delay",
    text: "Trash this card in your battle area to activate the effect below. You can't activate this effect the turn this card enters play.",
  },

  {
    name: "Use Req",
    text: "If you have the specified cards on the field, you may ignore the color requirements of this Option.",
  },

  {
    name: "Arts Digivolve",
    text: "When this Option is used, instead of trashing it after use, one of your cards on the field may digivolve into this DUAL card without paying the cost.",
  },

  // - Other -
  {
    name: "Training",
    text: "By suspending this Digimon during the main phase, place the top card of your deck at the bottom of this Digimon's digivolution cards. This effect can also activate in the breeding area.",
  },
];
