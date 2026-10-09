import express from 'express';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import type { ClientToServerEvents, Result, ServerToClientEvents, Session } from '../shared/protocol.js';
import { RoomService } from './rooms.js';

const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, { cors: { origin: true } });
const service = new RoomService((socketId, event, data) => io.to(socketId).emit(event, data));
const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use(express.static(dist));
app.get('*splat', (_req, res) => res.sendFile(resolve(dist, 'index.html')));

io.on('connection', socket => {
  let session = service.restore(socket, socket.handshake.auth as Partial<Session>);
  if (session) socket.emit('session', session);
  const attempt = <T>(callback: (result: Result<T>) => void, task: () => T) => {
    try { callback({ ok: true, value: task() }); } catch (error) { callback({ ok: false, error: error instanceof Error ? error.message : 'Something went wrong.' }); }
  };
  socket.on('room:create', (name, cb) => attempt(cb, () => { session = service.create(socket, name); socket.emit('session', session); return session; }));
  socket.on('room:join', (input, cb) => attempt(cb, () => { session = service.join(socket, input.code, input.name); socket.emit('session', session); return session; }));
  socket.on('room:add-bot', cb => attempt(cb, () => { if (!session) throw new Error('Join a room first.'); service.addBot(session); return true as const; }));
  socket.on('room:remove-bot', (botId, cb) => attempt(cb, () => { if (!session) throw new Error('Join a room first.'); service.removeBot(session, botId); return true as const; }));
  socket.on('game:start', cb => attempt(cb, () => { if (!session) throw new Error('Join a room first.'); service.start(session); return true as const; }));
  socket.on('game:play', (move, cb) => attempt(cb, () => { if (!session) throw new Error('Join a room first.'); service.play(session, move); return true as const; }));
  socket.on('game:next-round', cb => attempt(cb, () => { if (!session) throw new Error('Join a room first.'); service.nextRound(session); return true as const; }));
  socket.on('disconnect', () => service.disconnect(socket.id));
});

const port = Number(process.env.PORT ?? 3000);
httpServer.listen(port, '0.0.0.0', () => console.log(`Scarlet Seal listening on http://0.0.0.0:${port}`));
