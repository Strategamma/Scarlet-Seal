import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame, legalMoves, makeDeck, playCard, viewFor, type GameState } from './game.js';

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

test('deck contains the classic 16-card distribution', () => {
  const deck = makeDeck();
  assert.equal(deck.length, 16);
  assert.deepEqual([1,2,3,4,5,6,7,8].map(value => deck.filter(card => card === value).length), [5,2,2,2,2,1,1,1]);
});

test('player views never reveal an opponent hand', () => {
  const state = game();
  const view = viewFor(state, 'a');
  assert.equal(view.hand.length, 2);
  assert.equal(view.players.find(p => p.id === 'b')?.handCount, 1);
  assert.equal('hand' in (view.players.find(p => p.id === 'b') as object), false);
});

test('Countess is forced when held with a Prince or King', () => {
  const state = game(); setTurn(state, [7, 5], 2);
  assert.ok(legalMoves(state, 'a').every(move => move.card === 7));
});

test('Guard eliminates on a correct non-Guard guess', () => {
  const state = game(); setTurn(state, [1, 4], 8);
  playCard(state, 'a', { card: 1, targetId: 'b', guess: 8 }, () => 0);
  assert.equal(state.players[1].eliminated, true);
  assert.equal(state.phase, 'round-over');
});

test('Prince discarding the Princess eliminates its holder', () => {
  const state = game(); setTurn(state, [5, 4], 8);
  playCard(state, 'a', { card: 5, targetId: 'b' }, () => 0);
  assert.equal(state.players[1].eliminated, true);
  assert.equal(state.players[0].tokens, 1);
});

test('Handmaid removes protected players from target choices', () => {
  const state = game(); setTurn(state, [1, 4], 2);
  state.players[1].protected = true;
  assert.deepEqual(legalMoves(state, 'a').filter(move => move.card === 1), [{ card: 1 }]);
});
