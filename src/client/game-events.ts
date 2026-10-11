import type { GameView } from '../shared/game.js';

export interface GameEvents {
  selectionInvalidated: boolean;
  actionPlayed: boolean;
  actionResolved: boolean;
  turnChanged: boolean;
  roundStarted: boolean;
  drawFromIndex?: number;
  newDiscardCounts: Map<string, number>;
  earnedSeals: Set<string>;
  newlyOut: Set<string>;
  newlyProtected: Set<string>;
}

export function gameEvents(previous: GameView | undefined, next: GameView | undefined, viewerId: string | undefined): GameEvents {
  const events: GameEvents = {
    selectionInvalidated: !previous || !next,
    actionPlayed: false, actionResolved: false, turnChanged: false, roundStarted: false,
    newDiscardCounts: new Map(), earnedSeals: new Set(), newlyOut: new Set(), newlyProtected: new Set()
  };
  if (!next) return events;
  events.roundStarted = next.phase === 'playing' && (!previous || previous.round !== next.round);
  if (!previous) return events;
  events.selectionInvalidated = previous.round !== next.round || previous.phase !== next.phase
    || previous.turnPlayerId !== next.turnPlayerId || previous.bottomChoiceCount !== next.bottomChoiceCount
    || previous.hand.length !== next.hand.length || previous.hand.some((card, index) => card !== next.hand[index])
    || previous.legalMoves.length !== next.legalMoves.length
    || previous.legalMoves.some((move, index) => move.card !== next.legalMoves[index].card
      || move.targetId !== next.legalMoves[index].targetId || move.guess !== next.legalMoves[index].guess);
  events.actionPlayed = Boolean(next.lastAction && next.lastAction.sequence !== previous.lastAction?.sequence);
  if (previous.round !== next.round) return events;
  events.actionResolved = Boolean(next.lastAction && next.lastAction.sequence === previous.lastAction?.sequence && next.lastAction.resolution !== previous.lastAction?.resolution);
  events.turnChanged = next.phase === 'playing' && next.turnPlayerId !== previous.turnPlayerId;
  if (next.hand.length > previous.hand.length && next.turnPlayerId === viewerId) events.drawFromIndex = previous.hand.length;
  for (const player of next.players) {
    const before = previous.players.find(item => item.id === player.id);
    if (!before) continue;
    if (player.discards.length > before.discards.length) events.newDiscardCounts.set(player.id, before.discards.length);
    if (player.tokens > before.tokens) events.earnedSeals.add(player.id);
    if (!before.eliminated && player.eliminated) events.newlyOut.add(player.id);
    if (!before.protected && player.protected) events.newlyProtected.add(player.id);
  }
  return events;
}
