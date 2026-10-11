import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalSolo } from './local-solo.js';

test('offline solo restores the same private hand and round', () => {
  const solo = LocalSolo.create();
  const restored = LocalSolo.parse(JSON.stringify(solo.game));
  assert.deepEqual(restored?.view().game?.hand, solo.view().game?.hand);
  assert.equal(restored?.view().game?.round, solo.view().game?.round);
  assert.equal(restored?.view().players[0].host, true);
  assert.equal(LocalSolo.parse('{bad'), undefined);
});

test('offline solo can finish a complete round with the same rules', () => {
  const solo = LocalSolo.create();
  for (let turns = 0; turns < 100 && solo.game.phase === 'playing'; turns++) {
    if (solo.botTurn) solo.advanceBot();
    else if (solo.game.pendingBottom?.playerId === solo.session.playerId) {
      const hand = solo.view().game!.hand;
      solo.returnCards(hand.slice(1));
    } else {
      const move = solo.view().game!.legalMoves[0];
      assert.ok(move);
      solo.play(move);
    }
  }
  assert.notEqual(solo.game.phase, 'playing');
});
