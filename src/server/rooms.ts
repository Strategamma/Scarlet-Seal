import { randomBytes } from 'node:crypto';
import type { Socket } from 'socket.io';
import { chooseBotMove, chooseBotReturns, createGame, forfeitPlayer, MAX_PLAYERS, playCard, returnCardsToBottom, startRound, viewFor, type CardValue, type GameState, type Move } from '../shared/game.js';
import type { AvailableRoom, ClientToServerEvents, RoomView, ServerToClientEvents, Session } from '../shared/protocol.js';

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
interface Member { id: string; token: string; name: string; bot: boolean; connected: boolean; socketId?: string }
interface Room { code: string; hostId: string; members: Member[]; game?: GameState; botTimer?: NodeJS.Timeout }

const rooms = new Map<string, Room>();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const id = () => randomBytes(8).toString('hex');
const token = () => randomBytes(18).toString('base64url');
const BOT_NAMES = ['Inspector Byte', 'Agent Cipher', 'Detective Dot', 'Constable Cache', 'Sleuth Zero'];
function roomCode(): string {
  do {
    let value = '';
    for (let i = 0; i < 5; i++) value += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(value)) return value;
  } while (true);
}
function safeName(value: string): string {
  const name = value.trim().replace(/\s+/g, ' ').slice(0, 20);
  if (!name) throw new Error('Enter a name.');
  return name;
}

export class RoomService {
  constructor(private emitToSocket: (socketId: string, event: 'room:state', data: RoomView) => void) {}

  create(socket: GameSocket, rawName: string): Session {
    const member: Member = { id: id(), token: token(), name: safeName(rawName), bot: false, connected: true, socketId: socket.id };
    const room: Room = { code: roomCode(), hostId: member.id, members: [member] };
    rooms.set(room.code, room); socket.join(room.code); this.push(room);
    return { roomCode: room.code, playerId: member.id, token: member.token };
  }

  join(socket: GameSocket, rawCode: string, rawName: string): Session {
    const room = this.get(rawCode);
    if (room.game) throw new Error('This game has already started.');
    if (room.members.length >= MAX_PLAYERS) throw new Error('This room is full.');
    const name = safeName(rawName);
    if (room.members.some(m => m.name.toLowerCase() === name.toLowerCase())) throw new Error('That name is already taken.');
    const member: Member = { id: id(), token: token(), name, bot: false, connected: true, socketId: socket.id };
    room.members.push(member); socket.join(room.code); this.push(room);
    return { roomCode: room.code, playerId: member.id, token: member.token };
  }

  restore(socket: GameSocket, session?: Partial<Session>): Session | undefined {
    if (!session?.roomCode || !session.playerId || !session.token) return;
    const room = rooms.get(session.roomCode.toUpperCase());
    const member = room?.members.find(m => m.id === session.playerId && m.token === session.token && !m.bot);
    if (!room || !member) return;
    member.connected = true; member.socketId = socket.id;
    const gamePlayer = room.game?.players.find(p => p.id === member.id);
    if (gamePlayer) gamePlayer.connected = true;
    socket.join(room.code); this.push(room); this.scheduleBot(room);
    return { roomCode: room.code, playerId: member.id, token: member.token };
  }

  addBot(session: Session): void {
    const { room, member } = this.authenticate(session);
    if (room.hostId !== member.id) throw new Error('Only the host can add a bot.');
    if (room.game) throw new Error('The game has already started.');
    if (room.members.length >= MAX_PLAYERS) throw new Error('This room is full.');
    const usedNames = new Set(room.members.map(existing => existing.name));
    const name = BOT_NAMES.find(candidate => !usedNames.has(candidate)) ?? `Court Bot ${room.members.filter(existing => existing.bot).length + 1}`;
    room.members.push({ id: id(), token: token(), name, bot: true, connected: true });
    this.push(room);
  }

  removeBot(session: Session, botId: string): void {
    const { room, member } = this.authenticate(session);
    if (room.hostId !== member.id) throw new Error('Only the host can remove a bot.');
    if (room.game) throw new Error('The game has already started.');
    const botIndex = room.members.findIndex(candidate => candidate.id === botId && candidate.bot);
    if (botIndex < 0) throw new Error('Bot not found.');
    room.members.splice(botIndex, 1);
    this.push(room);
  }

  leave(session: Session): void {
    const { room, member } = this.authenticate(session);
    if (room.game) {
      member.connected = false; member.socketId = undefined;
      const player = room.game.players.find(candidate => candidate.id === member.id);
      if (player) { player.connected = false; forfeitPlayer(room.game, player.id); }
      if (room.hostId === member.id) room.hostId = room.members.find(candidate => !candidate.bot && candidate.id !== member.id && candidate.connected)?.id ?? room.hostId;
      this.push(room); this.scheduleBot(room);
      return;
    }
    room.members = room.members.filter(candidate => candidate.id !== member.id);
    if (!room.members.length) { rooms.delete(room.code); return; }
    if (room.hostId === member.id) room.hostId = room.members.find(candidate => !candidate.bot)?.id ?? room.members[0].id;
    this.push(room);
  }

  start(session: Session): void {
    const { room, member } = this.authenticate(session);
    if (room.hostId !== member.id) throw new Error('Only the host can start.');
    if (room.members.length < 2) throw new Error('Add a bot or wait for another player.');
    room.game = createGame(room.members.map(m => ({ id: m.id, name: m.name, bot: m.bot })));
    this.push(room); this.scheduleBot(room);
  }

  play(session: Session, move: Move): void {
    const { room, member } = this.authenticate(session);
    if (!room.game) throw new Error('The game has not started.');
    playCard(room.game, member.id, move);
    this.push(room); this.scheduleBot(room);
  }

  returnCards(session: Session, cards: CardValue[]): void {
    const { room, member } = this.authenticate(session);
    if (!room.game) throw new Error('The game has not started.');
    returnCardsToBottom(room.game, member.id, cards);
    this.push(room); this.scheduleBot(room);
  }

  nextRound(session: Session): void {
    const { room, member } = this.authenticate(session);
    if (room.hostId !== member.id) throw new Error('Only the host can begin the next round.');
    if (!room.game || room.game.phase !== 'round-over') throw new Error('The round is not over.');
    startRound(room.game); this.push(room); this.scheduleBot(room);
  }

  disconnect(socketId: string): void {
    for (const room of rooms.values()) {
      const member = room.members.find(m => m.socketId === socketId);
      if (!member) continue;
      member.connected = false; member.socketId = undefined;
      const player = room.game?.players.find(p => p.id === member.id);
      if (player) player.connected = false;
      this.push(room); break;
    }
  }

  state(session: Session): RoomView {
    const { room } = this.authenticate(session);
    return this.view(room, session.playerId);
  }

  availableRooms(): AvailableRoom[] {
    return [...rooms.values()]
      .filter(room => !room.game && room.members.length < MAX_PLAYERS && room.members.some(member => !member.bot))
      .map(room => ({
        code: room.code,
        hostName: room.members.find(member => member.id === room.hostId)?.name ?? 'Unknown host',
        playerCount: room.members.length,
        botCount: room.members.filter(member => member.bot).length,
        maxPlayers: MAX_PLAYERS
      }))
      .sort((left, right) => right.playerCount - left.playerCount || left.code.localeCompare(right.code));
  }

  private authenticate(session: Session): { room: Room; member: Member } {
    const room = this.get(session.roomCode);
    const member = room.members.find(m => m.id === session.playerId && m.token === session.token);
    if (!member) throw new Error('Your session is no longer valid.');
    return { room, member };
  }
  private get(code: string): Room {
    const room = rooms.get(code.trim().toUpperCase());
    if (!room) throw new Error('Room not found. Check the code and try again.');
    return room;
  }
  private view(room: Room, playerId: string): RoomView {
    return {
      code: room.code,
      players: room.members.map(m => ({ id: m.id, name: m.name, bot: m.bot, connected: m.connected, host: m.id === room.hostId })),
      game: room.game ? viewFor(room.game, playerId) : undefined,
      canStart: room.hostId === playerId && !room.game && room.members.length >= 2
    };
  }
  private push(room: Room): void {
    for (const member of room.members) if (!member.bot && member.socketId) this.emitToSocket(member.socketId, 'room:state', this.view(room, member.id));
  }
  private scheduleBot(room: Room): void {
    if (room.botTimer || room.game?.phase !== 'playing') return;
    const player = room.game.players[room.game.turnIndex];
    if (!player.bot) return;
    room.botTimer = setTimeout(() => {
      room.botTimer = undefined;
      if (!room.game || room.game.phase !== 'playing') return;
      const bot = room.game.players[room.game.turnIndex];
      if (!bot.bot) return;
      if (room.game.pendingBottom?.playerId === bot.id) returnCardsToBottom(room.game, bot.id, chooseBotReturns(room.game, bot.id));
      else playCard(room.game, bot.id, chooseBotMove(room.game, bot.id));
      this.push(room); this.scheduleBot(room);
    }, 700);
  }
}
