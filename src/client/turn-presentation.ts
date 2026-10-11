import { CARDS, type CardValue, type GameView, type Move, type PlayerView, type PublicAction } from '../shared/game.js';

export type TurnPhase = 'round-result' | 'waiting' | 'choose-card' | 'choose-target' | 'guess' | 'confirm' | 'case-review';
const targetPrompt: Partial<Record<CardValue, string>> = {
  1: 'Whose card will you guess?', 2: 'Whose card will you inspect?',
  3: 'Whose card will you compare?', 5: 'Who must discard and redraw?',
  7: 'Who will trade hands with you?'
};

export interface TurnPresentation {
  phase: TurnPhase;
  stepLabel: string;
  title: string;
  tip: string;
  turn?: PlayerView;
  nextPlayer?: PlayerView;
  myTurn: boolean;
  choosingBottom: boolean;
  cardMoves: Move[];
  targets: string[];
  guesses: CardValue[];
  direct?: Move;
  playable: Set<CardValue>;
  forcedCard?: CardValue;
  lastOwnAction?: PublicAction;
}

export function cardPlayPreview(game: GameView, card: CardValue, handIndex: number, targetId?: string): string {
  const held = game.hand.find((_, index) => index !== handIndex);
  const heldCard = held === undefined ? undefined : `${CARDS[held].name} (${held})`;
  if ([1, 2, 3, 7].includes(card) && !targetId) return 'No player can be targeted, so this card has no effect.';
  switch (card) {
    case 0: return 'Possible bonus seal at round end if you survive and are the only surviving Wiretap user.';
    case 1: return 'Your guess and its result will be visible to everyone.';
    case 2: return 'Only you will see their card.';
    case 3: return heldCard ? `You compare your ${heldCard}. The lower card is eliminated.` : 'The lower card is eliminated.';
    case 4: return 'You are protected from rivals until your next turn.';
    case 5: return targetId === game.turnPlayerId
      ? held === 9 ? 'You will discard Scarlet Evidence and be eliminated.' : `You will discard your ${heldCard ?? 'remaining card'} and draw a replacement.`
      : 'Their discarded card becomes public; the replacement stays private.';
    case 6: return 'You will privately draw up to two cards, then choose one to keep.';
    case 7: return heldCard ? `You will give them your ${heldCard} and take their hidden card.` : 'You will exchange cards with them.';
    case 8: return 'No immediate effect. Keep your other card.';
    case 9: return 'Playing Scarlet Evidence eliminates you immediately.';
  }
}

export function needsPlayConfirmation(game: GameView, move: Move, handIndex: number): boolean {
  return move.card === 9 || move.card === 5 && move.targetId === game.turnPlayerId
    && game.hand.some((value, index) => index !== handIndex && value === 9);
}

export function turnPresentation(game: GameView, viewerId: string, selectedCard?: CardValue, selectedTarget?: string, selectedGuess?: CardValue): TurnPresentation {
  const turn = game.players.find(player => player.id === game.turnPlayerId);
  const myTurn = game.phase === 'playing' && game.turnPlayerId === viewerId;
  const currentIndex = game.players.findIndex(player => player.id === game.turnPlayerId);
  const nextPlayer = game.phase === 'playing'
    ? [...game.players.slice(currentIndex + 1), ...game.players.slice(0, currentIndex + 1)]
      .find(player => !player.eliminated && player.id !== game.turnPlayerId)
    : undefined;
  const choosingBottom = myTurn && game.bottomChoiceCount > 0;
  const playable = new Set(game.legalMoves.map(move => move.card));
  const forcedCard = myTurn && playable.size === 1 && game.hand.length > 1 ? [...playable][0] : undefined;
  const lastOwnAction = [...game.publicActions].reverse().find(action => action.actorId === viewerId);
  const cardMoves = myTurn && selectedCard !== undefined ? game.legalMoves.filter(move => move.card === selectedCard) : [];
  const targets = [...new Set(cardMoves.map(move => move.targetId).filter((id): id is string => Boolean(id)))];
  const targetMoves = selectedTarget && targets.includes(selectedTarget) ? cardMoves.filter(move => move.targetId === selectedTarget) : cardMoves;
  const guesses = [...new Set(targetMoves.map(move => move.guess).filter((guess): guess is CardValue => guess !== undefined))];
  const direct = cardMoves.find(move => move.targetId === undefined && move.guess === undefined);
  const base = { turn, nextPlayer, myTurn, choosingBottom, cardMoves, targets, guesses, direct, playable, forcedCard, lastOwnAction };

  if (game.phase !== 'playing') return { ...base, phase: 'round-result', stepLabel: 'ROUND COMPLETE', title: 'The round has ended', tip: '' };
  if (!myTurn) return { ...base, phase: 'waiting', stepLabel: 'WAITING FOR A RIVAL', title: `${turn?.name ?? 'Another player'} is choosing a card`, tip: 'Watch the center card for who played, who was targeted, and what happened.' };
  if (choosingBottom) return { ...base, phase: 'case-review', stepLabel: 'CASE REVIEW · KEEP ONE', title: 'Choose one card to keep', tip: 'These extra cards are private. The others return unseen.' };
  if (selectedCard === undefined || cardMoves.length === 0) return { ...base, phase: 'choose-card', stepLabel: 'STEP 1 · PICK A CARD', title: forcedCard !== undefined ? `Play your ${CARDS[forcedCard].name} — the other card cannot be played` : 'Choose one card to play', tip: 'Play one of your two cards. Keep the other for the next turn.' };
  if (targets.length && (!selectedTarget || !targets.includes(selectedTarget))) return { ...base, phase: 'choose-target', stepLabel: 'STEP 2 · CHOOSE A PLAYER', title: targetPrompt[selectedCard] ?? 'Choose a player', tip: 'Only available players appear here. Protection can make a player unavailable.' };
  if (selectedTarget && guesses.length && (selectedGuess === undefined || !guesses.includes(selectedGuess))) return { ...base, phase: 'guess', stepLabel: 'STEP 3 · NAME A CARD', title: 'Hunch: name the card they hold', tip: 'A correct guess knocks that player out. Hunch cannot name another Hunch.' };
  const noTarget = direct && [1, 2, 3, 7].includes(selectedCard);
  return { ...base, phase: 'confirm', stepLabel: 'FINAL STEP · CONFIRM PLAY', title: noTarget ? `No available target for ${CARDS[selectedCard].name}` : `Confirm your ${CARDS[selectedCard].name}`, tip: 'Your played card becomes public. Private clues are shown only to you.' };
}
