// Tiny synthesized cues avoid audio downloads. Failure leaves the visual UI usable.
let context: AudioContext | undefined;
let enabled = false;
let master: GainNode | undefined;
export function setSoundEnabled(value: boolean): void { enabled = value; if (context && master) master.gain.setTargetAtTime(value ? 1 : 0, context.currentTime, .005); }
export function unlockSound(): void {
  if (!enabled) return;
  try { if (!context) { context = new AudioContext(); master = context.createGain(); master.connect(context.destination); } master!.gain.value = 1; void context.resume().catch(() => {}); } catch { /* Audio is optional. */ }
}
export function cue(kind: 'tap' | 'play' | 'turn' | 'win'): void {
  if (!enabled || !context || context.state !== 'running') return;
  const notes = kind === 'win' ? [523,659,784] : kind === 'turn' ? [440,587] : kind === 'play' ? [330,494] : [660];
  notes.forEach((frequency,index) => {
    const start = context!.currentTime + index * .075;
    const oscillator = context!.createOscillator(); const gain = context!.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0,start); gain.gain.linearRampToValueAtTime(.025,start+.008); gain.gain.exponentialRampToValueAtTime(.001,start+.09);
    oscillator.connect(gain); gain.connect(master!); oscillator.start(start); oscillator.stop(start+.1);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  });
}
