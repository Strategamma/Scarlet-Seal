import type { CardValue, GameView, Move } from './game.js';

export interface LobbyPlayer { id: string; name: string; bot: boolean; connected: boolean; host: boolean }
export interface Reaction { sequence: number; playerId: string; text: 'Suspicious' | 'Nice try' | 'Case closed' }
export interface RoomView { code: string; players: LobbyPlayer[]; game?: GameView; canStart: boolean; reaction?: Reaction }
export interface AvailableRoom { code: string; hostName: string; playerCount: number; botCount: number; maxPlayers: number }
export interface Session { roomCode: string; playerId: string; token: string }

export interface ClientToServerEvents {
  'room:create': (name: string, callback: (result: Result<Session>) => void) => void;
  'room:join': (input: { code: string; name: string }, callback: (result: Result<Session>) => void) => void;
  'rooms:list': (callback: (result: Result<AvailableRoom[]>) => void) => void;
  'room:resume': (callback: (result: Result<true>) => void) => void;
  'room:react': (text: Reaction['text'], callback: (result: Result<true>) => void) => void;
  'room:add-bot': (callback: (result: Result<true>) => void) => void;
  'room:remove-bot': (botId: string, callback: (result: Result<true>) => void) => void;
  'room:leave': (callback: (result: Result<true>) => void) => void;
  'game:start': (callback: (result: Result<true>) => void) => void;
  'game:play': (move: Move, callback: (result: Result<true>) => void) => void;
  'game:return-cards': (cards: CardValue[], callback: (result: Result<true>) => void) => void;
  'game:next-round': (callback: (result: Result<true>) => void) => void;
}
export interface ServerToClientEvents { 'room:state': (state: RoomView) => void; 'session': (session: Session) => void }
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
