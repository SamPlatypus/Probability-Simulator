// A standard 52-card deck. Card id c: rank = c % 13 (0 = Ace … 12 = King), suit = ⌊c / 13⌋.

export const SUITS = [
  { sym: '♠', name: 'Spades', red: false },
  { sym: '♥', name: 'Hearts', red: true },
  { sym: '♦', name: 'Diamonds', red: true },
  { sym: '♣', name: 'Clubs', red: false },
];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/** Exact counts of each 5-card poker category among all C(52, 5) = 2,598,960 hands. */
export const HAND_CATEGORIES = [
  { label: 'High card', short: 'High', ways: 1302540 },
  { label: 'One pair', short: 'Pair', ways: 1098240 },
  { label: 'Two pair', short: '2 Pair', ways: 123552 },
  { label: 'Three of a kind', short: 'Trips', ways: 54912 },
  { label: 'Straight', short: 'Straight', ways: 10200 },
  { label: 'Flush', short: 'Flush', ways: 5108 },
  { label: 'Full house', short: 'Full', ways: 3744 },
  { label: 'Four of a kind', short: 'Quads', ways: 624 },
  { label: 'Straight flush', short: 'St. flush', ways: 40 },
];
const ALL_HANDS = 2598960;

/** Classify a 5-card hand (array of card ids) into a HAND_CATEGORIES index. */
export function classifyHand(cards) {
  const rankCount = new Array(13).fill(0);
  let mask = 0;
  const s0 = Math.floor(cards[0] / 13);
  let flush = true;
  for (let i = 0; i < 5; i++) {
    const r = cards[i] % 13;
    rankCount[r]++;
    mask |= 1 << r;
    if (Math.floor(cards[i] / 13) !== s0) flush = false;
  }
  let pairs = 0, trips = 0, quads = 0;
  for (let r = 0; r < 13; r++) {
    const n = rankCount[r];
    if (n === 2) pairs++;
    else if (n === 3) trips++;
    else if (n === 4) quads++;
  }
  let straight = false;
  if (pairs + trips + quads === 0) {
    // Five distinct ranks: consecutive run, or the ace-high 10-J-Q-K-A.
    const lo = Math.log2(mask & -mask);
    straight = mask === (0b11111 << lo) || mask === 0b1111000000001;
  }
  if (straight && flush) return 8;
  if (quads) return 7;
  if (trips && pairs) return 6;
  if (flush) return 5;
  if (straight) return 4;
  if (trips) return 3;
  if (pairs === 2) return 2;
  if (pairs === 1) return 1;
  return 0;
}

const MEASURES = {
  suit: {
    outcomes: SUITS.map((s) => ({ label: `${s.sym} ${s.name}`, short: s.sym })),
    probs: [0.25, 0.25, 0.25, 0.25],
    of: (c) => Math.floor(c / 13),
    xTitle: 'Suit of the card',
    theoryLabel: 'P(suit) = 13/52 = 1/4',
  },
  color: {
    outcomes: [{ label: 'Red', short: 'Red' }, { label: 'Black', short: 'Black' }],
    probs: [0.5, 0.5],
    of: (c) => (SUITS[Math.floor(c / 13)].red ? 0 : 1),
    xTitle: 'Colour of the card',
    theoryLabel: 'P(red) = 26/52 = 1/2',
  },
  rank: {
    outcomes: RANKS.map((r) => ({ label: r, short: r })),
    probs: new Array(13).fill(1 / 13),
    of: (c) => c % 13,
    xTitle: 'Rank of the card',
    theoryLabel: 'P(rank) = 4/52 = 1/13',
  },
  kind: {
    outcomes: [{ label: 'Number (2–10)', short: '2–10' }, { label: 'Face (J Q K)', short: 'Face' }, { label: 'Ace', short: 'Ace' }],
    probs: [36 / 52, 12 / 52, 4 / 52],
    of: (c) => { const r = c % 13; return r === 0 ? 2 : r >= 10 ? 1 : 0; },
    xTitle: 'Kind of card',
    theoryLabel: '36/52 · 12/52 · 4/52',
  },
};

export default {
  id: 'cards',
  name: 'Cards',
  icon: 'cards',
  blurb: 'Draw from a shuffled deck',
  defaults: { measure: 'suit' },

  controls() {
    return [{
      type: 'choice', key: 'measure', label: 'Draw and record',
      options: [
        { value: 'suit', label: 'Suit' }, { value: 'color', label: 'Colour' }, { value: 'rank', label: 'Rank' },
        { value: 'kind', label: 'Card kind' }, { value: 'hand', label: '5-card hand' },
      ],
      hint: (c) => (c.measure === 'hand'
        ? 'Deal 5 cards from a fresh shuffle and name the poker hand. Some hands are extremely rare.'
        : 'Draw one card from a fresh, shuffled 52-card deck.'),
    }];
  },

  build(c) {
    if (c.measure === 'hand') {
      const deck = Int32Array.from({ length: 52 }, (_, i) => i);
      const hand = new Int32Array(5);
      const deal = (rng) => {
        for (let j = 0; j < 5; j++) {
          const r = j + rng.int(52 - j);
          const t = deck[j]; deck[j] = deck[r]; deck[r] = t;
          hand[j] = deck[j];
        }
        return hand;
      };
      return {
        outcomes: HAND_CATEGORIES.map((h) => ({ label: h.label, short: h.short })),
        probs: HAND_CATEGORIES.map((h) => h.ways / ALL_HANDS),
        numeric: false,
        orientation: 'horizontal',
        xTitle: '5-card poker hand',
        defaultEvent: { type: 'set', items: [1] },
        theoryLabel: 'Counting hands out of 2,598,960',
        sample: (rng) => classifyHand(deal(rng)),
        trial(rng) {
          const cards = Array.from(deal(rng));
          return { index: classifyHand(cards), cards };
        },
        stage: 'cards',
      };
    }
    const m = MEASURES[c.measure] || MEASURES.suit;
    return {
      outcomes: m.outcomes,
      probs: m.probs,
      numeric: false,
      xTitle: m.xTitle,
      defaultEvent: { type: 'set', items: [0] },
      theoryLabel: m.theoryLabel,
      sample: (rng) => m.of(rng.int(52)),
      trial(rng) {
        const card = rng.int(52);
        return { index: m.of(card), cards: [card] };
      },
      stage: 'cards',
    };
  },

  learn: {
    idea: `<p>A shuffled deck makes every card equally likely, so probability is <b>favourable cards ÷ 52</b>. There are 13 hearts, so P(heart) = 13/52 = 1/4.</p>
      <p>Grouping matters: 12 face cards make “Face” three times as likely as “Ace” (4 cards), even though both are single words.</p>
      <p>With 5-card hands, counting gets big — there are <b>2,598,960</b> possible hands. Rare hands are rare because very few of those hands qualify.</p>`,
    theory: `<p>P(event) = (number of cards in the event) ÷ 52.</p>
      <p>P(flush) = 5,108 ÷ 2,598,960 ≈ 0.197% — about <b>1 in 509</b> hands. A straight flush is 40 hands: 1 in 64,974.</p>`,
    misconception: `<p><b>“A pair is unusual.”</b> Almost half of all hands (42%) contain exactly one pair! Deal 1,000 hands and see.</p>
      <p><b>Rare isn't impossible.</b> Run 100,000 hands at Max: you'll probably see a few four-of-a-kinds (1 in 4,165).</p>`,
    tryThis: [
      { label: 'Four suits', text: 'Draw 400 cards. Is any suit ever exactly 100?', config: { measure: 'suit' }, trials: 400, speed: 5 },
      { label: 'Face vs. Ace', text: 'Predict how much more often a face card appears than an ace.', config: { measure: 'kind' }, trials: 2000, speed: 6 },
      { label: 'Rare hands', text: 'Deal 100,000 poker hands at Max. Tap “Four of a kind” to see its odds.', config: { measure: 'hand' }, trials: 100000, speed: 7 },
    ],
  },
};
