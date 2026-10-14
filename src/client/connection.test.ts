import assert from 'node:assert/strict';
import test from 'node:test';
import {isLocalServer, validInvitation, joinLink} from './connection.js';
test('local guidance applies only to local-address origins', () => {
  for (const host of ['localhost','10.0.0.4','192.168.1.2','172.16.0.2','172.31.255.255','[::1]','fd12::1','host.local']) assert(isLocalServer(host));
  for (const host of ['scarlet-seal.onrender.com','172.32.0.1','8.8.8.8','10.999.0.1']) assert.equal(isLocalServer(host),false);
});
test('invitation validates room format and carries only the room code', () => {
  assert(validInvitation('AB2CD')); assert.equal(validInvitation('ABCDE<script>'),false);
  assert.equal(joinLink('https://game.example', 'AB2CD'),'https://game.example/?room=AB2CD');
});
