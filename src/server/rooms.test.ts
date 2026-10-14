import assert from 'node:assert/strict';
import test from 'node:test';
import { RoomService } from './rooms.js';
import type { GameState } from '../shared/game.js';
import type { RoomSnapshot, RoomStore } from './room-store.js';
import type { Session } from '../shared/protocol.js';

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

test('a lobby disappears from public listings while its host is unavailable', () => {
  const { service, session, socket } = setup();
  service.addBot(session);
  assert.equal(service.availableRooms().some(room => room.code === session.roomCode), true);
  service.disconnect(socket.id);
  assert.equal(service.availableRooms().some(room => room.code === session.roomCode), false);
  service.restore(socket, session);
  assert.equal(service.availableRooms().some(room => room.code === session.roomCode), true);
});

test('starting a lobby replaces an absent guest instead of trapping the first turn', () => {
  const { service, session } = setup();
  const guestSocket = { id: `absent-${Math.random()}`, join: () => undefined } as unknown as Parameters<RoomService['join']>[0];
  const guest = service.join(guestSocket, session.roomCode, 'Guest');
  service.ready(guest, true);
  service.disconnect(guestSocket.id);
  service.start(session);
  const view = service.state(session);
  assert.equal(view.game?.players.length, 2);
  assert.equal(view.game?.players.some(player => player.bot), true);
  assert.equal(view.game?.players.some(player => player.id === guest.playerId), false);
  assert.equal(view.game?.players.every(player => player.connected), true);
});

test('leaving a lobby removes the member cleanly', () => {
  const { service, session } = setup();
  service.addBot(session);
  service.leave(session);
  assert.throws(() => service.state(session), /room not found/i);
  const laterSocket = { id: `later-${Math.random()}`, join: () => undefined } as unknown as Parameters<RoomService['join']>[0];
  assert.throws(() => service.join(laterSocket, session.roomCode, 'Later'), /room not found/i);
});

test('disconnecting host pauses the table until connected players consent', () => {
  const { service, session, socket } = setup();
  const guestSocket = { id: `guest-${Math.random()}`, join: () => undefined } as unknown as Parameters<RoomService['join']>[0];
  const guest = service.join(guestSocket, session.roomCode, 'Guest');
  service.ready(guest, true);
  service.disconnect(socket.id);
  assert.equal(service.state(guest).migration?.candidateId, guest.playerId);
  assert.equal(service.state(guest).canStart, false);
  assert.throws(() => service.start(guest), /paused/i);
  service.decideHostMigration(guest, true);
  assert.equal(service.state(guest).migration, undefined);
  assert.equal(service.state(guest).players.find(player => player.id === guest.playerId)?.host, true);
  assert.equal(service.state(guest).canStart, true);
  service.restore(socket, session);
  assert.equal(service.state(guest).players.find(player => player.id === guest.playerId)?.host, true);
});

test('host returning before consent resumes with the same host', () => {
  const { service, session, socket } = setup();
  const guestSocket = { id: `guest-${Math.random()}`, join: () => undefined } as unknown as Parameters<RoomService['join']>[0];
  const guest = service.join(guestSocket, session.roomCode, 'Guest');
  service.ready(guest, true);
  service.start(session);
  service.disconnect(socket.id);
  assert.equal(service.state(guest).migration?.candidateId, guest.playerId);
  service.restore(socket, session);
  assert.equal(service.state(session).migration, undefined);
  assert.equal(service.state(session).players.find(player => player.id === session.playerId)?.host, true);
});

test('all connected people must agree before host control moves', () => {
  const { service, session, socket } = setup();
  const guestSocket = { id: `guest-${Math.random()}`, join: () => undefined } as unknown as Parameters<RoomService['join']>[0];
  const thirdSocket = { id: `third-${Math.random()}`, join: () => undefined } as unknown as Parameters<RoomService['join']>[0];
  const guest = service.join(guestSocket, session.roomCode, 'Guest');
  service.ready(guest, true);
  const third = service.join(thirdSocket, session.roomCode, 'Third');
  service.ready(third, true);
  service.start(session);
  service.disconnect(socket.id);
  const before = service.state(guest).game;
  service.decideHostMigration(guest, true);
  assert.equal(service.state(guest).migration?.approvedIds.length, 1);
  assert.throws(() => service.nextRound(guest), /paused/i);
  service.decideHostMigration(third, false);
  assert.equal(service.state(guest).migration?.approvedIds.length, 1);
  service.decideHostMigration(third, true);
  assert.equal(service.state(guest).migration, undefined);
  assert.equal(service.state(guest).players.find(player => player.id === guest.playerId)?.host, true);
  assert.equal(service.state(guest).game?.round, before?.round);
  assert.deepEqual(service.state(guest).game?.players.map(player => player.tokens), before?.players.map(player => player.tokens));
});

test('saved room restores private state and seats after a server restart', async () => {
  const snapshots = new Map<string, RoomSnapshot>();
  const store: RoomStore = {
    load: async () => [...snapshots.values()].map(snapshot => structuredClone(snapshot)),
    save: async snapshot => { snapshots.set(snapshot.code, structuredClone(snapshot)); },
    remove: async code => { snapshots.delete(code); }
  };
  const socket = { id: `store-${Math.random()}`, join: () => undefined } as unknown as Parameters<RoomService['create']>[0];
  const service = new RoomService(() => undefined, store);
  const session = service.create(socket, 'Host');
  service.addBot(session);
  service.start(session);
  const hand = service.state(session).game?.hand;
  await service.flush();

  const restarted = new RoomService(() => undefined, store);
  await restarted.load();
  const returningSocket = { id: `return-${Math.random()}`, join: () => undefined } as unknown as Parameters<RoomService['restore']>[0];
  assert.deepEqual(restarted.restore(returningSocket, session), session);
  assert.deepEqual(restarted.state(session).game?.hand, hand);
  assert.equal(restarted.state(session).migration, undefined);
  await restarted.flush();
});

test('new host can resolve a disconnected turn and keep the match moving', () => {
  const { service, session, socket } = setup();
  const guestSocket = { id: `guest-${Math.random()}`, join: () => undefined } as unknown as Parameters<RoomService['join']>[0];
  const guest = service.join(guestSocket, session.roomCode, 'Guest');
  service.ready(guest, true);
  service.start(session);
  const room = (service as unknown as { get(code: string): { game: GameState } }).get(session.roomCode);
  room.game.turnIndex = room.game.players.findIndex(player => player.id === session.playerId);
  service.disconnect(socket.id);
  assert.throws(() => service.forfeitDisconnectedTurn(guest), /paused/i);
  service.decideHostMigration(guest, true);
  service.forfeitDisconnectedTurn(guest);
  assert.equal(service.state(guest).game?.phase, 'round-over');
  service.nextRound(guest);
  assert.equal(service.state(guest).game?.round, 2);
});

test('host migration works while a round result is awaiting the next deal', () => {
  const { service, session, socket } = setup();
  const guestSocket = { id: `guest-${Math.random()}`, join: () => undefined } as unknown as Parameters<RoomService['join']>[0];
  const guest = service.join(guestSocket, session.roomCode, 'Guest');
  service.ready(guest, true);
  service.start(session);
  const room = (service as unknown as { get(code: string): { game: GameState } }).get(session.roomCode);
  room.game.phase = 'round-over';
  service.disconnect(socket.id);
  service.decideHostMigration(guest, true);
  service.nextRound(guest);
  assert.equal(service.state(guest).game?.round, 2);
  room.game.phase = 'match-over';
  service.disconnect(guestSocket.id);
  assert.ok(service.state(session).migration);
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
  service.ready(guest, true);
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
  service.ready(guest, true);
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

test('connected guests must ready before starting; reopening resets readiness', () => {
  const {service,session} = setup();
  const guestSocket = {id:`ready-${Math.random()}`,join:()=>undefined} as unknown as Parameters<RoomService['join']>[0];
  const guest = service.join(guestSocket,session.roomCode,'Guest');
  assert.equal(service.state(session).canStart,false);
  assert.throws(()=>service.start(session),/mark ready/);
  service.ready(guest,true); service.start(session);
  const room = (service as unknown as {get(code:string):{game:GameState}}).get(session.roomCode);
  room.game.phase='match-over'; service.returnLobby(session);
  assert.equal(service.state(session).game,undefined);
  assert.equal(service.state(session).players.find(player=>player.id===guest.playerId)?.ready,false);
  assert.equal(service.state(session).canStart,false);
});

test('readiness snapshots preserve seats and reject obsolete socket ownership', async () => {
  const snapshots=new Map<string,RoomSnapshot>();
  const store:RoomStore={load:async()=>[...snapshots.values()].map(value=>structuredClone(value)),save:async value=>{snapshots.set(value.code,structuredClone(value));},remove:async code=>{snapshots.delete(code);}};
  const socket={id:'snapshot-host',join:()=>undefined} as unknown as Parameters<RoomService['create']>[0];
  const service=new RoomService(()=>undefined,store);const host=service.create(socket,'Host');
  const guestSocket={id:'snapshot-guest',join:()=>undefined} as unknown as Parameters<RoomService['join']>[0];
  const guest=service.join(guestSocket,host.roomCode,'Guest');service.ready(guest,true);await service.flush();
  const restarted=new RoomService(()=>undefined,store);await restarted.load();
  const replacement={id:'snapshot-host-new',join:()=>undefined} as unknown as Parameters<RoomService['restore']>[0];
  restarted.restore(replacement,host);restarted.restore(guestSocket,guest);
  assert.equal(restarted.state(host).canStart,true);
  assert.equal(restarted.isCurrent(host,socket.id),false);assert.equal(restarted.isCurrent(host,replacement.id),true);
  assert.equal(restarted.restore(socket,{roomCode:42} as unknown as Session),undefined);
});

test('Scarlet Night counts each completed match once across reconnects, rematches and snapshots', async () => {
  const snapshots = new Map<string, RoomSnapshot>();
  const store: RoomStore = { load: async () => [...snapshots.values()].map(s => structuredClone(s)), save: async s => { snapshots.set(s.code, structuredClone(s)); }, remove: async code => { snapshots.delete(code); } };
  const socket = { id: 'night-host', join: () => undefined } as unknown as Parameters<RoomService['create']>[0];
  const service = new RoomService(() => undefined, store); const session = service.create(socket, 'Night host');
  service.addBot(session); service.start(session);
  const game = (service as unknown as { get(code: string): { game: GameState } }).get(session.roomCode).game;
  game.phase = 'match-over'; game.matchWinnerIds = [session.playerId]; game.players.find(p => p.id === session.playerId)!.tokens = 3;
  service.restore(socket, session); service.restore(socket, session);
  assert.equal(service.state(session).night?.matches, 1);
  assert.equal(service.state(session).night?.players.find(p => p.id === session.playerId)?.wins, 1);
  assert.equal(service.state(session).night?.players.find(p => p.id === session.playerId)?.seals, 3);
  await service.flush(); const restored = new RoomService(() => undefined, store); await restored.load(); restored.restore(socket, session);
  assert.equal(restored.state(session).night?.matches, 1);
  restored.rematch(session); assert.equal(restored.state(session).night?.matches, 1);
  const second = (restored as unknown as { get(code: string): { game: GameState } }).get(session.roomCode).game;
  second.phase = 'match-over'; second.matchWinnerIds = [session.playerId]; second.players.find(p => p.id === session.playerId)!.tokens = 3;
  restored.restore(socket, session); assert.equal(restored.state(session).night?.matches, 2);
  assert.equal(restored.state(session).night?.players.find(p => p.id === session.playerId)?.seals, 6);
  restored.returnLobby(session); assert.equal(restored.state(session).night?.matches, 2);
});
