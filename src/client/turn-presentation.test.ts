import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameView } from '../shared/game.js';
import { turnPresentation } from './turn-presentation.js';

const player = (id: string, name: string) => ({ id, name, tokens: 0, protected: false, eliminated: false, connected: true, bot: false, handCount: 1, discards: [] });
const game = (): GameView => ({
  phase: 'playing', players: [player('a', 'Ada'), player('b', 'Bea'), player('c', 'Cy')],
  hand: [1, 3], deckCount: 10, removedCount: 1, turnPlayerId: 'a', round: 1,
  log: [], publicActions: [], winnerIds: [], matchWinnerIds: [], bottomChoiceCount: 0,
  legalMoves: [{ card: 1, targetId: 'b', guess: 0 }, { card: 1, targetId: 'b', guess: 2 }, { card: 1, targetId: 'c', guess: 0 }, { card: 3, targetId: 'b' }]
});

test('turn presentation follows choose, target, zero-value guess, and confirmation', () => {
  const state = game();
  assert.equal(turnPresentation(state, 'a').phase, 'choose-card');
  assert.equal(turnPresentation(state, 'a', 1).phase, 'choose-target');
  const guess = turnPresentation(state, 'a', 1, 'b');
  assert.equal(guess.phase, 'guess');
  assert.deepEqual(guess.guesses, [0, 2]);
  assert.equal(turnPresentation(state, 'a', 3, 'b').phase, 'confirm');
});

test('forced cards, stale choices, and eliminated seats produce safe guidance', () => {
  const state = game();
  state.legalMoves = [{ card: 8 }];
  assert.equal(turnPresentation(state, 'a').forcedCard, 8);
  assert.equal(turnPresentation(state, 'a', 3).phase, 'choose-card');
  state.legalMoves = [{ card: 1, targetId: 'c', guess: 0 }];
  assert.equal(turnPresentation(state, 'a', 1, 'b').phase, 'choose-target');
  state.players[1].eliminated = true;
  assert.equal(turnPresentation(state, 'a').nextPlayer?.id, 'c');
});

test('waiting, private review, and round completion have distinct phases', () => {
  const state = game();
  assert.equal(turnPresentation(state, 'b').phase, 'waiting');
  state.bottomChoiceCount = 2;
  assert.equal(turnPresentation(state, 'a').phase, 'case-review');
  state.phase = 'round-over';
  assert.equal(turnPresentation(state, 'a').phase, 'round-result');
});
