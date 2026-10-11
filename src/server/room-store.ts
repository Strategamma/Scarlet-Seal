import { Pool } from 'pg';
import type { GameState } from '../shared/game.js';
import type { HostMigration, Reaction } from '../shared/protocol.js';

export interface RoomSnapshot {
  code: string;
  hostId: string;
  members: { id: string; token: string; name: string; bot: boolean }[];
  game?: GameState;
  reaction?: Reaction;
  reactionSequence: number;
  migration?: HostMigration;
}

export interface RoomStore {
  load(): Promise<RoomSnapshot[]>;
  save(room: RoomSnapshot): Promise<void>;
  remove(code: string): Promise<void>;
}

export class PostgresRoomStore implements RoomStore {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 3 });
  }

  async load(): Promise<RoomSnapshot[]> {
    await this.pool.query('CREATE TABLE IF NOT EXISTS scarlet_rooms (code varchar(5) PRIMARY KEY, state jsonb NOT NULL)');
    const result = await this.pool.query<{ state: RoomSnapshot }>('SELECT state FROM scarlet_rooms');
    return result.rows.map(row => row.state);
  }

  async save(room: RoomSnapshot): Promise<void> {
    await this.pool.query('INSERT INTO scarlet_rooms (code, state) VALUES ($1, $2) ON CONFLICT (code) DO UPDATE SET state = EXCLUDED.state', [room.code, JSON.stringify(room)]);
  }

  async remove(code: string): Promise<void> {
    await this.pool.query('DELETE FROM scarlet_rooms WHERE code = $1', [code]);
  }
}
