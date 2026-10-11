import type { GameView } from '../shared/game.js';

export function isNewPersonalTurn(previous: GameView | undefined, next: GameView | undefined, playerId: string | undefined): boolean {
  return Boolean(playerId && next?.phase === 'playing' && next.turnPlayerId === playerId
    && (previous?.phase !== 'playing' || previous.turnPlayerId !== playerId || previous.round !== next.round));
}

let audio: AudioContext | undefined;

export function unlockTurnSound(): void {
  if (audio || !window.AudioContext) return;
  try { audio = new AudioContext(); void audio.resume().catch(() => { audio = undefined; }); }
  catch { audio = undefined; }
}

export function playTurnSound(enabled: boolean): void {
  if (!enabled || audio?.state !== 'running') return;
  const start = audio.currentTime;
  for (const [index, frequency] of [523.25, 659.25, 783.99].entries()) {
    const note = audio.createOscillator();
    const gain = audio.createGain();
    const at = start + index * .11;
    note.type = 'sine'; note.frequency.value = frequency;
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.exponentialRampToValueAtTime(.07, at + .025);
    gain.gain.exponentialRampToValueAtTime(.0001, at + .22);
    note.connect(gain); gain.connect(audio.destination);
    note.start(at); note.stop(at + .23);
  }
}
