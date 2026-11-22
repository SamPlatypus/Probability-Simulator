import { h, scheduler, rand } from './util.js';
import { SUITS, RANKS } from '../experiments/cards.js';

function cardEl(parent) {
  const card = h('div', 'pcard', parent);
  const inner = h('div', 'pcard-inner', card);
  const front = h('div', 'pcard-face pcard-front', inner);
  h('div', 'pcard-face pcard-back', inner);
  return { card, inner, front };
}

function paint(front, id) {
  const rank = RANKS[id % 13], suit = SUITS[Math.floor(id / 13)];
  front.classList.toggle('red', suit.red);
  front.textContent = '';
  const corner = (cls) => {
    const c = h('div', `pc-corner ${cls}`, front);
    h('b', '', c, rank);
    h('span', '', c, suit.sym);
  };
  corner('tl');
  h('div', 'pc-pip', front, rank === 'J' || rank === 'Q' || rank === 'K' ? rank : suit.sym).classList.toggle('face', 'JQK'.includes(rank) && rank.length === 1);
  corner('br');
  front.setAttribute('aria-label', `${rank} of ${suit.name}`);
}

export default function cardsStage(root, model, ctx) {
  const sched = scheduler();
  const hand = model.outcomes.length === 9;
  const n = hand ? 5 : 1;
  root.classList.add('st-cards');
  root.classList.toggle('is-hand', hand);
  const felt = h('div', 'card-felt', root);
  const deck = h('div', 'card-deck', felt);
  for (let i = 0; i < 4; i++) h('div', 'pcard-back-stack', deck).style.setProperty('--i', i);
  const row = h('div', 'card-row', felt);
  const cards = [];
  for (let i = 0; i < n; i++) {
    const c = cardEl(row);
    c.card.style.setProperty('--i', i);
    c.card.classList.add('face-down');
    cards.push(c);
  }

  function caption(t) {
    if (hand) {
      ctx.caption(model.outcomes[t.index].label, t.cards.map((id) => RANKS[id % 13] + SUITS[Math.floor(id / 13)].sym).join(' '));
    } else {
      const id = t.cards[0];
      const name = `${RANKS[id % 13]}${SUITS[Math.floor(id / 13)].sym}`;
      ctx.caption(model.outcomes[t.index].label, name);
    }
  }

  function setAll(t) {
    t.cards.forEach((id, i) => {
      paint(cards[i].front, id);
      cards[i].card.classList.remove('face-down');
    });
    caption(t);
  }

  return {
    concurrent: false,
    async play(t, ms) {
      if (ms < 260 || ctx.reducedMotion()) {
        setAll(t);
        cards.forEach((c) => sched.animate(c.card, [{ opacity: 0.4 }, { opacity: 1 }], { duration: Math.min(ms, 140) }));
        await sched.wait(ms);
        return;
      }
      const dr = deck.getBoundingClientRect();
      const each = (ms * 0.78) / n;
      cards.forEach((c) => c.card.classList.add('face-down'));
      ctx.sound('swish');
      for (let i = 0; i < n; i++) {
        const c = cards[i];
        paint(c.front, t.cards[i]);
        const cr = c.card.getBoundingClientRect();
        const dx = dr.left + dr.width / 2 - (cr.left + cr.width / 2);
        const dy = dr.top + dr.height / 2 - (cr.top + cr.height / 2);
        const tilt = rand(-14, 14);
        const fly = sched.animate(c.card, [
          { transform: `translate(${dx}px, ${dy}px) rotate(${tilt}deg) scale(.82)` },
          { transform: 'translate(0,0) rotate(0deg) scale(1)' },
        ], { duration: each * 0.9, easing: 'cubic-bezier(.2,.75,.3,1)' });
        sched.wait(each * 0.55).then(() => c.card.classList.remove('face-down'));
        if (i === n - 1) await fly; else await sched.wait(each * 0.5);
      }
      ctx.sound('flip');
      ctx.haptic();
      caption(t);
      await sched.wait(ms * 0.2);
    },
    show(t) { setAll(t); },
    cancel() { sched.cancel(); },
    destroy() { sched.cancel(); },
  };
}
