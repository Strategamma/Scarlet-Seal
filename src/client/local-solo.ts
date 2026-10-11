import { chooseBotMove, chooseBotReturns, createGame, playCard, returnCardsToBottom, startRound, viewFor, type CardValue, type GameState, type Move } from '../shared/game';
import type { RoomView, Session } from '../shared/protocol';

export const LOCAL_SOLO_KEY = 'scarlet-seal-offline-solo';
const HUMAN_ID = 'offline-human';
const BOT_ID = 'offline-bot';

export class LocalSolo {
  readonly session: Session = { roomCode: 'SOLO', playerId: HUMAN_ID, token: 'local-only' };

  constructor(public game: GameState) {}

  static create(): LocalSolo {
    return new LocalSolo(createGame([{ id: HUMAN_ID, name: 'You', bot: false }, { id: BOT_ID, name: 'Inspector Byte', bot: true }]));
  }

  static parse(saved: string | null): LocalSolo | undefined {
    if (!saved) return;
    try {
      const game = JSON.parse(saved) as GameState;
      if (!['playing', 'round-over', 'match-over'].includes(game.phase) || game.players.length !== 2 || game.players[0]?.id !== HUMAN_ID || game.players[1]?.id !== BOT_ID || !Array.isArray(game.deck)) return;
      viewFor(game, HUMAN_ID);
      return new LocalSolo(game);
    } catch { return; }
  }

  view(): RoomView {
    return {
      code: 'SOLO',
      players: this.game.players.map(player => ({ id: player.id, name: player.name, bot: player.bot, connected: true, host: player.id === HUMAN_ID })),
      game: viewFor(this.game, HUMAN_ID), canStart: false
    };
  }

  play(move: Move): void { playCard(this.game, HUMAN_ID, move); }
  returnCards(cards: CardValue[]): void { returnCardsToBottom(this.game, HUMAN_ID, cards); }
  nextRound(): void { if (this.game.phase !== 'round-over') throw new Error('The round is not over.'); startRound(this.game); }
  rematch(): void { if (this.game.phase !== 'match-over') throw new Error('Finish the match first.'); this.game = LocalSolo.create().game; }
  get botTurn(): boolean { return this.game.phase === 'playing' && this.game.players[this.game.turnIndex]?.id === BOT_ID; }
  advanceBot(): void {
    if (!this.botTurn) return;
    if (this.game.pendingBottom?.playerId === BOT_ID) returnCardsToBottom(this.game, BOT_ID, chooseBotReturns(this.game, BOT_ID));
    else playCard(this.game, BOT_ID, chooseBotMove(this.game, BOT_ID));
  }
}
