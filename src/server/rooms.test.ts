import assert from 'node:assert/strict';
import test from 'node:test';
import { RoomService } from './rooms.js';
import type { GameState } from '../shared/game.js';

function setup() {
  const states: Parameters<ConstructorParameters<typeof RoomService>[0]>[2][] = [];
  const service = new RoomService((_socketId, _event, state) => states.push(state));
  const socket = { id: `socket-${Math.random()}`, join: () => undefined } as unknown as Parameters<RoomService['create']>[0];
  const session = service.create(socket, 'Host');
  return { service, session, states, socket };
}

test('a host can fill all six seats with bots', () => {
  const { service, session } = setup();
  for (let index = 0; index < 5; index++) service.addBot(session);
  const room = service.state(session);
  assert.equal(room.players.length, 6);
  assert.equal(room.players.filter(player => player.bot).length, 5);
  assert.equal(new Set(room.players.map(player => player.name)).size, 6);
  assert.throws(() => service.addBot(session), /room is full/i);
});

test('a host can remove a bot before starting', () => {
  const { service, session } = setup();
  service.addBot(session);
  const bot = service.state(session).players.find(player => player.bot)!;
  service.removeBot(session, bot.id);
  assert.equal(service.state(session).players.length, 1);
  assert.equal(service.state(session).canStart, false);
});

test('two occupied seats are enough to start', () => {
  const { service, session } = setup();
  service.addBot(session);
  assert.equal(service.state(session).canStart, true);
});

test('available rooms expose only safe summaries for joinable lobbies', () => {
  const { service, session } = setup();
  service.addBot(session);
  const [listed] = service.availableRooms().filter(room => room.code === session.roomCode);
  assert.deepEqual(listed, { code: session.roomCode, hostName: 'Host', playerCount: 2, botCount: 1, maxPlayers: 6 });
  service.start(session);
  assert.equal(service.availableRooms().some(room => room.code === session.roomCode), false);
});

test('leaving a lobby removes the member cleanly', () => {
  const { service, session } = setup();
  service.addBot(session);
  service.leave(session);
  assert.throws(() => service.state(session), /session is no longer valid/i);
});

test('disconnecting host transfers control to a connected human', () => {
  const { service, session, socket } = setup();
  const guestSocket = { id: `guest-${Math.random()}`, join: () => undefined } as unknown as Parameters<RoomService['join']>[0];
  const guest = service.join(guestSocket, session.roomCode, 'Guest');
  service.disconnect(socket.id);
  assert.equal(service.state(guest).players.find(player => player.id === guest.playerId)?.host, true);
  assert.equal(service.state(guest).canStart, true);
});

test('reactions are bounded and visible to the room', () => {
  const { service, session } = setup();
  service.react(session, 'Suspicious');
  assert.deepEqual(service.state(session).reaction, { sequence: 1, playerId: session.playerId, text: 'Suspicious' });
  assert.throws(() => service.react(session, 'Nope' as 'Suspicious'), /not available/i);
});

test('a host can replay with the same connected seats and fresh scores', () => {
  const { service, session } = setup();
  const guestSocket = { id: `guest-${Math.random()}`, join: () => undefined } as unknown as Parameters<RoomService['join']>[0];
  const guest = service.join(guestSocket, session.roomCode, 'Guest');
  service.start(session);
  assert.throws(() => service.start(session), /already started/i);
  assert.throws(() => service.rematch(session), /finish the match/i);
  const room = (service as unknown as { get(code: string): { game: GameState } }).get(session.roomCode);
  room.game.phase = 'match-over';
  room.game.players[0].tokens = 3;
  assert.throws(() => service.rematch(guest), /only the host/i);
  service.rematch(session);
  const replay = service.state(session);
  assert.equal(replay.code, session.roomCode);
  assert.deepEqual(replay.players.map(player => player.id), [session.playerId, guest.playerId]);
  assert.equal(replay.game?.phase, 'playing');
  assert.equal(replay.game?.round, 1);
  assert.deepEqual(replay.game?.players.map(player => player.tokens), [0, 0]);
});

test('a rematch replaces departed people with a bot when one player remains', () => {
  const { service, session } = setup();
  const guestSocket = { id: `guest-${Math.random()}`, join: () => undefined } as unknown as Parameters<RoomService['join']>[0];
  const guest = service.join(guestSocket, session.roomCode, 'Guest');
  service.start(session);
  service.disconnect(guestSocket.id);
  const room = (service as unknown as { get(code: string): { game: GameState } }).get(session.roomCode);
  room.game.phase = 'match-over';
  service.rematch(session);
  const replay = service.state(session);
  assert.equal(replay.players.length, 2);
  assert.equal(replay.players[1].bot, true);
  assert.throws(() => service.state(guest), /session is no longer valid/i);
});
