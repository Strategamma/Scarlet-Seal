import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameView } from '../shared/game.js';
import { cardPlayPreview, needsPlayConfirmation, turnPresentation } from './turn-presentation.js';

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
  assert.match(turnPresentation(state, 'a').tip, /Keep the other/);
  assert.equal(turnPresentation(state, 'a', 1).phase, 'choose-target');
  assert.match(turnPresentation(state, 'a', 1).title, /guess/);
  const guess = turnPresentation(state, 'a', 1, 'b');
  assert.equal(guess.phase, 'guess');
  assert.deepEqual(guess.guesses, [0, 2]);
  assert.match(guess.tip, /correct guess/);
  assert.equal(turnPresentation(state, 'a', 1, 'b', 0).phase, 'confirm');
  assert.equal(turnPresentation(state, 'a', 1, 'b', 9).phase, 'guess');
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
  state.legalMoves = [{ card: 2 }];
  assert.match(turnPresentation(state, 'a', 2).title, /No available target/);
});

test('waiting, private review, and round completion have distinct phases', () => {
  const state = game();
  assert.equal(turnPresentation(state, 'b').phase, 'waiting');
  state.bottomChoiceCount = 2;
  assert.equal(turnPresentation(state, 'a').phase, 'case-review');
  assert.match(turnPresentation(state, 'a').tip, /private/);
  state.phase = 'round-over';
  assert.equal(turnPresentation(state, 'a').phase, 'round-result');
});

test('card previews explain every value, risky self-targets, and unavailable rivals', () => {
  const state = game();
  state.hand = [5, 9];
  for (let value = 0; value <= 9; value++) assert.ok(cardPlayPreview(state, value as 0, 0, 'b').length > 10);
  assert.match(cardPlayPreview(state, 5, 0, 'a'), /eliminated/);
  assert.match(cardPlayPreview(state, 9, 1), /eliminates you/);
  assert.match(cardPlayPreview(state, 2, 0), /no effect/);
  state.hand = [3, 7];
  assert.match(cardPlayPreview(state, 3, 0, 'b'), /Disguise \(7\)/);
  assert.match(cardPlayPreview(state, 7, 1, 'b'), /Alibi \(3\)/);
});

test('only moves that reveal Scarlet Evidence require an extra confirmation', () => {
  const state = game();
  state.hand = [5, 9];
  assert.equal(needsPlayConfirmation(state, { card: 5, targetId: 'a' }, 0), true);
  assert.equal(needsPlayConfirmation(state, { card: 5, targetId: 'b' }, 0), false);
  assert.equal(needsPlayConfirmation(state, { card: 9 }, 1), true);
  assert.equal(needsPlayConfirmation(state, { card: 1, targetId: 'b', guess: 0 }, 0), false);
  state.hand = [5, 4];
  assert.equal(needsPlayConfirmation(state, { card: 5, targetId: 'a' }, 0), false);
});

test('a player can still see their result after a rapid rival reply', () => {
  const state = game();
  state.publicActions = [
    { sequence: 1, actorId: 'a', card: 1, targetId: 'b', resolution: 'Incorrect: Bea stayed in the case.' },
    { sequence: 2, actorId: 'b', card: 4, resolution: 'Bea is protected until their next turn.' }
  ];
  state.lastAction = state.publicActions[1];
  assert.equal(turnPresentation(state, 'a').lastOwnAction?.sequence, 1);
  assert.equal(turnPresentation(state, 'c').lastOwnAction, undefined);
});
