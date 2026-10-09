import assert from 'node:assert/strict';
import test from 'node:test';
import { RoomService } from './rooms.js';

function setup() {
  const states: Parameters<ConstructorParameters<typeof RoomService>[0]>[2][] = [];
  const service = new RoomService((_socketId, _event, state) => states.push(state));
  const socket = { id: `socket-${Math.random()}`, join: () => undefined } as unknown as Parameters<RoomService['create']>[0];
  const session = service.create(socket, 'Host');
  return { service, session, states };
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
