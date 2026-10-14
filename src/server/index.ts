import express from 'express';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import type { ClientToServerEvents, Result, ServerToClientEvents, Session } from '../shared/protocol.js';
import { RoomService } from './rooms.js';
import { PostgresRoomStore } from './room-store.js';

const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, { cors: { origin: true } });
const service = new RoomService((socketId, event, data) => io.to(socketId).emit(event, data), process.env.DATABASE_URL ? new PostgresRoomStore(process.env.DATABASE_URL) : undefined);
await service.load();
const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use(express.static(dist));
app.get('*splat', (_req, res) => res.sendFile(resolve(dist, 'index.html')));

io.on('connection', socket => {
  let session = service.restore(socket, socket.handshake.auth as Partial<Session>);
  if (session) socket.emit('session', session);
  const attempt = async <T>(callback: (result: Result<T>) => void, task: () => T) => {
    if (typeof callback !== 'function') return;
    try { if (session && !service.isCurrent(session, socket.id)) throw new Error('Your seat is open in another tab. Reload to reclaim it.'); const value = task(); await service.flush(); callback({ ok: true, value }); } catch (error) { callback({ ok: false, error: error instanceof Error ? error.message : 'Something went wrong.' }); }
  };
  socket.on('room:create', (name, cb) => attempt(cb, () => { if (session) throw new Error('Leave your current table before opening another.'); session = service.create(socket, name); socket.emit('session', session); return session; }));
  socket.on('room:join', (input, cb) => attempt(cb, () => { if (session) throw new Error('Leave your current table before joining another.'); session = service.join(socket, input.code, input.name); socket.emit('session', session); return session; }));
  socket.on('rooms:list', cb => attempt(cb, () => service.availableRooms()));
  socket.on('room:ready', (ready, cb) => attempt(cb, () => { if (!session) throw new Error('Join a room first.'); service.ready(session, ready); return true as const; }));
  socket.on('room:return-lobby', cb => attempt(cb, () => { if (!session) throw new Error('Join a room first.'); service.returnLobby(session); return true as const; }));
  socket.on('room:resume', cb => attempt(cb, () => { if (!session) throw new Error('That seat is no longer available.'); socket.emit('room:state', service.state(session)); return true as const; }));
  socket.on('room:react', (text, cb) => attempt(cb, () => { if (!session) throw new Error('Join a room first.'); service.react(session, text); return true as const; }));
  socket.on('room:host-decision', (continueGame, cb) => attempt(cb, () => { if (!session) throw new Error('Join a room first.'); service.decideHostMigration(session, continueGame); return true as const; }));
  socket.on('room:add-bot', cb => attempt(cb, () => { if (!session) throw new Error('Join a room first.'); service.addBot(session); return true as const; }));
  socket.on('room:remove-bot', (botId, cb) => attempt(cb, () => { if (!session) throw new Error('Join a room first.'); service.removeBot(session, botId); return true as const; }));
  socket.on('room:leave', cb => attempt(cb, () => { if (!session) throw new Error('Join a room first.'); service.leave(session); session = undefined; return true as const; }));
  socket.on('game:start', cb => attempt(cb, () => { if (!session) throw new Error('Join a room first.'); service.start(session); return true as const; }));
  socket.on('game:play', (move, cb) => attempt(cb, () => { if (!session) throw new Error('Join a room first.'); service.play(session, move); return true as const; }));
  socket.on('game:return-cards', (cards, cb) => attempt(cb, () => { if (!session) throw new Error('Join a room first.'); service.returnCards(session, cards); return true as const; }));
  socket.on('game:next-round', cb => attempt(cb, () => { if (!session) throw new Error('Join a room first.'); service.nextRound(session); return true as const; }));
  socket.on('game:rematch', cb => attempt(cb, () => { if (!session) throw new Error('Join a room first.'); service.rematch(session); return true as const; }));
  socket.on('game:forfeit-disconnected', cb => attempt(cb, () => { if (!session) throw new Error('Join a room first.'); service.forfeitDisconnectedTurn(session); return true as const; }));
  socket.on('disconnect', () => { service.disconnect(socket.id); void service.flush().catch(error => console.error('Could not save disconnected seat:', error)); });
});

const port = Number(process.env.PORT ?? 3000);
httpServer.listen(port, '0.0.0.0', () => console.log(`Scarlet Seal listening on http://0.0.0.0:${port}`));
