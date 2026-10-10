import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameView } from '../shared/game.js';
import { gameEvents } from './game-events.js';

const state = (): GameView => ({
  phase: 'playing', round: 1, players: [
    { id: 'a', name: 'Ada', tokens: 0, protected: false, eliminated: false, connected: true, bot: false, handCount: 1, discards: [] },
    { id: 'b', name: 'Bea', tokens: 0, protected: false, eliminated: false, connected: true, bot: true, handCount: 1, discards: [] }
  ], hand: [2], deckCount: 10, removedCount: 1, turnPlayerId: 'b', log: [], publicActions: [],
  winnerIds: [], matchWinnerIds: [], legalMoves: [], bottomChoiceCount: 0
});

test('visual cues follow authoritative changes once', () => {
  const before = state();
  const after = state();
  after.turnPlayerId = 'a';
  after.hand = [2, 5];
  after.lastAction = { sequence: 1, actorId: 'b', card: 3, resolution: 'Ada was eliminated.' };
  after.players[1].discards = [3];
  after.players[1].tokens = 1;
  after.players[0].eliminated = true;
  after.players[1].protected = true;
  const cues = gameEvents(before, after, 'a');
  assert.equal(cues.actionPlayed, true);
  assert.equal(cues.turnChanged, true);
  assert.equal(cues.drawFromIndex, 1);
  assert.equal(cues.newDiscardCounts.get('b'), 0);
  assert.deepEqual([...cues.earnedSeals], ['b']);
  assert.deepEqual([...cues.newlyOut], ['a']);
  assert.deepEqual([...cues.newlyProtected], ['b']);
  assert.equal(gameEvents(after, after, 'a').actionPlayed, false);
  assert.equal(gameEvents(after, after, 'a').drawFromIndex, undefined);
});

test('a private action resolution updates without replaying the card', () => {
  const before = state();
  before.lastAction = { sequence: 2, actorId: 'a', card: 6, resolution: 'Choosing cards.' };
  const after = state();
  after.lastAction = { sequence: 2, actorId: 'a', card: 6, resolution: 'Returned two cards.' };
  const cues = gameEvents(before, after, 'a');
  assert.equal(cues.actionPlayed, false);
  assert.equal(cues.actionResolved, true);
});

test('new rounds deal without treating old discards as fresh', () => {
  const before = state();
  const after = state();
  after.round = 2;
  after.players[0].discards = [1];
  const cues = gameEvents(before, after, 'a');
  assert.equal(cues.roundStarted, true);
  assert.equal(cues.newDiscardCounts.size, 0);
  assert.equal(cues.turnChanged, false);
});
