import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameView } from '../shared/game.js';
import { isNewPersonalTurn } from './turn-cue.js';

const state = (turnPlayerId: string, round = 1): GameView => ({
  phase: 'playing', turnPlayerId, round, players: [], hand: [], deckCount: 0, removedCount: 0,
  log: [], winnerIds: [], matchWinnerIds: [], legalMoves: [], bottomChoiceCount: 0, publicActions: []
});

test('personal turn cue fires once on handoff or a new round', () => {
  assert.equal(isNewPersonalTurn(state('b'), state('a'), 'a'), true);
  assert.equal(isNewPersonalTurn(state('a'), state('a'), 'a'), false);
  assert.equal(isNewPersonalTurn(state('a'), state('a', 2), 'a'), true);
  assert.equal(isNewPersonalTurn(state('b'), state('a'), 'b'), false);
  assert.equal(isNewPersonalTurn(undefined, state('a'), 'a'), true);
});
