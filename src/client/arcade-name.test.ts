import assert from 'node:assert/strict';
import test from 'node:test';
import { takeArcadeName } from './arcade-name.js';

test('takes a valid arcade hint and preserves other fragment parameters', () => {
  assert.deepEqual(takeArcadeName('#arcadeName=Sam+Player&invite=ABC'), { name: 'Sam Player', hash: '#invite=ABC' });
});

test('removes malformed or overlong hints without using them', () => {
  assert.deepEqual(takeArcadeName('#arcadeName=%20'), { name: undefined, hash: '' });
  assert.deepEqual(takeArcadeName(`#arcadeName=${'a'.repeat(21)}`), { name: undefined, hash: '' });
  assert.deepEqual(takeArcadeName('#arcadeName=%E0%A4%A'), { name: undefined, hash: '' });
  assert.deepEqual(takeArcadeName('#invite=ABC'), { hash: '#invite=ABC' });
});
