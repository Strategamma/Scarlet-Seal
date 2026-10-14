import { io, type Socket } from 'socket.io-client';
import { registerSW } from 'virtual:pwa-register';
import { CARDS, MAX_PLAYERS, tokenTarget, type CardValue, type Move } from '../shared/game';
import type { AvailableRoom, ClientToServerEvents, Result, RoomView, ServerToClientEvents, Session } from '../shared/protocol';
import { cardPlayPreview, needsPlayConfirmation, turnPresentation } from './turn-presentation';
import { gameEvents } from './game-events';
import { isNewPersonalTurn } from './turn-cue';
import { takeArcadeName } from './arcade-name';
import { LOCAL_SOLO_KEY, LocalSolo } from './local-solo';
import './styles.css';
import './redesign.css';
import './experience.css';
import { isLocalServer, validInvitation, joinLink } from './connection';
import { cue, setSoundEnabled, unlockSound } from './feedback';
import { uiIcon } from './ui-icons';

declare global { interface Window { render_game_to_text: () => string; advanceTime: (ms: number) => void } }

const root = document.querySelector<HTMLDivElement>('#app')!;
const saved = localStorage.getItem('scarlet-seal-session') ?? localStorage.getItem('royal-post-session');
let localSolo = LocalSolo.parse(localStorage.getItem(LOCAL_SOLO_KEY));
let session: Session | undefined = localSolo?.session;
if (!session && saved) { try { session = JSON.parse(saved); } catch { localStorage.removeItem('scarlet-seal-session'); localStorage.removeItem('royal-post-session'); } }
let room: RoomView | undefined = localSolo?.view();
let selectedCard: CardValue | undefined;
let selectedCardIndex: number | undefined;
let selectedTarget: string | undefined;
let selectedGuess: CardValue | undefined;
let selectedKeepIndex: number | undefined;
let showFirstRoundTips = localStorage.getItem('scarlet-seal-tips-complete') !== 'yes';
let rulesOpen = false;
let settingsOpen = false;
let quietMotion = localStorage.getItem('scarlet-seal-quiet-motion') === 'yes';
let haptics = localStorage.getItem('scarlet-seal-haptics') === 'yes';
let toast = '';
let toastTimer: number | undefined;
const applyMotion = () => document.documentElement.classList.toggle('quiet-motion', quietMotion);
applyMotion();
let leaveOpen = false;
let modalReturnFocus = '';
let inspectedCard: CardValue | undefined;
let error = '';
let busy = false;
let animateAction = false;
let playOrigin: DOMRect | undefined;
let drawOrigin: DOMRect | undefined;
let drawFromIndex = 0;
let turnChanged = false;
let turnCue = false;
let soundEnabled = localStorage.getItem('scarlet-seal-sound') !== 'off';
setSoundEnabled(soundEnabled);
let roundStarted = false;
let resolvedAction = false;
let newDiscardCounts = new Map<string, number>();
let earnedSeals = new Set<string>();
let newlyOut = new Set<string>();
let newlyProtected = new Set<string>();
let showMatchFinale = room?.game?.phase === 'match-over';
let animatedRound = -1;
let animatedFinale = false;
let availableRooms: AvailableRoom[] = [];
let restoringSeat = Boolean(session && !localSolo);
let restoredSeat = Boolean(localSolo);
let joiningByCode = Boolean(new URLSearchParams(location.search).get('room'));
let visibleReactionSequence = 0;
const arcadeName = takeArcadeName(location.hash);
if (arcadeName.hash !== location.hash) history.replaceState(history.state, '', location.pathname + location.search + arcadeName.hash);
let landingName = localStorage.getItem('scarlet-seal-name') || arcadeName.name || '';
let landingCode = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '';
let invitationPending = validInvitation(landingCode);
const localServer = isLocalServer(location.hostname);
let connectionGuide: 'local' | 'internet' = localServer ? 'local' : 'internet';
const ensureName = () => {
  if (!landingName.trim()) landingName = `Detective ${crypto.getRandomValues(new Uint32Array(1))[0].toString(36).slice(0,4).toUpperCase()}`;
  localStorage.setItem('scarlet-seal-name', landingName); return landingName.trim();
};
const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({ auth: localSolo ? {} : session ?? {} });

registerSW({ immediate: true });
window.addEventListener('offline', () => socket.disconnect());
window.addEventListener('online', () => socket.connect());
socket.on('session', value => { if (localSolo) return; session = value; socket.auth = value; localStorage.setItem('scarlet-seal-session', JSON.stringify(value)); });
const acceptRoomState = (value: RoomView) => {
  const previous = room?.game;
  const next = value.game;
  const events = gameEvents(previous, next, session?.playerId);
  const myTurnStarted = isNewPersonalTurn(previous, next, session?.playerId);
  const roundEnded = previous?.phase === 'playing' && next && next.phase !== 'playing';
  if (next?.phase === 'match-over' && previous?.phase !== 'match-over') {
    if (next.matchWinnerIds.includes(session?.playerId ?? '')) cue('win');
    showMatchFinale = false;
    const winningRound = next.round;
    window.setTimeout(() => {
      if (room?.game?.phase === 'match-over' && room.game.round === winningRound) { showMatchFinale = true; render(); window.scrollTo({ top: 0, behavior: 'auto' }); document.querySelector<HTMLElement>('#finale-title')?.focus({ preventScroll: true }); }
    }, 4200);
  } else if (next?.phase !== 'match-over') showMatchFinale = false;
  turnCue = myTurnStarted;
  animateAction = events.actionPlayed;
  roundStarted = events.roundStarted;
  if (animateAction && next?.lastAction) {
    const actorId = next.lastAction.actorId;
    const source = actorId === session?.playerId
      ? [...document.querySelectorAll<HTMLElement>('.hand .card')].find(card => card.classList.contains('selected') && card.dataset.card === String(next.lastAction?.card))
        ?? [...document.querySelectorAll<HTMLElement>('.hand .card')].find(card => card.dataset.card === String(next.lastAction?.card))
      : [...document.querySelectorAll<HTMLElement>('.opponent')].find(seat => seat.dataset.playerId === actorId);
    playOrigin = source?.getBoundingClientRect();
  }
  turnChanged = events.turnChanged;
  drawFromIndex = events.drawFromIndex ?? 0;
  drawOrigin = (events.drawFromIndex !== undefined || events.roundStarted) && next?.hand.length
    ? document.querySelector<HTMLElement>('.deck-count b')?.getBoundingClientRect() : undefined;
  resolvedAction = events.actionResolved;
  newDiscardCounts = events.newDiscardCounts;
  earnedSeals = events.earnedSeals;
  newlyOut = events.newlyOut;
  newlyProtected = events.newlyProtected;
  const newReaction = value.reaction?.sequence && value.reaction.sequence !== room?.reaction?.sequence;
  room = value; if (value.code === landingCode) invitationPending = false; restoredSeat = restoringSeat || restoredSeat; restoringSeat = false; error = '';
  if (showFirstRoundTips && next && next.phase !== 'playing') { showFirstRoundTips = false; localStorage.setItem('scarlet-seal-tips-complete', 'yes'); }
  if (events.roundStarted) inspectedCard = undefined;
  if (events.roundStarted) { animatedRound = -1; animatedFinale = false; }
  if (events.selectionInvalidated) { selectedCard = undefined; selectedCardIndex = undefined; selectedTarget = undefined; selectedGuess = undefined; selectedKeepIndex = undefined; }
  if (newReaction && value.reaction) {
    visibleReactionSequence = value.reaction.sequence;
    window.setTimeout(() => { if (visibleReactionSequence === value.reaction?.sequence) { visibleReactionSequence = 0; render(); } }, 2400);
  }
  render();
  if (roundEnded) requestAnimationFrame(() => { document.querySelector('.round-reveal')?.scrollIntoView({ behavior: (quietMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches) ? 'auto' : 'smooth', block: 'center' }); document.querySelector<HTMLElement>('#result-title')?.focus({ preventScroll: true }); });
  if (myTurnStarted) {
    cue('turn');
    const badge = document.querySelector('.turn-alert');
    window.setTimeout(() => badge?.remove(), 2400);
  }
};
socket.on('room:state', value => { if (!localSolo) acceptRoomState(value); });
window.addEventListener('pointerdown', unlockSound, { passive: true });
window.addEventListener('keydown', unlockSound);
socket.on('connect_error', () => { if (localSolo) return; error = 'Unable to reach the game server.'; render(); });
socket.on('disconnect', () => { busy = false; render(); });
const refreshRooms = () => {
  if (!socket.connected || room) return;
  socket.emit('rooms:list', result => {
  if (!result.ok || room) return;
  if (JSON.stringify(availableRooms) === JSON.stringify(result.value)) return;
  availableRooms = result.value;
  if (!rulesOpen && !settingsOpen) render();
  });
};
socket.on('connect', () => {
  error = ''; render(); refreshRooms();
  if (session && !localSolo) socket.emit('room:resume', result => {
    if (result.ok) return;
    restoringSeat = false; session = undefined; socket.auth = {};
    localStorage.removeItem('scarlet-seal-session'); localStorage.removeItem('royal-post-session');
    error = result.error; render(); joinInvitation();
  });
  else joinInvitation();
});
window.setInterval(refreshRooms, 3000);

const emit = <T>(send: (callback: (result: Result<T>) => void) => void) => {
  if (busy) return;
  if (!socket.connected) { error = 'Reconnecting to the server. Solo play is available offline.'; render(); return; }
  busy = true; error = ''; render();
  const timeout = window.setTimeout(() => { busy = false; error = 'The server is taking longer than expected. Reconnecting to check your seat…'; socket.disconnect().connect(); render(); }, 12000);
  send(result => { clearTimeout(timeout); busy = false; if (!result.ok) error = result.error; render(); });
};
function updateLocal(): void {
  if (!localSolo) return;
  localStorage.setItem(LOCAL_SOLO_KEY, JSON.stringify(localSolo.game));
  acceptRoomState(localSolo.view());
}
function runLocalBots(current: LocalSolo): void {
  if (!current.botTurn) return;
  window.setTimeout(() => {
    if (localSolo !== current || !current.botTurn) return;
    current.advanceBot(); updateLocal(); runLocalBots(current);
  }, 700);
}
function localAction(action: (solo: LocalSolo) => void): void {
  if (!localSolo || busy) return;
  try { action(localSolo); updateLocal(); runLocalBots(localSolo); }
  catch (reason) { error = reason instanceof Error ? reason.message : 'That move is not available.'; render(); }
}
const quickPlay = (name: string) => {
  if (busy) return;
  if (!socket.connected) {
    localSolo = LocalSolo.create(); session = localSolo.session; socket.auth = {};
    localStorage.removeItem('scarlet-seal-session'); localStorage.removeItem('royal-post-session');
    updateLocal(); runLocalBots(localSolo); return;
  }
  emit<true>(done => socket.emit('room:create', name, created => {
    if (!created.ok) { done(created); return; }
    socket.emit('room:add-bot', botAdded => {
      if (!botAdded.ok) { done(botAdded); return; }
      socket.emit('game:start', done);
    });
  }));
};
function joinRoom(code: string): void {
  if (!validInvitation(code.trim().toUpperCase())) { error = 'Enter the five-character room code from your invitation.'; render(); return; }
  emit(cb => socket.emit('room:join', { code: code.trim().toUpperCase(), name: ensureName() }, cb));
}
function joinInvitation(): void {
  if (!invitationPending || session || localSolo || busy) return;
  invitationPending = false; joinRoom(landingCode);
}
function notify(message: string): void {
  toast = message; clearTimeout(toastTimer); render();
  toastTimer = window.setTimeout(() => { toast = ''; root.querySelector('.status-toast')?.remove(); }, 3500);
}
const esc = (value: string) => value.replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]!);
const CARD_FACE_TEXT: Record<CardValue, string> = {
  0: 'Bonus seal if you alone used Wiretap and survive.',
  1: 'Guess a rival’s card. Correct guess: they are out.',
  2: 'Privately see a rival’s card.',
  3: 'Compare cards. Lower value is out.',
  4: 'You cannot be targeted until your next turn.',
  5: 'Make anyone discard their card and redraw.',
  6: 'Draw up to two. Keep one; return the rest.',
  7: 'Trade hands with a rival.',
  8: 'Must play with Disguise or Interrogation.',
  9: 'Playing or discarding this knocks you out.'
};
const CARD_SYMBOLS: Record<CardValue, string> = { 0: '◎', 1: '?', 2: '◉', 3: '⚖', 4: '⬡', 5: '↻', 6: '▣', 7: '⇄', 8: '◆', 9: '!' };
const art = (value: CardValue, className = 'card-art') => `<span class="${className} art-${value}" aria-hidden="true"></span>`;
const seal = (className = '') => `<img class="seal-token ${className}" src="/icon-192.png" alt="" aria-hidden="true">`;
const cardFace = (value: CardValue) => `<span class="unified-card-face"><span class="unified-card-head"><b>${value}</b><i aria-hidden="true">${CARD_SYMBOLS[value]}</i></span>${art(value, 'unified-card-art')}<span class="unified-card-copy"><b>${CARDS[value].name}</b><small>${CARD_FACE_TEXT[value]}</small></span></span>`;
const privateClue = (notice: string) => {
  const clue = /^(.+) holds (.+)\.$/.exec(notice);
  return `<aside class="turn-notice" aria-label="Private clue"><span class="notice-mark" aria-hidden="true">◉</span><span class="notice-copy"><small>PRIVATE CLUE · ONLY YOU</small><strong>${clue ? `${esc(clue[1])} <em>holds</em> <span>${esc(clue[2])}</span>` : esc(notice)}</strong></span></aside>`;
};
const CARD_INTEL: Record<CardValue, { choice: string; reveal: string }> = {
  0: { choice: 'No target', reveal: 'Your play is public' }, 1: { choice: 'Target + guess', reveal: 'Guess and result are public' },
  2: { choice: 'Choose a rival', reveal: 'Their card stays private' }, 3: { choice: 'Choose a rival', reveal: 'Outcome is public' },
  4: { choice: 'No target', reveal: 'Protection is public' }, 5: { choice: 'Choose anyone', reveal: 'Discard is revealed' },
  6: { choice: 'No target', reveal: 'Your choice stays private' }, 7: { choice: 'Choose a rival', reveal: 'Swap is public' },
  8: { choice: 'No target', reveal: 'No extra information' }, 9: { choice: 'No target', reveal: 'You will be eliminated' }
};
const card = (value: CardValue, index: number, interactive = false, forced = false, bottomChoice = false, restriction = '') => {
  const data = CARDS[value];
  const selected = bottomChoice ? selectedKeepIndex === index : selectedCard === value && selectedCardIndex === index;
  const returning = bottomChoice && selectedKeepIndex !== undefined && !selected;
  const direct = room?.game?.legalMoves.find(move => move.card === value && move.targetId === undefined && move.guess === undefined);
  const tapHint = direct && room?.game && !needsPlayConfirmation(room.game, direct, index) ? ' Tap to play now.' : ' Tap to choose this card.';
  const dataAttr = bottomChoice ? `data-bottom-index="${index}"` : `data-card="${value}" data-card-index="${index}"`;
  return `<button type="button" aria-label="${data.name}, value ${value}. ${data.text}${restriction ? ` ${restriction}.` : bottomChoice ? selected ? ' Selected to keep.' : returning ? ' Will return to the deck. Tap to keep instead.' : ' Tap to keep this card.' : interactive ? tapHint : ''}" ${interactive ? `aria-pressed="${selected}"` : ''} class="card card-${value}${selected ? ' selected' : ''}${returning ? ' returning' : ''}${interactive ? ' playable' : ''}" ${dataAttr} ${interactive ? '' : 'disabled'}>
    ${forced ? '<span class="card-badge">Must play</span>' : restriction ? '<span class="card-badge restricted">Locked</span>' : ''}${bottomChoice ? `<span class="review-state">${selected ? 'KEEP' : returning ? 'RETURN' : 'CHOOSE'}</span>` : ''}${cardFace(value)}<span class="card-foot"><span class="card-meta">${restriction || CARD_INTEL[value].choice}</span><span class="card-count">${data.count} ${data.count === 1 ? 'copy' : 'copies'}</span></span>
  </button>`;
};

function rulesSheet(): string {
  if (!rulesOpen) return '';
  const rows = (Object.values(CARDS)).map(data => `<li>${cardFace(data.value)}<span class="rule-card-count">${data.count} in deck</span></li>`).join('');
  return `<div class="rules-backdrop" data-close-rules><section class="rules-sheet" role="dialog" aria-modal="true" aria-labelledby="rules-title">
    <div class="sheet-handle" aria-hidden="true"></div><header><div><p class="eyebrow">QUICK GUIDE</p><h2 id="rules-title">How to play</h2></div><button type="button" id="close-rules" aria-label="Close rules">×</button></header>
    <div class="rules-body">
      <section class="rule-steps" aria-label="Turn steps"><article><b>1</b><span><strong>Draw</strong><small>Start your turn with two cards.</small></span></article><article><b>2</b><span><strong>Play one</strong><small>Tap a card, then follow its action.</small></span></article><article><b>3</b><span><strong>Survive</strong><small>Keep the higher card—or be the last player in.</small></span></article></section>
      <section class="rule-section"><h3>Win the case</h3><div class="win-paths"><article><span aria-hidden="true">①</span><b>Survive the round</b><small>Be the last player in, or hold the highest card when the deck runs out.</small></article><article><span aria-hidden="true">②</span><b>Collect seals</b><small>A round win earns one seal. The first player to three wins the match.</small></article></div><div class="token-goals"><span>${seal()}<b>1 point = 1 seal</b><strong>3 seals to win</strong></span></div><p class="rule-note">A sole surviving Wiretap user earns one bonus seal, even if another player wins the round. Other players see your discards, never your hand.</p></section>
      <details class="rule-disclosure" data-detail="card-reference"><summary><span>Card reference</span><small>10 types · 21 cards</small></summary><ol class="card-reference">${rows}</ol></details>
      <details class="rule-disclosure" data-detail="more-rules"><summary><span>More rules</span><small>Special cases</small></summary><ul class="rule-details"><li>A Hunch can name any card except another Hunch.</li><li>Interrogation may target any unprotected player, including you.</li><li>If you hold Red Herring with Disguise or Interrogation, you must play Red Herring.</li><li>Safehouse protects you from other players until your next turn.</li><li>Case Review lets you secretly keep one of up to three cards.</li><li>One card is reserved face down each round. The other 20 are used in every table size.</li></ul></details>
    </div>
  </section></div>`;
}

const rulesButton = (label = 'How to play') => `<button type="button" class="rules-button" data-open-rules><span>?</span>${label}</button>`;
const leaveButton = () => `<button type="button" class="nav-button" data-leave-room aria-label="Leave this room and return home"><span aria-hidden="true">‹</span>Home</button>`;
const leaveSheet = () => leaveOpen ? `<div class="dialog-backdrop"><section class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="leave-title"><p class="eyebrow">LEAVE ROOM</p><h2 id="leave-title">Are you sure you want to leave?</h2><p>${room?.game?.phase === 'playing' ? 'You will forfeit this round and leave the match.' : room?.game ? 'You will leave this match.' : 'You will leave this lobby.'}</p><div><button type="button" id="stay-room" class="secondary">Stay here</button><button type="button" id="confirm-leave" class="primary">Leave room</button></div></section></div>` : '';
const logo = (className: string) => `<img class="${className}" src="/icon-192.png" alt="" aria-hidden="true">`;
function connectionNotice(): string {
  if (localSolo) return '<section class="connection-notice" role="status"><b>Private offline case</b><p>This game runs on your device and resumes here after you reopen it.</p></section>';
  if (!socket.connected) return '<section class="connection-notice" role="status"><b>Connection lost</b><p>Your seat is saved. Reconnecting to the table…</p></section>';
  const migration = room?.migration;
  if (!migration) {
    const game = room?.game;
    const absent = game?.phase === 'playing' ? game.players.find(player => player.id === game.turnPlayerId && !player.connected) : undefined;
    if (!absent) return '';
    const isHost = room?.players.some(player => player.id === session?.playerId && player.host);
    return `<section class="connection-notice" role="status"><b>Waiting for ${esc(absent.name)}</b><p>Their seat is saved. ${isHost ? 'You can wait for them or continue without them for this round.' : 'The host can wait or resolve this turn.'}</p>${isHost ? `<button type="button" id="forfeit-disconnected" class="secondary" ${busy ? 'disabled' : ''}>Continue this round</button>` : ''}</section>`;
  }
  const candidate = room?.players.find(player => player.id === migration.candidateId);
  const approved = migration.approvedIds.includes(session?.playerId ?? '');
  return `<section class="connection-notice" role="status"><b>Table paused: host unavailable</b><p>${candidate ? `${esc(candidate.name)} can host if everyone online agrees. ${migration.approvedIds.length} of ${room!.players.filter(player => !player.bot && player.connected).length} agreed.` : 'Waiting for a player to reconnect. The table and scores are saved.'}</p>${candidate ? `<div><button type="button" id="continue-host" class="primary" ${approved || busy ? 'disabled' : ''}>${approved ? 'Waiting for others…' : 'Continue with new host'}</button><button type="button" id="wait-host" class="secondary" ${busy ? 'disabled' : ''}>Wait for host</button></div>` : ''}</section>`;
}

function returnRecap(): string {
  if (!restoredSeat || !room) return '';
  const game = room.game;
  const current = game?.players.find(player => player.id === game.turnPlayerId);
  const last = game?.publicActions.at(-1);
  const actor = game?.players.find(player => player.id === last?.actorId);
  const status = !game ? 'Your seat is ready in the lobby.' : game.phase === 'playing'
    ? `${current?.id === session?.playerId ? 'Your turn now.' : `${esc(current?.name ?? 'A player')} is playing.`}${last ? ` Last play: ${esc(actor?.name ?? 'A player')} used ${CARDS[last.card].name}.` : ''}`
    : game.phase === 'round-over' ? 'The round has ended. Review the revealed cards below.' : 'The match has ended. See the final result below.';
  return `<aside class="return-recap" role="status"><span aria-hidden="true">↪</span><div><b>Welcome back to your seat</b><p>${status}</p></div><button type="button" id="dismiss-recap" aria-label="Dismiss welcome back update">×</button></aside>`;
}

function preferencesSheet(): string {
  return settingsOpen ? `<div class="dialog-backdrop"><section class="confirm-dialog preferences" role="dialog" aria-modal="true" aria-labelledby="preferences-title"><header><h2 id="preferences-title">Table preferences</h2><button id="close-settings" aria-label="Close preferences">×</button></header><label><input type="checkbox" id="sound-preference" ${soundEnabled ? 'checked' : ''}> Gentle sound cues</label><label><input type="checkbox" id="quiet-motion" ${quietMotion ? 'checked' : ''}> Quiet motion</label><label><input type="checkbox" id="haptics" ${haptics ? 'checked' : ''}> Touch feedback where supported</label><p>Saved on this device. System reduced motion is always respected. Help and preferences do not pause a live table.</p></section></div>` : '';
}
function connectionHelp(): string {
  return `<section class="connection-guide" aria-label="Ways to play with friends"><div><button type="button" data-connection="internet" aria-pressed="${connectionGuide === 'internet'}">Over the internet</button><button type="button" data-connection="local" aria-pressed="${connectionGuide === 'local'}">Same network</button></div><p>${connectionGuide === 'internet' ? localServer ? 'This is a local server address. Internet friends need the public game address.' : 'Host a table and share its invitation link. Friends can join from anywhere with internet.' : 'Everyone opens the host computer’s LAN game address, then joins by link or code. There is no nearby-device discovery.'}</p><details data-detail="connection-guide"><summary>Connection requirements</summary><p>${connectionGuide === 'local' ? 'Run the installed game server on one computer and keep it awake. Everyone uses its LAN IP and game port. Offline LAN hosting can work without internet; guest-Wi-Fi isolation or firewalls can still block access.' : 'Everyone must use the same publicly reachable server. Localhost and private LAN links cannot invite another network.'}</p>${connectionGuide === 'internet' && localServer ? '<a href="https://scarlet-seal.onrender.com/">Open the internet-hosted game ↗</a>' : ''}</details></section>`;
}

function landing(): string {
  if (restoringSeat) return `<main class="resume-seat"><div class="crest">${logo('crest-logo')}</div><p class="eyebrow">SAVED TABLE FOUND</p><h1>Return to<br><i>your seat</i></h1><p>Reconnecting you to room ${esc(session?.roomCode ?? '')}…</p>${error ? `<p class="error" role="alert">${esc(error)}</p><button type="button" id="retry-seat" class="secondary">Try reconnecting</button>` : '<span class="resume-pulse" aria-hidden="true"></span>'}</main>`;
  const roomRows = availableRooms.map(available => `<button type="button" class="room-row" data-join-room="${available.code}"><span class="room-identity"><b>${esc(available.hostName)}'s table</b><small>${available.code} · ${available.botCount ? `${available.botCount} bot${available.botCount === 1 ? '' : 's'}` : 'people only'}</small></span><span class="room-seats"><b>${available.playerCount}/${available.maxPlayers}</b><small>seats</small></span><span class="room-join">Sit down <i>›</i></span></button>`).join('');
  return `<main class="landing">
    <a class="collection-link home-collection" href="https://decadenceinc.com/">← Decadence Arcade</a><div class="landing-tools">${rulesButton()}</div>
    <section class="home-hero"><div class="crest">${logo('crest-logo')}</div><div><p class="eyebrow">A GAME OF DECEPTION &amp; DEDUCTION</p><h1>Scarlet <i>Seal</i></h1><p class="intro">One card to keep. One card to play. Claim three seals.</p></div></section>
    <p class="entry-meta" aria-label="Game details"><span>2–6 players</span><span>Quick rounds</span><span>Learn as you play</span></p>
    <button type="button" id="quick-play" class="primary quick-play" ${busy ? 'disabled' : ''}><span><b>Play against a bot</b><small>Start a private case now · no setup</small></span><i aria-hidden="true">›</i></button>
    <form id="lan-form" class="lan-panel"><div class="section-heading"><div><p class="eyebrow">PLAY TOGETHER</p><h2>Share a table</h2></div><span class="live-dot">${socket.connected ? 'Connected' : 'Connecting…'}</span></div><details class="optional-name" data-detail="name"><summary>${landingName ? `Playing as ${esc(landingName)}` : 'Choose a nickname (optional)'}</summary><label>Your name<input name="name" maxlength="20" autocomplete="nickname" placeholder="We’ll suggest a detective name" value="${esc(landingName)}"></label></details>
      <div class="entry-choices"><button type="submit" id="create-room" class="entry-choice" ${busy ? 'disabled' : ''}><span aria-hidden="true">＋</span><span><b>Host a table</b><small>Invite friends or add bots</small></span><i aria-hidden="true">›</i></button><button type="button" id="show-join-code" class="entry-choice ${joiningByCode ? 'active' : ''}" aria-expanded="${joiningByCode}" aria-controls="join-code-panel"><span aria-hidden="true">⌗</span><span><b>Join with a code</b><small>Enter the code from your host</small></span><i aria-hidden="true">${joiningByCode ? '⌄' : '›'}</i></button></div>
      <div id="join-code-panel" class="code-join" ${joiningByCode ? '' : 'hidden'}><label>Room code<input name="code" maxlength="5" autocomplete="off" autocapitalize="characters" placeholder="ABCDE" value="${esc(landingCode)}"></label><button type="button" id="join-code" class="secondary" ${busy ? 'disabled' : ''}>Join table</button></div>
      <div class="nearby-heading"><b>Tables on this server</b><small>${availableRooms.length ? `${availableRooms.length} waiting` : 'None waiting'}</small></div><div class="available-rooms">${roomRows || '<div class="empty-rooms"><b>No tables are waiting yet</b><small>Host one and share its invite.</small></div>'}</div>
    </form>
    ${connectionHelp()}${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
  </main>${rulesSheet()}`;
}

function lobby(): string {
  const me = room!.players.find(p => p.id === session?.playerId);
  const isHost = me?.host;
  const share = joinLink(location.origin, room!.code);
  const botCount = room!.players.filter(player => player.bot).length;
  const humanCount = room!.players.length - botCount;
  const absentCount = room!.players.filter(player => !player.bot && !player.connected).length;
  const startingCount = Math.max(2, room!.players.length - absentCount);
  const seats = Array.from({ length: Math.max(4, Math.min(MAX_PLAYERS, room!.players.length + 1)) }, (_, index) => {
    const player = room!.players[index];
    if (!player) return `<div class="player-row empty-seat"><span class="seat-number">${index + 1}</span><span class="avatar" aria-hidden="true">＋</span><strong>Open seat</strong></div>`;
    return `<div class="player-row ${player.connected ? 'ready-seat' : 'offline-seat'}"><span class="seat-number">${index + 1}</span><span class="avatar" aria-hidden="true">${player.bot ? 'B' : esc(player.name[0].toUpperCase())}</span><strong>${esc(player.name)}</strong>${player.host ? '<small>HOST</small>' : ''}${player.bot ? '<small>BOT</small>' : ''}${isHost && player.bot ? `<button type="button" class="remove-bot" data-remove-bot="${player.id}" aria-label="Remove ${esc(player.name)}">×</button>` : `<span class="presence ${player.connected ? '' : 'offline'}"><i aria-hidden="true"></i>${!player.connected ? 'Offline' : player.ready ? 'Ready' : 'Not ready'}</span>`}</div>`;
  }).join('');
  return `<main class="lobby"><header>${leaveButton()}<span class="brand">${logo('mini-crest')}<span>Scarlet Seal</span></span>${rulesButton('Rules')}</header>${connectionNotice()}<section class="lobby-next"><button type="button" id="ready" class="${me?.ready ? 'secondary' : 'primary'}" aria-pressed="${!!me?.ready}" ${busy ? 'disabled' : ''}>${me?.ready ? 'Ready ✓ · tap to unready' : 'I’m ready'}</button><div class="lobby-actions">${room!.canStart ? isHost ? `<button type="button" id="start" class="primary" ${busy ? 'disabled' : ''}>Start ${startingCount}-player game →</button>` : '<p class="waiting-host"><span aria-hidden="true">◌</span> Waiting for the host to start</p>' : `<p class="waiting-host">${isHost ? room!.players.length < 2 ? 'Invite a friend or add a bot to start.' : 'Waiting for everyone to mark ready.' : me?.ready ? 'You’re ready. Waiting for the host…' : 'Mark ready when you’re settled in.'}</p>`}<small>${absentCount ? 'Offline seats leave when the game starts. A bot fills the second seat if needed.' : 'Draw one, play one, keep one. First to three seals wins.'}</small></div></section>
    ${returnRecap()}<section class="room-code"><p class="eyebrow">INVITE YOUR CREW</p><button type="button" id="share" class="${room!.canStart ? 'secondary' : 'primary'}">${uiIcon('invite')} Invite friends</button><p class="room-code-fallback">Room code <b>${room!.code}</b></p><label>Or copy the invitation link<input id="invite-link" readonly value="${esc(share)}"></label><p class="connection-help">${location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'This link opens only on this computer. Open the host’s LAN URL before inviting nearby friends.' : localServer ? 'Friends must reach this server on your local network. Keep the host computer awake.' : 'Share this link with friends anywhere. Everyone needs internet.'}</p></section>
    <section class="players"><div class="seat-heading"><div><p class="eyebrow">PLAYERS &amp; BOTS</p><h3>At the table</h3></div><span>${room!.players.length} / ${MAX_PLAYERS} seats</span></div><div class="lobby-seats">${seats}</div></section>
    ${isHost ? `<section class="seat-controls"><div><strong>Fill an empty seat</strong><small>${humanCount} ${humanCount === 1 ? 'person' : 'people'} · ${botCount} ${botCount === 1 ? 'bot' : 'bots'}</small></div><button type="button" id="add-bot" class="add-bot" ${room!.players.length >= MAX_PLAYERS || busy ? 'disabled' : ''}><span>＋</span>Add bot</button></section>` : ''}
    ${error ? `<p class="error">${esc(error)}</p>` : ''}</main>${rulesSheet()}${leaveSheet()}`;
}

function matchFinale(): string {
  const game = room!.game!;
  const animateFinale = !animatedFinale && !rulesOpen && !leaveOpen && !settingsOpen;
  if (animateFinale) animatedFinale = true;
  const meId = session!.playerId;
  const champions = game.matchWinnerIds.map(id => id === meId ? 'You' : game.players.find(player => player.id === id)?.name ?? 'A player');
  const champion = champions.join(' & ');
  const verb = champions.length === 1 && game.matchWinnerIds[0] !== meId ? 'wins' : 'win';
  const roundWinners = game.winnerIds.map(id => id === meId ? 'you' : game.players.find(player => player.id === id)?.name ?? 'a player').join(' & ');
  const leader = game.players.find(player => player.id === game.matchWinnerIds[0]);
  const sealTrack = game.players.map(player => `<li class="${game.matchWinnerIds.includes(player.id) ? 'champion' : ''}"><b>${player.id === meId ? 'You' : esc(player.name)}</b><span>${Array.from({ length: tokenTarget(game.players.length) }, (_, index) => seal(index < player.tokens ? '' : 'unearned')).join('')}</span><strong>${player.tokens} / ${tokenTarget(game.players.length)}</strong></li>`).join('');
  const bonus = game.roundSummary?.awards.some(award => award.source === 'wiretap' && game.matchWinnerIds.includes(award.playerId));
  const isHost = room!.players.some(player => player.id === meId && player.host);
  const confetti = Array.from({ length: 32 }, (_, index) => `<i style="left:${(index * 37) % 96}%;animation-delay:${index * 35}ms" aria-hidden="true"></i>`).join('');
  return `<main class="match-finale ${animateFinale ? 'animate' : ''}"><header>${leaveButton()}<span class="table-brand">${logo('mini-crest')}<b>Scarlet Seal</b></span>${rulesButton('Rules')}</header>${connectionNotice()}${returnRecap()}<section class="finale-stage" aria-labelledby="finale-title"><div class="round-confetti" aria-hidden="true">${confetti}</div><p class="eyebrow">CASE CLOSED · ROUND ${game.round}</p>${logo('finale-seal')}<h1 id="finale-title" tabindex="-1">${esc(champion)} ${verb}!</h1><p class="finale-subtitle">${game.matchWinnerIds.includes(meId) ? 'You cracked the case.' : `${esc(leader?.name ?? 'The winner')} cracked the case.`}</p><div class="finale-score"><span>${seal()}<strong>${leader?.tokens ?? tokenTarget(game.players.length)}</strong></span><b>seals collected</b></div><p class="finale-reason">${esc(game.roundSummary?.reason ?? `Final round: ${roundWinners} won.`)} ${bonus ? 'A Wiretap bonus seal helped decide the match.' : ''}</p><div class="finale-actions">${isHost ? `<button type="button" id="rematch" class="primary" ${busy ? 'disabled' : ''}>Rematch · same crew ↻</button>` : '<p>Waiting for the host to play again…</p>'}${isHost && !localSolo ? '<button type="button" id="return-lobby" class="secondary">Invite more friends</button>' : ''}<button type="button" id="finish-home" class="secondary">Leave table</button></div><div class="finale-standings"><h2>Final standings</h2><ol class="finale-leaderboard">${sealTrack}</ol></div></section>${error ? `<p class="error">${esc(error)}</p>` : ''}</main>${rulesSheet()}${leaveSheet()}`;
}

function game(): string {
  const game = room!.game!;
  const me = game.players.find(p => p.id === session!.playerId)!;
  if (game.phase === 'match-over' && showMatchFinale) return matchFinale();
  const ui = turnPresentation(game, me.id, selectedCard, selectedTarget, selectedGuess);
  const { turn, nextPlayer, myTurn, choosingBottom, targets, guesses, playable, forcedCard } = ui;
  const ownPlay = ui.lastOwnAction && game.lastAction?.sequence !== ui.lastOwnAction.sequence ? ui.lastOwnAction : undefined;
  const ownTarget = ownPlay ? game.players.find(player => player.id === ownPlay.targetId) : undefined;
  const ownReceipt = ownPlay ? `<div class="own-receipt" role="status"><span class="receipt-icon" aria-hidden="true">✓</span><span><b>Your last move: ${CARDS[ownPlay.card].name}${ownTarget ? ` → ${esc(ownTarget.name)}` : ''}${ownPlay.guess !== undefined ? ` · guessed ${CARDS[ownPlay.guess].name}` : ''}</b><small>${esc(ownPlay.resolution)}</small></span></div>` : '';
  const instruction = esc(ui.title);
  const turnStep = ui.stepLabel;
  const heldCard = game.hand.find((_, index) => index !== selectedCardIndex);
  const selfEvidenceRisk = selectedCard === 5 && selectedTarget === me.id && heldCard === 9;
  const firstRoundTip = showFirstRoundTips && game.round === 1 && ui.tip ? `<div class="turn-guide"><span aria-hidden="true">ⓘ</span><small>${esc(ui.tip)}</small><button type="button" id="hide-tips" aria-label="Hide first round tips">×</button></div>` : '';

  let action = '';
  if (ui.phase === 'case-review') action = `<div class="action-sheet confirm" aria-label="Keep a card"><div class="action-step">CASE REVIEW</div><p>Keep one card</p><small class="action-effect">Tap the card you want in your hand. The others return unseen.</small><button type="button" id="confirm-bottom" class="primary" ${!busy && selectedKeepIndex !== undefined ? '' : 'disabled'}>${busy ? 'Keeping…' : selectedKeepIndex === undefined ? 'Choose a card to keep' : `Keep ${CARDS[game.hand[selectedKeepIndex]].name}`}</button>${selectedKeepIndex !== undefined && !busy ? '<button type="button" id="change-review" class="cancel">‹ Change card</button>' : ''}</div>`;
  else if (ui.phase === 'choose-target' && selectedCard !== undefined) action = `<div class="action-sheet" aria-label="Choose a player"><div class="action-step">STEP 2 OF ${selectedCard === 1 ? '3' : '2'}</div><h3>${instruction}</h3><p class="action-help">${CARDS[selectedCard].name}: ${CARD_FACE_TEXT[selectedCard]}</p>${targets.map(id => { const p = game.players.find(x => x.id === id)!; const selfTarget = selectedCard === 5 && id === me.id; return `<button type="button" data-target="${id}"><span class="target-avatar" aria-hidden="true">${p.bot ? 'B' : esc(p.name[0])}</span><span class="target-copy"><b>${selfTarget ? 'You' : esc(p.name)}</b><small>${selfTarget ? heldCard === 9 ? 'Scarlet Evidence will eliminate you' : 'Discard your card and redraw' : `${p.tokens} seals`}</small></span><span aria-hidden="true">›</span></button>`; }).join('')}<button type="button" class="cancel">‹ Back to cards</button></div>`;
  else if (ui.phase === 'guess' && selectedCard !== undefined && selectedTarget) action = `<div class="action-sheet" aria-label="Choose a card guess"><div class="action-step">STEP 3 OF 3</div><h3>What card do they hold?</h3><p class="action-help">Guess ${esc(game.players.find(p => p.id === selectedTarget)?.name ?? 'their')}’s card</p><div class="guess-grid">${guesses.map(v => `<button type="button" data-guess="${v}"><b>${v}</b>${CARDS[v].name}</button>`).join('')}</div><button type="button" class="cancel">‹ Back to players</button></div>`;
  else if (ui.phase === 'confirm' && selectedCard !== undefined) action = `<div class="action-sheet confirm ${selectedCard === 9 || selfEvidenceRisk ? 'danger-play' : ''}" aria-label="Confirm card play"><div class="action-step">FINAL STEP</div><p>Play <b>${CARDS[selectedCard].name}</b>${selectedTarget ? ` on <b>${esc(game.players.find(p => p.id === selectedTarget)!.name)}</b>` : ''}${selectedGuess !== undefined ? `, guessing <b>${CARDS[selectedGuess].name} (${selectedGuess})</b>` : ''}?</p><small class="action-effect">${cardPlayPreview(game, selectedCard, selectedCardIndex ?? game.hand.indexOf(selectedCard), selectedTarget)}</small><small class="visibility-note"><span aria-hidden="true">◉</span>${CARD_INTEL[selectedCard].reveal}</small><button type="button" id="confirm" class="primary" ${busy ? 'disabled' : ''}>${busy ? 'Playing…' : selectedCard === 9 ? 'Play and leave the round' : selfEvidenceRisk ? 'Discard evidence and leave round' : 'Play card'}</button><button type="button" class="cancel">${selectedGuess !== undefined ? '‹ Back to guesses' : selectedTarget ? '‹ Back to players' : '‹ Back to cards'}</button></div>`;

  const winningIds = game.winnerIds;
  const winnerNames = winningIds.map(id => id === me.id ? 'You' : game.players.find(p => p.id === id)?.name).filter(Boolean).join(' & ');
  const winnerVerb = winningIds.length === 1 && winningIds[0] !== me.id ? 'wins' : 'win';
  const soleSurvivor = game.roundSummary?.reveals.length === 1
    ? game.players.find(player => player.id === game.roundSummary?.reveals[0].playerId)
    : undefined;
  const roundReason = soleSurvivor
      ? `${soleSurvivor.id === me.id ? 'You were' : `${soleSurvivor.name} was`} the last investigator in the case.`
      : game.roundSummary?.reason;
  const lastActor = game.players.find(p => p.id === game.lastAction?.actorId);
  const lastTarget = game.players.find(p => p.id === game.lastAction?.targetId);
  const botAside = lastActor?.bot ? `<em>“${['Nothing personal.', 'I had a hunch.', 'Follow the evidence.', 'That story does not add up.', 'You cannot reach me here.', 'Let us try another angle.', 'Every detail matters.', 'New face, same case.', 'A useful distraction.', 'Case closed.'][game.lastAction!.card]}”</em>` : '';
  const actionStage = game.lastAction && lastActor ? `<section class="action-stage action-${game.lastAction.card} ${animateAction ? 'animate' : ''} ${resolvedAction ? 'result-updated' : ''}" aria-live="polite"><div class="stage-origin"><small>LAST CARD PLAYED</small><strong>${lastActor.id === me.id ? 'You' : esc(lastActor.name)}${lastTarget ? ` <span>→</span> ${lastTarget.id === me.id ? 'You' : esc(lastTarget.name)}` : ''}</strong></div><div class="featured-play">${cardFace(game.lastAction.card)}</div><p class="action-resolution">${game.lastAction.guess !== undefined ? `Guessed ${CARDS[game.lastAction.guess].name} (${game.lastAction.guess}). ` : ''}${esc(game.lastAction.resolution)}${botAside}</p></section>` : `<section class="action-stage waiting"><span class="empty-discard" aria-hidden="true">✦</span><p>Round ${game.round} is dealt.<br><small>${esc(turn?.name ?? 'The first player')} draws first.</small></p></section>`;
  const publicDiscards = `<section id="public-cards" class="discard-board" aria-label="All public cards"><div class="discard-heading"><p class="eyebrow">PUBLIC CARDS</p><small>${game.players.length > 3 ? 'Swipe for more →' : 'Tap a card for its effect'}</small></div>${inspectedCard !== undefined ? `<div class="card-inspector" role="region" aria-label="${CARDS[inspectedCard].name}, value ${inspectedCard}. ${CARDS[inspectedCard].text}" tabindex="-1">${cardFace(inspectedCard)}<span class="inspector-description"><b>${CARDS[inspectedCard].name}</b><small>${CARD_FACE_TEXT[inspectedCard]}</small></span><button type="button" id="close-card-inspector" aria-label="Close card details">×</button></div>` : ''}<div class="discard-lanes">${game.players.map(player => `<article class="discard-lane ${game.lastAction?.targetId === player.id ? 'targeted' : ''}"><b>${player.id === me.id ? 'You' : esc(player.name)}</b><div>${player.discards.length ? player.discards.map((value, index) => `<button type="button" data-inspect-card="${value}" class="discard-chip ${game.lastAction?.actorId === player.id && index === player.discards.length - 1 ? 'latest' : ''} ${index >= (newDiscardCounts.get(player.id) ?? Infinity) ? 'new-discard' : ''}" aria-label="Inspect ${CARDS[value].name}, value ${value}. ${CARD_FACE_TEXT[value]}" aria-pressed="${inspectedCard === value}">${cardFace(value)}</button>`).join('') : '<em>None yet</em>'}</div></article>`).join('')}</div></section>`;
  const roundReveals = game.roundSummary?.reveals.map((reveal, index) => {
    const player = game.players.find(p => p.id === reveal.playerId);
    const won = game.winnerIds.includes(reveal.playerId);
    return `<li class="flip-seat ${won ? 'flip-winner' : ''}" aria-label="${esc(player?.name ?? 'Player')} held ${CARDS[reveal.card].name}, value ${reveal.card}${won ? ', round winner' : ''}"><div class="flip-inner" style="animation-delay:${350 + index * 300}ms"><div class="flip-back" aria-hidden="true">${logo('flip-seal')}</div><div class="flip-front">${cardFace(reveal.card)}</div></div><b>${player?.id === me.id ? 'You' : esc(player?.name ?? 'Player')}</b>${won ? `<span class="flip-award">+1 ${seal()} seal</span>` : ''}</li>`;
  }).join('') ?? '';
  const awardRows = game.players.flatMap(player => {
    const awards = game.roundSummary?.awards.filter(award => award.playerId === player.id) ?? [];
    if (!awards.length) return [];
    const reasons = awards.map(award => award.source === 'round' ? 'Round win' : 'Wiretap bonus').join(' + ');
    return [`<li><b>${player.id === me.id ? 'You' : esc(player.name)}</b><small>${reasons}</small><strong>+${awards.length} ${seal()}</strong></li>`];
  }).join('');
  const isHost = room!.players.some(player => player.id === me.id && player.host);
  const decisivePlays = game.log.filter(line => !line.startsWith('Round ')).slice(-4);
  const roundTimeline = decisivePlays.length ? `<details class="round-timeline" data-detail="round-timeline"><summary><b>Round timeline</b><small>${decisivePlays.length} events</small></summary><ol>${decisivePlays.map((line, index) => `<li><span class="timeline-number" aria-hidden="true">${index + 1}</span><span>${esc(line)}</span></li>`).join('')}</ol></details>` : '';
  const resultActions = game.phase === 'round-over'
    ? isHost ? `<button type="button" id="next-round" class="primary replay-button" ${busy ? 'disabled' : ''}>Deal next round →</button>` : '<p class="result-wait">Waiting for the host to deal…</p>'
    : `${isHost ? '<button id="rematch" class="primary">Rematch · same crew</button>' : '<p class="result-wait">Waiting for the host to play again…</p>'}<button id="show-finale" class="secondary">See final results</button>`;
  const celebrationDelay = 650 + (game.roundSummary?.reveals.length ?? 0) * 300;
  const confetti = Array.from({ length: 24 }, (_, index) => `<i style="left:${(index * 37) % 96}%;animation-delay:${celebrationDelay + index * 30}ms" aria-hidden="true"></i>`).join('');
  const animateRound = game.phase !== 'playing' && animatedRound !== game.round && !rulesOpen && !leaveOpen && !settingsOpen;
  if (animateRound) animatedRound = game.round;
  const roundOverlay = game.phase !== 'playing' ? `<section class="round-reveal ${animateRound ? 'animate' : ''}" aria-labelledby="result-title"><div class="round-confetti" aria-hidden="true">${confetti}</div><div class="round-reveal-head"><p class="eyebrow">ROUND ${game.round} · CARDS REVEALED</p><h2 id="result-title" tabindex="-1">${esc(winnerNames || 'A rival')} ${winnerVerb} the round</h2><p>${esc(roundReason ?? '')}</p></div><ol class="flip-seats">${roundReveals}</ol><div class="round-reveal-bottom"><div class="seal-awards"><h3>Seals earned</h3><ul>${awardRows}</ul></div>${resultActions}${roundTimeline}</div></section>` : '';
  const reaction = room!.reaction && visibleReactionSequence === room!.reaction.sequence ? room!.reaction : undefined;
  const reactionPlayer = reaction ? room!.players.find(player => player.id === reaction.playerId) : undefined;
  const aliveCount = game.players.filter(p => !p.eliminated).length;
  return `<main class="table"><header class="table-header"><span class="table-brand">${logo('mini-crest')}<b>Scarlet Seal</b><small>ROUND ${game.round}</small></span><nav aria-label="Game navigation">${leaveButton()}${rulesButton('Rules')}<button type="button" id="sound-toggle" class="sound-toggle" aria-label="${soundEnabled ? 'Mute sound' : 'Enable sound'}" aria-pressed="${soundEnabled}" title="${soundEnabled ? 'Sound on' : 'Sound off'}"><span aria-hidden="true">♫</span></button></nav><span class="deck-count">DRAW PILE <b>${game.deckCount}</b></span></header>${connectionNotice()}${returnRecap()}
    <section class="game-felt ${roundStarted ? 'round-enter' : ''}" aria-label="Game table"><section class="table-seats" aria-label="Players in turn order"><div class="table-section-heading"><span>INVESTIGATORS <b>${aliveCount} / ${game.players.length} IN</b></span><small>First to ${tokenTarget(game.players.length)} seals</small></div><div class="opponents">${game.players.map((p, index) => { const isMe = p.id === me.id; const targeted = game.lastAction?.targetId === p.id; const hasTurn = game.turnPlayerId === p.id && game.phase === 'playing'; return `<div data-player-id="${p.id}" class="opponent ${isMe ? 'your-seat' : ''} ${p.eliminated ? 'out' : 'alive'} ${targeted ? 'targeted' : ''} ${hasTurn ? 'current-turn' : ''} ${hasTurn && turnChanged ? 'turn-enter' : ''} ${newlyOut.has(p.id) ? 'just-out' : ''} ${newlyProtected.has(p.id) ? 'just-shielded' : ''}"><div class="seat-top"><span class="seat-order">${index + 1}</span><b>${isMe ? 'You' : esc(p.name)}</b><span class="seat-score ${earnedSeals.has(p.id) ? 'seal-earned' : ''}">${p.tokens} ${seal()}</span></div><div class="seat-bottom"><span class="opponent-card ${p.handCount > 1 ? 'two-cards' : ''}" aria-label="${isMe ? 'Your hand is below' : `${p.handCount} hidden card${p.handCount === 1 ? '' : 's'}`}">${p.eliminated ? '✕' : isMe ? '↓' : '?'}</span><span class="seat-state"><strong>${p.eliminated ? 'OUT' : hasTurn ? (isMe ? 'YOUR TURN' : 'PLAYING') : 'IN'}</strong>${p.protected ? '<small>Shielded</small>' : isMe ? '<small>Your hand below</small>' : `<small>${p.handCount} card${p.handCount === 1 ? '' : 's'}</small>`}</span></div></div>`; }).join('')}</div></section><div class="board-center">${game.phase === 'playing' ? actionStage : roundOverlay}</div>${publicDiscards}</section>
    ${game.phase === 'playing' ? `<section class="decision-zone" ${room!.migration || !socket.connected ? 'inert' : ''}><section class="turn-banner ${myTurn ? 'active' : ''} ${turnChanged ? 'turn-enter' : ''} ${turnCue ? 'turn-call' : ''}" aria-live="polite"><span class="turn-dot" aria-hidden="true"></span><div><small>${turnStep}</small><p>${instruction}</p>${turnCue ? '<span class="turn-alert" aria-hidden="true">✦ YOUR TURN</span>' : ''}${firstRoundTip}</div><span class="turn-next">${nextPlayer ? `NEXT <b>${nextPlayer.id === me.id ? 'YOU' : esc(nextPlayer.name)}</b>` : ''}</span></section>${ownReceipt}${game.notice && !choosingBottom ? privateClue(game.notice) : ''}<section class="play-area"><section class="hand"><div class="hand-heading"><p class="eyebrow">${choosingBottom ? 'CHOOSE ONE TO KEEP' : game.hand.length > 1 ? 'YOUR TWO CARDS' : 'YOUR CARD'}</p><span>${choosingBottom ? selectedKeepIndex === undefined ? 'Tap your favourite' : 'Tap another to change' : myTurn ? 'Choose one to play' : 'Only you can see this'}</span></div><div class="cards ${choosingBottom ? 'review-cards' : ''}">${game.hand.map((v, index) => card(v, index, !busy && (choosingBottom || myTurn && playable.has(v)), forcedCard === v, choosingBottom, myTurn && !choosingBottom && !playable.has(v) ? (forcedCard !== undefined ? 'Red Herring must be played' : 'Unavailable now') : '')).join('')}</div></section>${action ? `<div id="turn-action">${action}</div>` : ''}</section></section>` : ''}
    ${game.phase !== 'playing' ? '<div class="result-side">' : ''}<details class="reactions" data-detail="reactions"><summary><span aria-hidden="true">☺</span> React <span aria-hidden="true">⌄</span></summary><nav aria-label="Table reactions"><button type="button" data-reaction="Suspicious"><span aria-hidden="true">◉</span><small>Suspicious</small></button><button type="button" data-reaction="Nice try"><span aria-hidden="true">✦</span><small>Nice try</small></button><button type="button" data-reaction="Case closed"><span aria-hidden="true">✓</span><small>Case closed</small></button></nav></details><details class="case-feed" data-detail="case-feed" aria-label="Recent public plays"><summary>Case notes <span>${game.publicActions.length} plays</span></summary><ol>${game.publicActions.slice(-5).reverse().map(event => { const actor = game.players.find(p => p.id === event.actorId); const target = game.players.find(p => p.id === event.targetId); return `<li><span class="play-value">${event.card}</span><span><b>${actor?.id === me.id ? 'You' : esc(actor?.name ?? 'Player')} played ${CARDS[event.card].name}${target ? ` on ${target.id === me.id ? 'you' : esc(target.name)}` : ''}${event.guess !== undefined ? `, guessing ${CARDS[event.guess].name}` : ''}</b><small>${esc(event.resolution)}</small></span></li>`; }).join('')}</ol></details>${game.phase !== 'playing' ? '</div>' : ''}
    ${reaction && reactionPlayer ? `<div class="reaction-pop" role="status"><b>${reactionPlayer.id === me.id ? 'You' : esc(reactionPlayer.name)}</b><span>${reaction.text}</span></div>` : ''}${error ? `<p class="error">${esc(error)}</p>` : ''}</main>${rulesSheet()}${leaveSheet()}`;
}

function animateGameState(origin: DOMRect | undefined, deck: DOMRect | undefined, fromIndex: number): void {
  if ((quietMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
  const featured = document.querySelector<HTMLElement>('.action-stage.animate .featured-play');
  if (featured && origin) {
    const stage = featured.closest<HTMLElement>('.action-stage');
    stage?.classList.remove('animate');
    if (stage) stage.style.overflow = 'visible';
    const end = featured.getBoundingClientRect();
    const dx = origin.left + origin.width / 2 - end.left - end.width / 2;
    const dy = origin.top + origin.height / 2 - end.top - end.height / 2;
    const animation = featured.animate([
      { opacity: .25, transform: `translate(${dx}px, ${dy}px) scale(.42) rotate(-14deg)` },
      { opacity: 1, transform: 'translate(0, -7px) scale(1.05) rotate(2deg)', offset: .78 },
      { opacity: 1, transform: 'rotate(-3deg)' }
    ], { duration: 680, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'none' });
    animation.onfinish = () => { if (stage) stage.style.overflow = ''; };
  }
  if (deck) {
    const cards = [...document.querySelectorAll<HTMLElement>('.hand .card')].slice(fromIndex);
    cards.forEach((card, index) => {
      const end = card.getBoundingClientRect();
      const dx = deck.left + deck.width / 2 - end.left - end.width / 2;
      const dy = deck.top + deck.height / 2 - end.top - end.height / 2;
      card.animate([
        { opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(.35) rotate(12deg)` },
        { opacity: 1, transform: 'translate(0, -8px) scale(1.04) rotate(-2deg)', offset: .82 },
        { opacity: 1, transform: 'none' }
      ], { duration: 600, delay: index * 100, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'none' });
    });
  }
}

function render(): void {
  const focused = document.activeElement as HTMLElement | null;
  const focusSelector = focused?.id ? `#${focused.id}` : focused?.matches('input[name]') ? `input[name="${(focused as HTMLInputElement).name}"]` : focused?.matches('[data-card-index]') ? `[data-card-index="${focused.dataset.cardIndex}"]` : focused?.matches('[data-target]') ? `[data-target="${focused.dataset.target}"]` : focused?.matches('[data-guess]') ? `[data-guess="${focused.dataset.guess}"]` : undefined;
  const selection = focused instanceof HTMLInputElement && /^(text|search|tel|url|password)$/.test(focused.type) ? [focused.selectionStart, focused.selectionEnd] : undefined;
  const rulesScroll = root.querySelector('.rules-body')?.scrollTop;

  const origin = animateAction ? playOrigin : undefined;
  const deck = drawOrigin;
  const fromIndex = drawFromIndex;
  const openDetails = new Set([...root.querySelectorAll<HTMLDetailsElement>('details[data-detail][open]')].map(detail => detail.dataset.detail));
  const discardScroll = root.querySelector<HTMLElement>('.discard-lanes')?.scrollLeft ?? 0;
  root.innerHTML = (!room ? landing() : room.game ? game() : lobby()) + preferencesSheet();
  const header = root.querySelector('.landing-tools') ?? root.querySelector('.table-header nav') ?? root.querySelector('main>header');
  header?.insertAdjacentHTML('beforeend', `<button id="open-settings" class="settings-button" aria-label="Table preferences">${uiIcon('settings')}</button>`);
  if (room) root.querySelector('main')?.insertAdjacentHTML('beforeend', '<a class="collection-link" href="https://decadenceinc.com/">← Arcade collection</a>');
  if (room && landingCode && room.code !== landingCode) root.querySelector('main')?.insertAdjacentHTML('afterbegin', `<p class="connection-notice">Your invitation is for ${esc(landingCode)}. Leave this table to follow it.</p>`);
  if (toast) root.insertAdjacentHTML('beforeend', `<p class="status-toast" role="status">${esc(toast)}</p>`);
  if (room?.migration) root.querySelector<HTMLButtonElement>('#ready')?.setAttribute('disabled','');
  if (busy || (!localSolo && !socket.connected)) root.querySelectorAll<HTMLButtonElement>('#create-room, #join-code, #start, #ready, #rematch, #return-lobby, [data-card], [data-target], [data-guess], #confirm, #confirm-bottom').forEach(button => button.disabled = true);

  document.body.classList.toggle('dialog-open', rulesOpen || leaveOpen || settingsOpen);
  document.body.classList.toggle('offline-solo', Boolean(localSolo));
  if (localSolo) root.querySelector('.decision-zone')?.removeAttribute('inert');
  root.querySelectorAll<HTMLDetailsElement>('details[data-detail]').forEach(detail => { if (openDetails.has(detail.dataset.detail)) detail.open = true; });
  const discardRail = root.querySelector<HTMLElement>('.discard-lanes');
  if (discardRail) discardRail.scrollLeft = discardScroll;
  const screen = root.querySelector<HTMLElement>('main');
  if (screen) screen.inert = rulesOpen || leaveOpen || settingsOpen;
  animateAction = false;
  playOrigin = undefined;
  drawOrigin = undefined;
  turnChanged = false;
  turnCue = false;
  roundStarted = false;
  resolvedAction = false;
  newDiscardCounts = new Map();
  earnedSeals = new Set();
  newlyOut = new Set();
  newlyProtected = new Set();
  bind();
  if (rulesScroll !== undefined) { const body = root.querySelector('.rules-body'); if (body) body.scrollTop = rulesScroll; }
  const replacement = focusSelector ? root.querySelector<HTMLElement>(focusSelector) : undefined; replacement?.focus({ preventScroll: true });
  if (replacement instanceof HTMLInputElement && selection) replacement.setSelectionRange(selection[0], selection[1]);
  if (origin || deck) {
    const screen = root.firstElementChild;
    requestAnimationFrame(() => { if (root.firstElementChild === screen) animateGameState(origin, deck, fromIndex); });
  }
  requestAnimationFrame(() => {
    const modal = document.querySelector<HTMLElement>('.confirm-dialog, .rules-sheet');
    if (!modal) return;
    const controls = [...modal.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')];
    if (!modal.contains(document.activeElement)) controls[0]?.focus();
    modal.addEventListener('keydown', event => {
      if (event.key !== 'Tab' || !controls.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  });
}

const revealTurnAction = () => requestAnimationFrame(() => {
  const action = document.querySelector('#turn-action');
  action?.scrollIntoView({ block: 'nearest', behavior: (quietMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches) ? 'auto' : 'smooth' });
  const next = selectedTarget && selectedGuess === undefined ? action?.querySelector<HTMLElement>('[data-guess]') : undefined;
  (next || action?.querySelector<HTMLElement>('#confirm, #confirm-bottom, [data-target], [data-guess]'))?.focus({ preventScroll: true });
});

function closeDialog(): void {
  rulesOpen = false;
  leaveOpen = false;
  settingsOpen = false;
  render();
  const selector = modalReturnFocus;
  modalReturnFocus = '';
  if (selector) requestAnimationFrame(() => document.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true }));
}

function closeCardInspector(): void {
  const card = inspectedCard;
  inspectedCard = undefined;
  render();
  requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-inspect-card="${card}"]`)?.focus({ preventScroll: true }));
}

function bind(): void {
  document.querySelector('#open-settings')?.addEventListener('click', () => { modalReturnFocus = '#open-settings'; settingsOpen = true; render(); });
  document.querySelector('#close-settings')?.addEventListener('click', closeDialog);
  document.querySelector('#quiet-motion')?.addEventListener('change', e => { quietMotion = (e.target as HTMLInputElement).checked; localStorage.setItem('scarlet-seal-quiet-motion', quietMotion ? 'yes' : 'no'); applyMotion(); });
  document.querySelector('#haptics')?.addEventListener('change', e => { haptics = (e.target as HTMLInputElement).checked; localStorage.setItem('scarlet-seal-haptics', haptics ? 'yes' : 'no'); });
  document.querySelector('#sound-preference')?.addEventListener('change', e => { soundEnabled = (e.target as HTMLInputElement).checked; localStorage.setItem('scarlet-seal-sound', soundEnabled ? 'on' : 'off'); setSoundEnabled(soundEnabled); unlockSound(); });
  document.querySelectorAll<HTMLElement>('[data-connection]').forEach(button => button.addEventListener('click', () => { connectionGuide = button.dataset.connection as 'local' | 'internet'; render(); }));
  document.querySelector('#invite-link')?.addEventListener('click', e => (e.target as HTMLInputElement).select());
  document.querySelector('#ready')?.addEventListener('click', () => emit(cb => socket.emit('room:ready', !room!.players.find(player => player.id === session?.playerId)?.ready, cb)));
  document.querySelector('#return-lobby')?.addEventListener('click', () => emit(cb => socket.emit('room:return-lobby', cb)));
  document.querySelector('#show-finale')?.addEventListener('click', () => { showMatchFinale = true; render(); window.scrollTo({top:0}); });

  document.querySelector('#sound-toggle')?.addEventListener('click', () => {
    soundEnabled = !soundEnabled; setSoundEnabled(soundEnabled);
    localStorage.setItem('scarlet-seal-sound', soundEnabled ? 'on' : 'off');
    render();
  });
  document.querySelector('#hide-tips')?.addEventListener('click', () => { showFirstRoundTips = false; localStorage.setItem('scarlet-seal-tips-complete', 'yes'); render(); document.querySelector<HTMLElement>('.hand .card.playable, [data-open-rules]')?.focus(); });
  document.querySelectorAll('[data-open-rules]').forEach(el => el.addEventListener('click', () => { modalReturnFocus = '[data-open-rules]'; rulesOpen = true; render(); }));
  document.querySelector('#close-rules')?.addEventListener('click', closeDialog);
  document.querySelector('.rules-backdrop')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeDialog(); });
  const lanForm = document.querySelector<HTMLFormElement>('#lan-form');
  document.querySelector('#retry-seat')?.addEventListener('click', () => { error = ''; restoringSeat = true; render(); socket.connect(); });
  document.querySelector('#dismiss-recap')?.addEventListener('click', () => { restoredSeat = false; render(); });
  document.querySelector('#show-join-code')?.addEventListener('click', () => { joiningByCode = !joiningByCode; render(); if (joiningByCode) requestAnimationFrame(() => document.querySelector<HTMLInputElement>('#join-code-panel input[name=code]')?.focus()); });
  lanForm?.querySelector<HTMLInputElement>('input[name=name]')?.addEventListener('input', event => { landingName = (event.currentTarget as HTMLInputElement).value; });
  lanForm?.querySelector<HTMLInputElement>('input[name=code]')?.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); joinRoom((event.currentTarget as HTMLInputElement).value); } });
  lanForm?.querySelector<HTMLInputElement>('input[name=code]')?.addEventListener('input', event => { landingCode = (event.currentTarget as HTMLInputElement).value.toUpperCase(); });

  lanForm?.addEventListener('submit', e => { e.preventDefault(); emit(cb => socket.emit('room:create', ensureName(), cb)); });
  document.querySelector('#quick-play')?.addEventListener('click', () => quickPlay(landingName || 'You'));
  document.querySelector('#join-code')?.addEventListener('click', () => { const code = lanForm?.querySelector<HTMLInputElement>('input[name=code]'); if (!code?.value.trim()) { code?.focus(); code?.setCustomValidity('Enter a room code.'); code?.reportValidity(); code?.setCustomValidity(''); return; } joinRoom(code.value); });
  document.querySelectorAll<HTMLElement>('[data-join-room]').forEach(el => el.addEventListener('click', () => joinRoom(el.dataset.joinRoom!)));
  document.querySelector('#add-bot')?.addEventListener('click', () => emit(cb => socket.emit('room:add-bot', cb)));
  document.querySelectorAll<HTMLElement>('[data-remove-bot]').forEach(el => el.addEventListener('click', () => emit(cb => socket.emit('room:remove-bot', el.dataset.removeBot!, cb))));
  document.querySelector('#start')?.addEventListener('click', () => emit(cb => socket.emit('game:start', cb)));
  document.querySelector('#continue-host')?.addEventListener('click', () => emit(cb => socket.emit('room:host-decision', true, cb)));
  document.querySelector('#wait-host')?.addEventListener('click', () => emit(cb => socket.emit('room:host-decision', false, cb)));
  document.querySelector('#forfeit-disconnected')?.addEventListener('click', () => emit(cb => socket.emit('game:forfeit-disconnected', cb)));
  document.querySelector('#next-round')?.addEventListener('click', () => localSolo ? localAction(solo => solo.nextRound()) : emit(cb => socket.emit('game:next-round', cb)));
  document.querySelector('#rematch')?.addEventListener('click', () => localSolo ? localAction(solo => solo.rematch()) : emit(cb => socket.emit('game:rematch', cb)));
  document.querySelectorAll<HTMLElement>('[data-reaction]').forEach(el => el.addEventListener('click', () => emit(cb => socket.emit('room:react', el.dataset.reaction as 'Suspicious' | 'Nice try' | 'Case closed', cb))));
  document.querySelector('#share')?.addEventListener('click', async () => {
    const data = { title: 'Join my Scarlet Seal room', text: `Join room ${room!.code}`, url: joinLink(location.origin, room!.code) };
    try {
      if (navigator.share) await navigator.share(data);
      else { await navigator.clipboard.writeText(`${data.text}: ${data.url}`); notify('Invitation copied. Send it to your crew.'); }
    } catch (reason) { if (reason instanceof DOMException && reason.name === 'AbortError') return; notify('Select the invitation link to copy it, or share the room code.'); const link = document.querySelector<HTMLInputElement>('#invite-link'); link?.focus(); link?.select(); }
  });
  document.querySelectorAll('[data-leave-room], #finish-home').forEach(el => el.addEventListener('click', () => { modalReturnFocus = el.id === 'finish-home' ? '#finish-home' : '[data-leave-room]'; leaveOpen = true; render(); }));
  document.querySelector('#stay-room')?.addEventListener('click', closeDialog);
  document.querySelector('#confirm-leave')?.addEventListener('click', returnHome);
  document.querySelectorAll<HTMLElement>('[data-inspect-card]').forEach(el => el.addEventListener('click', () => { inspectedCard = Number(el.dataset.inspectCard) as CardValue; render(); requestAnimationFrame(() => document.querySelector<HTMLElement>('.card-inspector')?.focus({ preventScroll: true })); }));
  document.querySelector('#close-card-inspector')?.addEventListener('click', closeCardInspector);
  document.querySelectorAll<HTMLElement>('[data-card]').forEach(el => el.addEventListener('click', () => {
    const value = Number(el.dataset.card) as CardValue;
    selectedCard = value; selectedCardIndex = Number(el.dataset.cardIndex); selectedTarget = undefined; selectedGuess = undefined;
    const direct = room?.game?.legalMoves.find(move => move.card === value && move.targetId === undefined && move.guess === undefined);
    if (direct && !needsPlayConfirmation(room!.game!, direct, selectedCardIndex)) { play(direct); return; }
    render(); revealTurnAction();
  }));
  document.querySelectorAll<HTMLElement>('[data-bottom-index]').forEach(el => el.addEventListener('click', () => {
    const index = Number(el.dataset.bottomIndex);
    selectedKeepIndex = selectedKeepIndex === index ? undefined : index;
    render();
    if (selectedKeepIndex !== undefined) revealTurnAction();
    else requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-bottom-index="${index}"]`)?.focus({ preventScroll: true }));
  }));
  document.querySelectorAll<HTMLElement>('[data-target]').forEach(el => el.addEventListener('click', () => {
    selectedTarget = el.dataset.target; selectedGuess = undefined;
    const move = room?.game?.legalMoves.find(candidate => candidate.card === selectedCard && candidate.targetId === selectedTarget && candidate.guess === undefined);
    if (move && selectedCardIndex !== undefined && !needsPlayConfirmation(room!.game!, move, selectedCardIndex)) { play(move); return; }
    render(); revealTurnAction();
  }));
  document.querySelectorAll<HTMLElement>('[data-guess]').forEach(el => el.addEventListener('click', () => {
    selectedGuess = Number(el.dataset.guess) as CardValue;
    const move = room?.game?.legalMoves.find(candidate => candidate.card === selectedCard && candidate.targetId === selectedTarget && candidate.guess === selectedGuess);
    if (move) { play(move); return; }
    render(); revealTurnAction();
  }));
  document.querySelector('#confirm')?.addEventListener('click', () => play({ card: selectedCard!, targetId: selectedTarget, guess: selectedGuess }));
  document.querySelector('#confirm-bottom')?.addEventListener('click', () => {
    if (selectedKeepIndex === undefined) return;
    const returned = room!.game!.hand.filter((_, index) => index !== selectedKeepIndex);
    if (localSolo) localAction(solo => solo.returnCards(returned));
    else emit(cb => socket.emit('game:return-cards', returned, cb));
  });
  document.querySelector('#change-review')?.addEventListener('click', () => requestAnimationFrame(() => {
    const choice = document.querySelector<HTMLElement>(`[data-bottom-index="${selectedKeepIndex}"]`);
    choice?.scrollIntoView({ block: 'center', behavior: (quietMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches) ? 'auto' : 'smooth' });
    choice?.focus({ preventScroll: true });
  }));
  document.querySelectorAll('#turn-action .cancel:not(#change-review)').forEach(el => el.addEventListener('click', backChoice));
}
function backChoice(): void {
  if (selectedGuess !== undefined) selectedGuess = undefined;
  else if (selectedTarget) selectedTarget = undefined;
  else { selectedCard = undefined; selectedCardIndex = undefined; }
  render();
  requestAnimationFrame(() => {
    const next = selectedTarget ? document.querySelector<HTMLElement>('#turn-action [data-guess]') : document.querySelector<HTMLElement>('#turn-action [data-target]');
    (next || document.querySelector<HTMLElement>('.hand .card.playable'))?.focus({ preventScroll: true });
  });
}
function play(move: Move): void {
  const feedback = () => { cue('play'); if (haptics && !quietMotion && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) navigator.vibrate?.(15); };
  if (localSolo) localAction(solo => { solo.play(move); feedback(); });
  else emit(cb => socket.emit('game:play', move, result => { if (result.ok) feedback(); cb(result); }));
}
function returnHome(): void {
  if (localSolo) { localSolo = undefined; session = undefined; room = undefined; leaveOpen = false; restoredSeat = false; localStorage.removeItem(LOCAL_SOLO_KEY); render(); refreshRooms(); joinInvitation(); return; }
  emit(cb => socket.emit('room:leave', result => { cb(result); if (result.ok) { socket.auth = {}; localStorage.removeItem('scarlet-seal-session'); localStorage.removeItem('royal-post-session'); location.href = landingCode && room?.code !== landingCode ? joinLink(location.origin, landingCode) : location.origin; } }));
}

window.render_game_to_text = () => {
  const game = room?.game;
  const me = game?.players.find(player => player.id === session?.playerId);
  const guide = game && me && showFirstRoundTips && game.round === 1 ? turnPresentation(game, me.id, selectedCard, selectedTarget, selectedGuess).tip : undefined;
  return JSON.stringify({
    coordinateSystem: 'DOM interface ordered top-to-bottom; no spatial playfield',
    screen: !room ? 'home' : !game ? 'lobby' : game.phase === 'match-over' && showMatchFinale ? 'match-finale' : 'game', connected: socket.connected, offlineSolo: Boolean(localSolo), migration: room?.migration, rulesOpen, leaveOpen, settingsOpen, lobbyPlayers: room?.players, inspectedCard, roomCode: room?.code, availableRooms,
    phase: game?.phase, round: game?.round, deckCount: game?.deckCount, firstRoundTip: guide,
    turnPlayerId: game?.turnPlayerId, playerId: me?.id, hand: game?.hand,
    selectedCard, selectedCardIndex, selectedTarget, selectedGuess, selectedKeepIndex, legalMoves: game?.legalMoves, bottomChoiceCount: game?.bottomChoiceCount,
    removedCount: game?.removedCount, players: game?.players.map(player => ({ id: player.id, name: player.name, tokens: player.tokens, protected: player.protected, eliminated: player.eliminated, handCount: player.handCount, discards: player.discards })),
    lastAction: game?.lastAction, roundSummary: game?.roundSummary, recentLog: game?.log.slice(-3), notice: game?.notice
  });
};
window.advanceTime = () => {};
document.addEventListener('keydown', async e => {
  if (e.key === 'Escape' && (rulesOpen || leaveOpen || settingsOpen)) { closeDialog(); return; }
  if (e.key === 'Escape' && inspectedCard !== undefined) { closeCardInspector(); return; }
  if (e.key === 'Escape' && (selectedCard !== undefined || selectedTarget !== undefined || selectedGuess !== undefined)) { backChoice(); return; }
  if (!document.querySelector('[role=dialog]') && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'f' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { notify('Fullscreen is unavailable in this browser.'); } }
});

document.addEventListener('click', e => { const button = (e.target as HTMLElement).closest('button'); if (button && !button.disabled) cue('tap'); });
render();
if (localSolo) runLocalBots(localSolo);
