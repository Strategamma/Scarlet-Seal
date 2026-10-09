export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

export type CardValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface CardDef { value: CardValue; name: string; count: number; text: string }
export const CARDS: Record<CardValue, CardDef> = {
  0: { value: 0, name: 'Wiretap', count: 2, text: 'No immediate effect. A lone surviving user earns bonus evidence.' },
  1: { value: 1, name: 'Hunch', count: 6, text: 'Name another card in a rival’s hand.' },
  2: { value: 2, name: 'Lead', count: 2, text: 'Privately inspect another player’s hand.' },
  3: { value: 3, name: 'Alibi', count: 2, text: 'Compare hands; the lower value is eliminated.' },
  4: { value: 4, name: 'Safehouse', count: 2, text: 'Other players cannot target you until your next turn.' },
  5: { value: 5, name: 'Interrogation', count: 2, text: 'Make any player discard their hand and redraw.' },
  6: { value: 6, name: 'Case Review', count: 2, text: 'Draw two cards, keep one, and return the rest to the deck.' },
  7: { value: 7, name: 'Disguise', count: 1, text: 'Trade hands with another player.' },
  8: { value: 8, name: 'Red Herring', count: 1, text: 'Must be played with Disguise or Interrogation.' },
  9: { value: 9, name: 'Scarlet Evidence', count: 1, text: 'Playing or discarding this eliminates you.' }
};

export interface Player {
  id: string; name: string; hand: CardValue[]; discards: CardValue[];
  tokens: number; protected: boolean; eliminated: boolean; connected: boolean; bot: boolean;
}
export interface GameState {
  phase: 'lobby' | 'playing' | 'round-over' | 'match-over';
  players: Player[]; deck: CardValue[]; setAside?: CardValue; faceUpRemoved: CardValue[];
  turnIndex: number; round: number; log: string[]; privateNotice: Record<string, string>;
  winnerIds: string[]; matchWinnerIds: string[];
  lastAction?: { sequence: number; actorId: string; card: CardValue; targetId?: string; resolution: string };
  actionSequence: number;
  pendingBottom?: { playerId: string; count: number };
}
export interface Move { card: CardValue; targetId?: string; guess?: CardValue }
export interface PlayerView {
  id: string; name: string; tokens: number; protected: boolean; eliminated: boolean;
  connected: boolean; bot: boolean; handCount: number; discards: CardValue[];
}
export interface GameView {
  phase: GameState['phase']; players: PlayerView[]; hand: CardValue[]; deckCount: number;
  faceUpRemoved: CardValue[]; turnPlayerId?: string; round: number; log: string[];
  notice?: string; winnerIds: string[]; matchWinnerIds: string[]; legalMoves: Move[];
  bottomChoiceCount: number;
  lastAction?: GameState['lastAction'];
}

export const tokenTarget = (_count: number) => 3;

export function makeDeck(): CardValue[] {
  return (Object.values(CARDS) as CardDef[]).flatMap(card => Array(card.count).fill(card.value));
}

export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function createGame(players: Pick<Player, 'id' | 'name' | 'bot'>[], rng = Math.random): GameState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`A game needs ${MIN_PLAYERS}–${MAX_PLAYERS} players.`);
  const state: GameState = {
    phase: 'lobby', players: players.map(p => ({ ...p, hand: [], discards: [], tokens: 0, protected: false, eliminated: false, connected: true })),
    deck: [], faceUpRemoved: [], turnIndex: 0, round: 0, log: [], privateNotice: {}, winnerIds: [], matchWinnerIds: [], actionSequence: 0
  };
  startRound(state, rng);
  return state;
}

export function startRound(state: GameState, rng = Math.random): void {
  const previousWinnerId = state.winnerIds[Math.floor(rng() * Math.max(state.winnerIds.length, 1))];
  state.round += 1; state.phase = 'playing'; state.winnerIds = []; state.matchWinnerIds = []; state.privateNotice = {}; state.pendingBottom = undefined; state.lastAction = undefined;
  state.players.forEach(p => { p.hand = []; p.discards = []; p.protected = false; p.eliminated = false; });
  const deck = shuffle(makeDeck(), rng);
  state.setAside = deck.pop(); state.faceUpRemoved = state.players.length === 2 ? deck.splice(-3) : [];
  state.players.forEach(p => p.hand.push(deck.pop()!));
  state.deck = deck;
  const previousWinner = state.players.findIndex(p => p.id === previousWinnerId);
  state.turnIndex = previousWinner >= 0 ? previousWinner : Math.floor(rng() * state.players.length);
  state.log = [`Round ${state.round} begins.`];
  drawForTurn(state);
}

function current(state: GameState): Player { return state.players[state.turnIndex]; }
function active(state: GameState): Player[] { return state.players.filter(p => !p.eliminated); }
function targetable(state: GameState, actorId: string, allowSelf = false): Player[] {
  return active(state).filter(p => !p.protected && (allowSelf || p.id !== actorId));
}
function eliminate(state: GameState, player: Player, reason: string): void {
  player.eliminated = true;
  if (player.hand.length) player.discards.push(...player.hand.splice(0));
  state.log.push(`${player.name} is out — ${reason}.`);
}
function drawForTurn(state: GameState): void {
  const player = current(state);
  player.protected = false;
  const drawn = state.deck.pop();
  if (drawn !== undefined) player.hand.push(drawn);
}

export function legalMoves(state: GameState, playerId: string): Move[] {
  if (state.phase !== 'playing' || state.pendingBottom || current(state).id !== playerId) return [];
  const actor = current(state);
  let playable = [...actor.hand];
  if (actor.hand.includes(8) && actor.hand.some(v => v === 5 || v === 7)) playable = [8];
  const moves: Move[] = [];
  for (const card of playable) {
    const others = targetable(state, actor.id);
    if (card === 1) {
      if (!others.length) moves.push({ card });
      for (const target of others) {
        for (const guess of Object.keys(CARDS).map(Number) as CardValue[]) if (guess !== 1) moves.push({ card, targetId: target.id, guess });
      }
    } else if ([2, 3, 7].includes(card)) {
      if (!others.length) moves.push({ card }); else others.forEach(target => moves.push({ card, targetId: target.id }));
    } else if (card === 5) {
      const choices = active(state).filter(p => p.id === actor.id || !p.protected);
      choices.forEach(target => moves.push({ card, targetId: target.id }));
    } else moves.push({ card });
  }
  return moves;
}

function sameMove(a: Move, b: Move): boolean { return a.card === b.card && a.targetId === b.targetId && a.guess === b.guess; }

export function playCard(state: GameState, playerId: string, move: Move, rng = Math.random): void {
  const legal = legalMoves(state, playerId);
  if (!legal.some(candidate => sameMove(candidate, move))) throw new Error('That move is not legal.');
  const actor = current(state);
  const index = actor.hand.indexOf(move.card);
  actor.hand.splice(index, 1); actor.discards.push(move.card);
  const target = move.targetId ? state.players.find(p => p.id === move.targetId) : undefined;
  state.lastAction = { sequence: ++state.actionSequence, actorId: actor.id, card: move.card, targetId: target?.id, resolution: 'No immediate effect.' };
  const action = state.lastAction;
  state.log.push(`${actor.name} played ${CARDS[move.card].name}${target ? ` on ${target.name}` : ''}.`);

  if (move.card === 1 && target && move.guess !== undefined) {
    state.log.push(`${actor.name} named ${CARDS[move.guess].name} for ${target.name}.`);
    if (target.hand[0] === move.guess) { eliminate(state, target, 'the Hunch was correct'); action.resolution = `Correct: ${target.name} was eliminated.`; }
    else action.resolution = `Incorrect: ${target.name} stayed in the case.`;
  } else if (move.card === 2 && target) {
    state.privateNotice[actor.id] = `${target.name} holds ${CARDS[target.hand[0]].name}.`;
    action.resolution = `${actor.name} privately inspected ${target.name}'s hand.`;
  } else if (move.card === 3 && target) {
    const a = actor.hand[0], b = target.hand[0];
    if (a < b) { eliminate(state, actor, `${target.name} had the stronger alibi`); action.resolution = `${target.name} won the comparison; ${actor.name} was eliminated.`; }
    if (b < a) { eliminate(state, target, `${actor.name} had the stronger alibi`); action.resolution = `${actor.name} won the comparison; ${target.name} was eliminated.`; }
    if (a === b) { state.log.push('The alibis were equally strong.'); action.resolution = 'The comparison was tied; both players survived.'; }
  } else if (move.card === 4) {
    actor.protected = true;
    action.resolution = `${actor.name} is protected until their next turn.`;
  } else if (move.card === 5 && target) {
    const discarded = target.hand.splice(0, 1)[0];
    target.discards.push(discarded);
    state.log.push(`${target.name} discarded ${CARDS[discarded].name}.`);
    if (discarded === 9) { eliminate(state, target, 'Scarlet Evidence was exposed'); action.resolution = `${target.name} exposed Scarlet Evidence and was eliminated.`; }
    else {
      let replacement = state.deck.pop();
      if (replacement === undefined) { replacement = state.setAside; state.setAside = undefined; }
      if (replacement !== undefined) target.hand.push(replacement);
      action.resolution = `${target.name} discarded ${CARDS[discarded].name} and drew a replacement.`;
    }
  } else if (move.card === 6) {
    let drawn = 0;
    while (drawn < 2 && state.deck.length) { actor.hand.push(state.deck.pop()!); drawn++; }
    if (drawn) {
      state.pendingBottom = { playerId: actor.id, count: drawn };
      state.privateNotice[actor.id] = `Choose ${drawn} card${drawn === 1 ? '' : 's'} to return to the bottom of the deck.`;
      action.resolution = `${actor.name} is reviewing ${drawn + 1} cards.`;
      return;
    }
  } else if (move.card === 7 && target) {
    [actor.hand, target.hand] = [target.hand, actor.hand];
    action.resolution = `${actor.name} and ${target.name} traded hands.`;
  } else if (move.card === 9) { eliminate(state, actor, 'Scarlet Evidence was played'); action.resolution = `${actor.name} exposed Scarlet Evidence and was eliminated.`; }

  finishTurn(state, rng);
}

export function returnCardsToBottom(state: GameState, playerId: string, cards: CardValue[], rng = Math.random): void {
  const pending = state.pendingBottom;
  if (!pending || pending.playerId !== playerId || current(state).id !== playerId) throw new Error('There are no cards to return.');
  if (cards.length !== pending.count) throw new Error(`Choose exactly ${pending.count} card${pending.count === 1 ? '' : 's'}.`);
  const actor = current(state);
  const remaining = [...actor.hand];
  for (const card of cards) {
    const index = remaining.indexOf(card);
    if (index < 0) throw new Error('That return choice is not valid.');
    remaining.splice(index, 1);
  }
  if (remaining.length !== 1) throw new Error('Case Review must leave one card in your hand.');
  actor.hand = remaining;
  state.deck.unshift(...cards);
  state.pendingBottom = undefined;
  delete state.privateNotice[playerId];
  state.log.push(`${actor.name} returned ${cards.length} card${cards.length === 1 ? '' : 's'} to the case file.`);
  if (state.lastAction?.actorId === actor.id && state.lastAction.card === 6) state.lastAction.resolution = `${actor.name} kept one card and returned ${cards.length} to the deck.`;
  finishTurn(state, rng);
}

export function forfeitPlayer(state: GameState, playerId: string, rng = Math.random): void {
  const player = state.players.find(candidate => candidate.id === playerId);
  if (!player || state.phase !== 'playing' || player.eliminated) return;
  const wasCurrent = current(state).id === playerId;
  if (state.pendingBottom?.playerId === playerId) state.pendingBottom = undefined;
  eliminate(state, player, 'they left the case');
  if (wasCurrent || active(state).length <= 1) finishTurn(state, rng);
}

function finishTurn(state: GameState, rng: () => number): void {
  if (active(state).length <= 1 || state.deck.length === 0) { finishRound(state); return; }
  do state.turnIndex = (state.turnIndex + 1) % state.players.length; while (current(state).eliminated);
  drawForTurn(state);
}

function finishRound(state: GameState): void {
  const survivors = active(state);
  const bestHand = Math.max(...survivors.map(p => p.hand[0] ?? 0));
  const winners = survivors.filter(p => (p.hand[0] ?? 0) === bestHand);
  winners.forEach(p => p.tokens++);
  state.winnerIds = winners.map(p => p.id);
  state.log.push(`${winners.map(p => p.name).join(' & ')} won the round.`);

  const wiretapUsers = survivors.filter(p => p.discards.includes(0));
  if (wiretapUsers.length === 1) {
    wiretapUsers[0].tokens++;
    state.log.push(`${wiretapUsers[0].name} earned bonus evidence from a lone Wiretap.`);
  }

  state.matchWinnerIds = state.players.filter(p => p.tokens >= tokenTarget(state.players.length)).map(p => p.id);
  state.phase = state.matchWinnerIds.length ? 'match-over' : 'round-over';
}

export function viewFor(state: GameState, playerId: string): GameView {
  const viewer = state.players.find(p => p.id === playerId);
  return {
    phase: state.phase,
    players: state.players.map(p => ({ id: p.id, name: p.name, tokens: p.tokens, protected: p.protected, eliminated: p.eliminated, connected: p.connected, bot: p.bot, handCount: p.hand.length, discards: p.discards })),
    hand: viewer?.hand ?? [], deckCount: state.deck.length, faceUpRemoved: state.faceUpRemoved,
    turnPlayerId: state.phase === 'playing' ? current(state).id : undefined, round: state.round,
    log: state.log.slice(-8), notice: state.privateNotice[playerId], winnerIds: state.winnerIds,
    matchWinnerIds: state.matchWinnerIds, legalMoves: legalMoves(state, playerId), lastAction: state.lastAction,
    bottomChoiceCount: state.pendingBottom?.playerId === playerId ? state.pendingBottom.count : 0
  };
}

export function chooseBotMove(state: GameState, playerId: string, rng = Math.random): Move {
  const moves = legalMoves(state, playerId);
  if (!moves.length) throw new Error('Bot has no legal move.');
  const useful = moves.filter(m => m.card !== 9 && !(m.card === 5 && m.targetId === playerId));
  const pool = useful.length ? useful : moves;
  return pool[Math.floor(rng() * pool.length)];
}

export function chooseBotReturns(state: GameState, playerId: string): CardValue[] {
  const pending = state.pendingBottom;
  if (!pending || pending.playerId !== playerId) throw new Error('Bot has no cards to return.');
  return [...current(state).hand].sort((a, b) => a - b).slice(0, pending.count);
}
