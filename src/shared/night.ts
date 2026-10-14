import type { GameState } from './game.js';
export interface NightPlayer { id: string; name: string; bot: boolean; matches: number; wins: number; seals: number }
export interface ScarletNight { startedAt: string; matches: number; players: NightPlayer[] }
export function recordNightMatch(night: ScarletNight, game: GameState): ScarletNight {
  if (game.phase !== 'match-over') return night;
  const players = night.players.map(player => ({ ...player }));
  for (const player of game.players) {
    let entry = players.find(entry => entry.id === player.id);
    if (!entry) { entry = { id: player.id, name: player.name, bot: player.bot, matches: 0, wins: 0, seals: 0 }; players.push(entry); }
    entry.name = player.name; entry.matches++; entry.seals += player.tokens;
    if (game.matchWinnerIds.includes(player.id)) entry.wins++;
  }
  return { ...night, matches: night.matches + 1, players };
}
