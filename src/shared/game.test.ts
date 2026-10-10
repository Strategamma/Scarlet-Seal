import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseBotMove, chooseBotReturns, createGame, forfeitPlayer, legalMoves, makeDeck, playCard, returnCardsToBottom, tokenTarget, viewFor, type GameState } from './game.js';

const players = [
  { id: 'a', name: 'Ada', bot: false },
  { id: 'b', name: 'Bea', bot: false }
];
const game = () => createGame(players, () => 0.42);
const setTurn = (state: GameState, hand: [number, number], other: number) => {
  state.turnIndex = 0;
  state.players[0].hand = hand as GameState['players'][0]['hand'];
  state.players[1].hand = [other] as GameState['players'][0]['hand'];
  state.players.forEach(p => { p.eliminated = false; p.protected = false; p.discards = []; });
  state.deck = [2, 3, 4, 5] as GameState['deck'];
  state.phase = 'playing';
};

test('deck contains the full 21-card distribution', () => {
  const deck = makeDeck();
  assert.equal(deck.length, 21);
  assert.deepEqual([0,1,2,3,4,5,6,7,8,9].map(value => deck.filter(card => card === value).length), [2,6,2,2,2,2,2,1,1,1]);
});

test('games support six players and every table needs three seals', () => {
  const six = Array.from({ length: 6 }, (_, index) => ({ id: String(index), name: `Player ${index}`, bot: false }));
  assert.equal(createGame(six, () => 0.2).players.length, 6);
  assert.deepEqual([2, 3, 4, 5, 6].map(tokenTarget), [3, 3, 3, 3, 3]);
});

test('player views never reveal an opponent hand', () => {
  const state = game();
  state.players[1].discards = [0, 2, 4];
  const view = viewFor(state, 'a');
  assert.equal(view.hand.length, 2);
  assert.equal(view.players.find(p => p.id === 'b')?.handCount, 1);
  assert.equal('hand' in (view.players.find(p => p.id === 'b') as object), false);
  assert.deepEqual(view.players.find(p => p.id === 'b')?.discards, [0, 2, 4]);
  assert.equal(view.removedCount, 3);
  assert.equal('faceUpRemoved' in view, false);
});

test('Wiretap has no immediate effect and finishes the turn normally', () => {
  const state = game(); setTurn(state, [0, 4], 2);
  playCard(state, 'a', { card: 0 }, () => 0);
  assert.deepEqual(state.players[0].hand, [4]);
  assert.deepEqual(state.players[0].discards, [0]);
  assert.equal(state.turnIndex, 1);
});

test('Lead reveals privately before an empty deck ends the round', () => {
  const state = game(); setTurn(state, [2, 4], 9);
  state.deck = [];
  playCard(state, 'a', { card: 2, targetId: 'b' }, () => 0);
  assert.equal(state.privateNotice.a, 'Bea holds Scarlet Evidence.');
  assert.equal(state.phase, 'round-over');
  assert.match(state.roundSummary?.reason ?? '', /deck ran out.*Ada held Safehouse \(4\).*Bea held Scarlet Evidence \(9\)/);
  assert.deepEqual(state.roundSummary?.reveals, [{ playerId: 'a', card: 4 }, { playerId: 'b', card: 9 }]);
});

test('Red Herring is forced with Interrogation or Disguise', () => {
  const state = game(); setTurn(state, [8, 5], 2);
  assert.ok(legalMoves(state, 'a').every(move => move.card === 8));
});

test('Hunch can identify the zero-value Wiretap', () => {
  const state = game(); setTurn(state, [1, 4], 0);
  assert.ok(legalMoves(state, 'a').some(move => move.card === 1 && move.guess === 0));
  playCard(state, 'a', { card: 1, targetId: 'b', guess: 0 }, () => 0);
  assert.equal(state.players[1].eliminated, true);
  assert.equal(state.phase, 'round-over');
  assert.match(state.log[1], /Ada played Hunch on Bea/);
  assert.deepEqual(state.lastAction, { sequence: 1, actorId: 'a', card: 1, targetId: 'b', resolution: 'Correct: Bea was eliminated.' });
  assert.equal(state.roundSummary?.reason, 'Ada was the last investigator still in the case.');
  assert.deepEqual(state.roundSummary?.reveals, [{ playerId: 'a', card: 4 }]);
});

test('Alibi compares remaining hands immediately and reports the eliminated player', () => {
  const state = game(); setTurn(state, [3, 8], 2);
  playCard(state, 'a', { card: 3, targetId: 'b' }, () => 0);
  assert.equal(state.players[1].eliminated, true);
  assert.equal(state.lastAction?.resolution, 'Ada won the comparison; Bea was eliminated.');
  assert.equal(state.phase, 'round-over');
});

test('the third seal ends a match immediately after the round resolves', () => {
  const state = game(); setTurn(state, [1, 4], 2);
  state.players[0].tokens = 2;
  playCard(state, 'a', { card: 1, targetId: 'b', guess: 2 }, () => 0);
  assert.equal(state.players[0].tokens, 3);
  assert.equal(state.phase, 'match-over');
  assert.deepEqual(state.matchWinnerIds, ['a']);
});

test('Interrogation exposing Scarlet Evidence eliminates its holder', () => {
  const state = game(); setTurn(state, [5, 4], 9);
  playCard(state, 'a', { card: 5, targetId: 'b' }, () => 0);
  assert.equal(state.players[1].eliminated, true);
  assert.equal(state.players[0].tokens, 1);
});

test('Safehouse removes protected players from target choices', () => {
  const state = game(); setTurn(state, [1, 4], 2);
  state.players[1].protected = true;
  assert.deepEqual(legalMoves(state, 'a').filter(move => move.card === 1), [{ card: 1 }]);
});

test('Safehouse protection starts immediately and expires before the next draw', () => {
  const state = game(); setTurn(state, [4, 2], 4);
  state.deck = [1, 2, 3, 5];
  playCard(state, 'a', { card: 4 }, () => 0);
  assert.equal(state.players[0].protected, true);
  playCard(state, 'b', { card: 4 }, () => 0);
  assert.equal(state.turnIndex, 0);
  assert.equal(state.players[0].protected, false);
  assert.equal(state.players[0].hand.length, 2);
});

test('Interrogation discards and replaces a hand before the next turn draw', () => {
  const state = game(); setTurn(state, [5, 4], 0);
  state.setAside = 9;
  state.deck = [2, 3, 6];
  playCard(state, 'a', { card: 5, targetId: 'b' }, () => 0);
  assert.deepEqual(state.players[1].discards, [0]);
  assert.deepEqual(state.players[1].hand, [6, 3]);
  assert.equal(state.setAside, 9);
});

test('Case Review pauses for a private choice and returns cards to the bottom', () => {
  const state = game(); setTurn(state, [6, 9], 4);
  state.deck = [2, 3];
  playCard(state, 'a', { card: 6 }, () => 0);
  assert.deepEqual(state.players[0].hand, [9, 3, 2]);
  assert.deepEqual(state.pendingBottom, { playerId: 'a', count: 2 });
  assert.equal(legalMoves(state, 'a').length, 0);
  returnCardsToBottom(state, 'a', [2, 3], () => 0);
  assert.deepEqual(state.players[0].hand, [9]);
  assert.equal(state.pendingBottom, undefined);
  assert.equal(state.turnIndex, 1);
});

test('Disguise swaps hands immediately, then the next player draws', () => {
  const state = game(); setTurn(state, [7, 2], 8);
  playCard(state, 'a', { card: 7, targetId: 'b' }, () => 0);
  assert.deepEqual(state.players[0].hand, [8]);
  assert.deepEqual(state.players[1].hand, [2, 5]);
  assert.equal(state.turnIndex, 1);
});

test('Red Herring resolves with no effect and Scarlet Evidence eliminates immediately', () => {
  const redHerring = game(); setTurn(redHerring, [8, 2], 3);
  playCard(redHerring, 'a', { card: 8 }, () => 0);
  assert.deepEqual(redHerring.players[0].hand, [2]);
  assert.equal(redHerring.turnIndex, 1);

  const evidence = game(); setTurn(evidence, [9, 4], 2);
  playCard(evidence, 'a', { card: 9 }, () => 0);
  assert.equal(evidence.players[0].eliminated, true);
  assert.equal(evidence.phase, 'round-over');
});

test('a sole surviving Wiretap user gains bonus evidence as well as a round token', () => {
  const state = game(); setTurn(state, [4, 9], 3);
  state.players[0].discards = [0];
  state.deck = [];
  playCard(state, 'a', { card: 4 }, () => 0);
  assert.equal(state.players[0].tokens, 2);
  assert.match(state.log.at(-1)!, /Wiretap/);
});

test('six bots can complete a round including Case Review choices', () => {
  const six = Array.from({ length: 6 }, (_, index) => ({ id: String(index), name: `Bot ${index}`, bot: true }));
  const state = createGame(six, () => 0.42);
  let actions = 0;
  while (state.phase === 'playing' && actions++ < 100) {
    const actor = state.players[state.turnIndex];
    if (state.pendingBottom) returnCardsToBottom(state, actor.id, chooseBotReturns(state, actor.id), () => 0.42);
    else playCard(state, actor.id, chooseBotMove(state, actor.id, () => 0.42), () => 0.42);
  }
  assert.notEqual(state.phase, 'playing');
  assert.ok(actions < 100);
});

test('leaving on your turn forfeits and advances the game', () => {
  const state = game(); setTurn(state, [2, 4], 3);
  forfeitPlayer(state, 'a', () => 0);
  assert.equal(state.players[0].eliminated, true);
  assert.equal(state.phase, 'round-over');
  assert.match(state.log.at(-2)!, /left the case/);
});
