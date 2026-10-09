export type CardValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface CardDef { value: CardValue; name: string; count: number; text: string }
export const CARDS: Record<CardValue, CardDef> = {
  1: { value: 1, name: 'Guard', count: 5, text: 'Guess another player’s card.' },
  2: { value: 2, name: 'Priest', count: 2, text: 'Privately see another player’s card.' },
  3: { value: 3, name: 'Baron', count: 2, text: 'Compare hands; lower value is eliminated.' },
  4: { value: 4, name: 'Handmaid', count: 2, text: 'You are protected until your next turn.' },
  5: { value: 5, name: 'Prince', count: 2, text: 'Choose a player to discard and redraw.' },
  6: { value: 6, name: 'King', count: 1, text: 'Trade hands with another player.' },
  7: { value: 7, name: 'Countess', count: 1, text: 'Must be played with the King or Prince.' },
  8: { value: 8, name: 'Princess', count: 1, text: 'Playing or discarding this eliminates you.' }
};

export interface Player {
  id: string; name: string; hand: CardValue[]; discards: CardValue[];
  tokens: number; protected: boolean; eliminated: boolean; connected: boolean; bot: boolean;
}
export interface GameState {
  phase: 'lobby' | 'playing' | 'round-over' | 'match-over';
  players: Player[]; deck: CardValue[]; setAside?: CardValue; faceUpRemoved: CardValue[];
  turnIndex: number; round: number; log: string[]; privateNotice: Record<string, string>;
  winnerIds: string[]; matchWinnerId?: string;
}
export interface Move { card: CardValue; targetId?: string; guess?: CardValue }
export interface PlayerView {
  id: string; name: string; tokens: number; protected: boolean; eliminated: boolean;
  connected: boolean; bot: boolean; handCount: number; discards: CardValue[];
}
export interface GameView {
  phase: GameState['phase']; players: PlayerView[]; hand: CardValue[]; deckCount: number;
  faceUpRemoved: CardValue[]; turnPlayerId?: string; round: number; log: string[];
  notice?: string; winnerIds: string[]; matchWinnerId?: string; legalMoves: Move[];
}

export const tokenTarget = (count: number) => count === 2 ? 7 : count === 3 ? 5 : 4;

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
  if (players.length < 2 || players.length > 4) throw new Error('A game needs 2–4 players.');
  const state: GameState = {
    phase: 'lobby', players: players.map(p => ({ ...p, hand: [], discards: [], tokens: 0, protected: false, eliminated: false, connected: true })),
    deck: [], faceUpRemoved: [], turnIndex: 0, round: 0, log: [], privateNotice: {}, winnerIds: []
  };
  startRound(state, rng);
  return state;
}

export function startRound(state: GameState, rng = Math.random): void {
  const previousWinnerId = state.winnerIds[0];
  state.round += 1; state.phase = 'playing'; state.winnerIds = []; state.privateNotice = {};
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
  if (drawn) player.hand.push(drawn);
}

export function legalMoves(state: GameState, playerId: string): Move[] {
  if (state.phase !== 'playing' || current(state).id !== playerId) return [];
  const actor = current(state);
  let playable = [...actor.hand];
  if (actor.hand.includes(7) && actor.hand.some(v => v === 5 || v === 6)) playable = [7];
  const moves: Move[] = [];
  for (const card of playable) {
    const others = targetable(state, actor.id);
    if (card === 1) {
      if (!others.length) moves.push({ card });
      for (const target of others) for (let guess = 2; guess <= 8; guess++) moves.push({ card, targetId: target.id, guess: guess as CardValue });
    } else if ([2, 3, 6].includes(card)) {
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
  const card = CARDS[move.card];
  state.log.push(`${actor.name} played ${card.name}.`);
  const target = move.targetId ? state.players.find(p => p.id === move.targetId) : undefined;

  if (move.card === 1 && target && move.guess) {
    state.log.push(`${actor.name} guessed ${CARDS[move.guess].name} for ${target.name}.`);
    if (target.hand[0] === move.guess) eliminate(state, target, 'the Guard guessed correctly');
  } else if (move.card === 2 && target) {
    state.privateNotice[actor.id] = `${target.name} holds the ${CARDS[target.hand[0]].name}.`;
  } else if (move.card === 3 && target) {
    const a = actor.hand[0], b = target.hand[0];
    if (a < b) eliminate(state, actor, `${target.name} won the comparison`);
    if (b < a) eliminate(state, target, `${actor.name} won the comparison`);
    if (a === b) state.log.push('The comparison was tied.');
  } else if (move.card === 4) {
    actor.protected = true;
  } else if (move.card === 5 && target) {
    const discarded = target.hand.splice(0, 1)[0];
    target.discards.push(discarded);
    state.log.push(`${target.name} discarded ${CARDS[discarded].name}.`);
    if (discarded === 8) eliminate(state, target, 'the Princess was discarded');
    else {
      const replacement = state.deck.pop() ?? state.setAside;
      state.setAside = undefined;
      if (replacement) target.hand.push(replacement);
    }
  } else if (move.card === 6 && target) {
    [actor.hand, target.hand] = [target.hand, actor.hand];
  } else if (move.card === 8) eliminate(state, actor, 'the Princess was played');

  finishTurn(state, rng);
}

function finishTurn(state: GameState, rng: () => number): void {
  if (active(state).length <= 1 || state.deck.length === 0) { finishRound(state); return; }
  do state.turnIndex = (state.turnIndex + 1) % state.players.length; while (current(state).eliminated);
  drawForTurn(state);
}

function finishRound(state: GameState): void {
  const survivors = active(state);
  const bestHand = Math.max(...survivors.map(p => p.hand[0] ?? 0));
  let winners = survivors.filter(p => (p.hand[0] ?? 0) === bestHand);
  if (winners.length > 1) {
    const bestDiscard = Math.max(...winners.map(p => p.discards.reduce((a, b) => a + b, 0)));
    winners = winners.filter(p => p.discards.reduce((a, b) => a + b, 0) === bestDiscard);
  }
  winners.forEach(p => p.tokens++);
  state.winnerIds = winners.map(p => p.id);
  state.log.push(`${winners.map(p => p.name).join(' & ')} won the round.`);
  const matchWinner = winners.find(p => p.tokens >= tokenTarget(state.players.length));
  if (matchWinner) { state.phase = 'match-over'; state.matchWinnerId = matchWinner.id; }
  else state.phase = 'round-over';
}

export function viewFor(state: GameState, playerId: string): GameView {
  const viewer = state.players.find(p => p.id === playerId);
  return {
    phase: state.phase,
    players: state.players.map(p => ({ id: p.id, name: p.name, tokens: p.tokens, protected: p.protected, eliminated: p.eliminated, connected: p.connected, bot: p.bot, handCount: p.hand.length, discards: p.discards })),
    hand: viewer?.hand ?? [], deckCount: state.deck.length, faceUpRemoved: state.faceUpRemoved,
    turnPlayerId: state.phase === 'playing' ? current(state).id : undefined, round: state.round,
    log: state.log.slice(-8), notice: state.privateNotice[playerId], winnerIds: state.winnerIds,
    matchWinnerId: state.matchWinnerId, legalMoves: legalMoves(state, playerId)
  };
}

export function chooseBotMove(state: GameState, playerId: string, rng = Math.random): Move {
  const moves = legalMoves(state, playerId);
  if (!moves.length) throw new Error('Bot has no legal move.');
  const useful = moves.filter(m => m.card !== 8 && !(m.card === 5 && m.targetId === playerId));
  const pool = useful.length ? useful : moves;
  return pool[Math.floor(rng() * pool.length)];
}
