import { io, type Socket } from 'socket.io-client';
import { registerSW } from 'virtual:pwa-register';
import { CARDS, MAX_PLAYERS, tokenTarget, type CardValue, type Move } from '../shared/game';
import type { AvailableRoom, ClientToServerEvents, Result, RoomView, ServerToClientEvents, Session } from '../shared/protocol';
import { turnPresentation } from './turn-presentation';
import { gameEvents } from './game-events';
import './styles.css';
import './redesign.css';

declare global { interface Window { render_game_to_text: () => string; advanceTime: (ms: number) => void } }

const root = document.querySelector<HTMLDivElement>('#app')!;
const saved = localStorage.getItem('scarlet-seal-session') ?? localStorage.getItem('royal-post-session');
let session: Session | undefined = saved ? JSON.parse(saved) : undefined;
let room: RoomView | undefined;
let selectedCard: CardValue | undefined;
let selectedTarget: string | undefined;
let selectedBottom: number[] = [];
let rulesOpen = false;
let leaveOpen = false;
let error = '';
let busy = false;
let animateAction = false;
let playOrigin: DOMRect | undefined;
let drawOrigin: DOMRect | undefined;
let drawFromIndex = 0;
let turnChanged = false;
let roundStarted = false;
let resolvedAction = false;
let newDiscardCounts = new Map<string, number>();
let earnedSeals = new Set<string>();
let newlyOut = new Set<string>();
let newlyProtected = new Set<string>();
let availableRooms: AvailableRoom[] = [];
let restoringSeat = Boolean(session);
let visibleReactionSequence = 0;
let landingName = localStorage.getItem('scarlet-seal-name') ?? '';
let landingCode = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '';
const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({ auth: session ?? {} });

registerSW({ immediate: true });
socket.on('session', value => { session = value; localStorage.setItem('scarlet-seal-session', JSON.stringify(value)); });
socket.on('room:state', value => {
  const previous = room?.game;
  const next = value.game;
  const events = gameEvents(previous, next, session?.playerId);
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
  room = value; restoringSeat = false; error = '';
  if (!newReaction) { selectedCard = undefined; selectedTarget = undefined; selectedBottom = []; }
  if (newReaction && value.reaction) {
    visibleReactionSequence = value.reaction.sequence;
    window.setTimeout(() => { if (visibleReactionSequence === value.reaction?.sequence) { visibleReactionSequence = 0; render(); } }, 2400);
  }
  render();
});
socket.on('connect_error', () => { error = 'Unable to reach the game server.'; render(); });
const refreshRooms = () => socket.emit('rooms:list', result => {
  if (!result.ok || room) return;
  if (JSON.stringify(availableRooms) === JSON.stringify(result.value)) return;
  availableRooms = result.value;
  render();
});
socket.on('connect', () => {
  refreshRooms();
  if (session) socket.emit('room:resume', result => {
    if (result.ok) return;
    restoringSeat = false; session = undefined;
    localStorage.removeItem('scarlet-seal-session'); localStorage.removeItem('royal-post-session');
    error = result.error; render();
  });
});
window.setInterval(refreshRooms, 3000);

const emit = <T>(send: (callback: (result: Result<T>) => void) => void) => {
  busy = true; error = ''; render();
  send(result => { busy = false; if (!result.ok) error = result.error; render(); });
};
const quickPlay = (name: string) => {
  busy = true; error = ''; render();
  socket.emit('room:create', name, created => {
    if (!created.ok) { busy = false; error = created.error; render(); return; }
    socket.emit('room:add-bot', botAdded => {
      if (!botAdded.ok) { busy = false; error = botAdded.error; render(); return; }
      socket.emit('game:start', started => { busy = false; if (!started.ok) error = started.error; render(); });
    });
  });
};
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
const art = (value: CardValue, className = 'card-art') => `<span class="${className} art-${value}" aria-hidden="true"></span>`;
const CARD_INTEL: Record<CardValue, { choice: string; reveal: string }> = {
  0: { choice: 'No target', reveal: 'Your play is public' }, 1: { choice: 'Target + guess', reveal: 'Guess and result are public' },
  2: { choice: 'Choose a rival', reveal: 'Their card stays private' }, 3: { choice: 'Choose a rival', reveal: 'Outcome is public' },
  4: { choice: 'No target', reveal: 'Protection is public' }, 5: { choice: 'Choose anyone', reveal: 'Discard is revealed' },
  6: { choice: 'No target', reveal: 'Your choice stays private' }, 7: { choice: 'Choose a rival', reveal: 'Swap is public' },
  8: { choice: 'No target', reveal: 'No extra information' }, 9: { choice: 'No target', reveal: 'You will be eliminated' }
};
const intel = (value: CardValue) => `<div class="play-intel"><span>${CARD_INTEL[value].choice}</span><span>${CARD_INTEL[value].reveal}</span></div>`;
const card = (value: CardValue, index: number, interactive = false, forced = false, bottomChoice = false, restriction = '') => {
  const data = CARDS[value];
  const selected = bottomChoice ? selectedBottom.includes(index) : selectedCard === value;
  const dataAttr = bottomChoice ? `data-bottom-index="${index}"` : `data-card="${value}"`;
  return `<button type="button" aria-label="${data.name}, value ${value}. ${data.text}${restriction ? ` ${restriction}.` : interactive ? ' Select this card.' : ''}" class="card card-${value}${selected ? ' selected' : ''}${interactive ? ' playable' : ''}" ${interactive ? dataAttr : 'disabled'}>
    ${art(value)}${forced ? '<span class="card-badge">Must play</span>' : restriction ? `<span class="card-badge restricted">Locked</span>` : ''}<span class="card-value">${value}</span><span class="card-copy"><span class="card-name">${data.name}</span><span class="card-text">${CARD_FACE_TEXT[value]}</span><span class="card-meta">${restriction || `${CARD_INTEL[value].choice} · ${CARD_INTEL[value].reveal}`}</span></span><span class="card-count" aria-hidden="true">×${data.count}</span>
  </button>`;
};

function rulesSheet(): string {
  if (!rulesOpen) return '';
  const rows = (Object.values(CARDS)).map(data => `<li><span class="rule-card-value">${art(data.value, 'rule-art')}<b>${data.value}</b></span><span><b>${data.name}</b><small>${data.count} in deck</small><p>${data.text}</p></span></li>`).join('');
  return `<div class="rules-backdrop" data-close-rules><section class="rules-sheet" role="dialog" aria-modal="true" aria-labelledby="rules-title">
    <div class="sheet-handle" aria-hidden="true"></div><header><div><p class="eyebrow">QUICK GUIDE</p><h2 id="rules-title">How to play</h2></div><button type="button" id="close-rules" aria-label="Close rules">×</button></header>
    <div class="rules-body">
      <section class="rule-steps" aria-label="Turn steps"><article><b>1</b><span><strong>Draw</strong><small>Start your turn with two cards.</small></span></article><article><b>2</b><span><strong>Play one</strong><small>Tap a card, then follow its action.</small></span></article><article><b>3</b><span><strong>Survive</strong><small>Keep the higher card—or be the last player in.</small></span></article></section>
      <section class="rule-section"><h3>Winning</h3><p>A round ends when only one investigator remains or the deck runs out. If the deck ends, every player tied for the highest card earns a seal. The first investigator to collect three seals wins the game.</p><div class="token-goals"><span><b>Every table</b><strong>3 seals to win</strong></span></div></section>
      <section class="rule-section"><h3>Card reference <small>21 cards total</small></h3><ol class="card-reference">${rows}</ol></section>
      <section class="rule-section fine-print"><h3>Good to know</h3><ul><li>A Hunch can name any card except another Hunch.</li><li>Interrogation may target any unprotected player, including you.</li><li>If you hold Red Herring with Disguise or Interrogation, you must play Red Herring.</li><li>Safehouse protects you from other players until your next turn.</li><li>Case Review lets you secretly keep one of up to three cards.</li><li>A sole surviving Wiretap user earns one bonus evidence.</li><li>In a two-player round, three extra cards are set aside facedown.</li></ul></section>
    </div>
  </section></div>`;
}

const rulesButton = (label = 'How to play') => `<button type="button" class="rules-button" data-open-rules><span>?</span>${label}</button>`;
const leaveButton = () => `<button type="button" class="nav-button" data-leave-room aria-label="Leave this room and return home"><span aria-hidden="true">‹</span>Home</button>`;
const leaveSheet = () => leaveOpen ? `<div class="dialog-backdrop"><section class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="leave-title"><p class="eyebrow">LEAVE ROOM</p><h2 id="leave-title">Return home?</h2><p>${room?.game ? 'Your seat will remain in this match as disconnected.' : 'You will leave this lobby.'}</p><div><button type="button" id="stay-room" class="secondary">Stay here</button><button type="button" id="confirm-leave" class="primary">Leave room</button></div></section></div>` : '';
const logo = (className: string) => `<img class="${className}" src="/icon-192.png" alt="" aria-hidden="true">`;

function landing(): string {
  if (restoringSeat) return `<main class="resume-seat"><div class="crest">${logo('crest-logo')}</div><p class="eyebrow">SAVED TABLE FOUND</p><h1>Return to<br><i>your seat</i></h1><p>Reconnecting you to room ${esc(session?.roomCode ?? '')}…</p>${error ? `<p class="error" role="alert">${esc(error)}</p><button type="button" id="retry-seat" class="secondary">Try reconnecting</button>` : '<span class="resume-pulse" aria-hidden="true"></span>'}</main>`;
  const roomRows = availableRooms.map(available => `<button type="button" class="room-row" data-join-room="${available.code}"><span class="room-identity"><b>${esc(available.hostName)}'s table</b><small>${available.code} · ${available.botCount ? `${available.botCount} bot${available.botCount === 1 ? '' : 's'}` : 'people only'}</small></span><span class="room-seats"><b>${available.playerCount}/${available.maxPlayers}</b><small>seats</small></span><span class="room-join">Sit down <i>›</i></span></button>`).join('');
  return `<main class="landing">
    <div class="landing-tools">${rulesButton()}</div>
    <section class="home-hero"><div class="crest">${logo('crest-logo')}</div><div><p class="eyebrow">A GAME OF DECEPTION &amp; DEDUCTION</p><h1>Scarlet <i>Seal</i></h1><p class="intro">Start a case now, or sit down at a nearby table.</p></div></section>
    <button type="button" id="quick-play" class="primary quick-play" ${busy ? 'disabled' : ''}><span><b>Play against a bot</b><small>No name or setup needed</small></span><i>›</i></button>
    <form id="lan-form" class="lan-panel"><div class="section-heading"><div><p class="eyebrow">LAN TABLES</p><h2>Play with people nearby</h2></div><span class="live-dot">Live</span></div><label>Your name<input name="name" maxlength="20" autocomplete="nickname" placeholder="Detective Violet" value="${esc(landingName)}" required></label>
      <div class="available-rooms">${roomRows || '<div class="empty-rooms"><b>No tables are waiting yet</b><small>Create one and others on this network can join.</small></div>'}</div>
      <button type="submit" id="create-room" class="secondary" ${busy ? 'disabled' : ''}>Create a new table</button>
      <div class="code-join"><label>Have a room code?<input name="code" maxlength="5" autocomplete="off" autocapitalize="characters" placeholder="ABCDE" value="${esc(landingCode)}"></label><button type="button" id="join-code" class="secondary" ${busy ? 'disabled' : ''}>Join</button></div>
    </form>
    ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
  </main>${rulesSheet()}`;
}

function lobby(): string {
  const me = room!.players.find(p => p.id === session?.playerId);
  const isHost = me?.host;
  const share = `${location.origin}?room=${room!.code}`;
  const botCount = room!.players.filter(player => player.bot).length;
  const humanCount = room!.players.length - botCount;
  return `<main class="lobby"><header>${leaveButton()}<span class="brand">${logo('mini-crest')}<span>Scarlet Seal</span></span>${rulesButton('Rules')}</header>
    <section class="room-code"><div><p class="eyebrow">PRIVATE TABLE</p><h2>${room!.code}</h2></div><button type="button" id="share" class="text-button">Share invite</button><input class="sr-only" value="${share}" aria-hidden="true"></section>
    <section class="players"><div class="seat-heading"><div><p class="eyebrow">PLAYERS &amp; BOTS</p><h3>At the table</h3></div><span>${room!.players.length} / ${MAX_PLAYERS} seats</span></div>${room!.players.map(p => `<div class="player-row"><span class="avatar">${p.bot ? '⚙' : esc(p.name[0].toUpperCase())}</span><strong>${esc(p.name)}</strong>${p.host ? '<small>HOST</small>' : ''}${p.bot ? '<small>BOT</small>' : ''}${isHost && p.bot ? `<button type="button" class="remove-bot" data-remove-bot="${p.id}" aria-label="Remove ${esc(p.name)}">×</button>` : `<span class="status ${p.connected ? '' : 'offline'}" role="img" title="${p.connected ? 'Connected' : 'Offline'}" aria-label="${p.connected ? 'Connected' : 'Offline'}"></span>`}</div>`).join('')}</section>
    ${isHost ? `<section class="seat-controls"><div><strong>Fill an empty seat</strong><small>${humanCount} ${humanCount === 1 ? 'person' : 'people'} · ${botCount} ${botCount === 1 ? 'bot' : 'bots'}</small></div><button type="button" id="add-bot" class="add-bot" ${room!.players.length >= MAX_PLAYERS || busy ? 'disabled' : ''}><span>＋</span>Add bot</button></section>` : ''}
    <div class="lobby-actions">${room!.canStart ? `<button type="button" id="start" class="primary" ${busy ? 'disabled' : ''}>Start ${room!.players.length}-player game</button>` : `<p>${isHost ? 'Invite someone or add a bot to fill the second seat.' : 'Waiting for the host to begin…'}</p>`}<small>Games support any mix of people and bots, up to six seats.</small></div>
    ${error ? `<p class="error">${esc(error)}</p>` : ''}</main>${rulesSheet()}${leaveSheet()}`;
}

function game(): string {
  const game = room!.game!;
  const me = game.players.find(p => p.id === session!.playerId)!;
  const ui = turnPresentation(game, me.id, selectedCard, selectedTarget);
  const { turn, nextPlayer, myTurn, choosingBottom, targets, guesses, playable, forcedCard } = ui;
  const instruction = esc(ui.title);
  const turnStep = ui.stepLabel;

  let action = '';
  if (ui.phase === 'case-review') action = `<div class="action-sheet confirm" aria-label="Return cards"><div class="action-step">CASE REVIEW</div><p>Return ${game.bottomChoiceCount} card${game.bottomChoiceCount === 1 ? '' : 's'} to the bottom</p><small class="action-effect">Tap cards to choose. The unselected card stays in your hand.</small><button type="button" id="confirm-bottom" class="primary" ${selectedBottom.length === game.bottomChoiceCount ? '' : 'disabled'}>Return selected cards</button></div>`;
  else if (ui.phase === 'choose-target' && selectedCard !== undefined) action = `<div class="action-sheet" aria-label="Choose a player"><div class="action-step">STEP 2 OF ${selectedCard === 1 ? '3' : '2'}</div><h3>Choose a player</h3><p class="action-help">${CARDS[selectedCard].text}</p>${intel(selectedCard)}${targets.map(id => { const p = game.players.find(x => x.id === id)!; return `<button type="button" data-target="${id}"><span class="target-avatar">${p.bot ? '⚙' : esc(p.name[0])}</span><span><b>${esc(p.name)}</b><small>${p.protected ? 'Protected' : 'Available'}</small></span><span>›</span></button>`; }).join('')}<button type="button" class="cancel">Choose a different card</button></div>`;
  else if (ui.phase === 'guess' && selectedCard !== undefined && selectedTarget) action = `<div class="action-sheet" aria-label="Choose a card guess"><div class="action-step">STEP 3 OF 3</div><h3>What card do they hold?</h3><p class="action-help">A correct guess eliminates ${esc(game.players.find(p => p.id === selectedTarget)?.name ?? 'them')}.</p><div class="guess-grid">${guesses.map(v => `<button type="button" data-guess="${v}"><b>${v}</b>${CARDS[v].name}</button>`).join('')}</div><button type="button" class="cancel">Choose a different card</button></div>`;
  else if (ui.phase === 'confirm' && selectedCard !== undefined) action = `<div class="action-sheet confirm" aria-label="Confirm card play"><div class="action-step">FINAL STEP</div><p>Play <b>${CARDS[selectedCard].name}</b>${selectedTarget ? ` on <b>${esc(game.players.find(p => p.id === selectedTarget)!.name)}</b>` : ''}?</p><small class="action-effect">${CARDS[selectedCard].text}</small>${intel(selectedCard)}<button type="button" id="confirm" class="primary">Confirm play</button><button type="button" class="cancel">Choose a different card</button></div>`;

  const winningIds = game.phase === 'match-over' ? game.matchWinnerIds : game.winnerIds;
  const winnerNames = winningIds.map(id => game.players.find(p => p.id === id)?.name).filter(Boolean).join(' & ');
  const lastActor = game.players.find(p => p.id === game.lastAction?.actorId);
  const lastTarget = game.players.find(p => p.id === game.lastAction?.targetId);
  const botAside = lastActor?.bot ? `<em>“${['Nothing personal.', 'I had a hunch.', 'Follow the evidence.', 'That story does not add up.', 'You cannot reach me here.', 'Let us try another angle.', 'Every detail matters.', 'New face, same case.', 'A useful distraction.', 'Case closed.'][game.lastAction!.card]}”</em>` : '';
  const actionStage = game.lastAction && lastActor ? `<section class="action-stage action-${game.lastAction.card} ${animateAction ? 'animate' : ''} ${resolvedAction ? 'result-updated' : ''}" aria-live="polite"><div class="stage-origin"><small>LAST CARD PLAYED</small><strong>${lastActor.id === me.id ? 'You' : esc(lastActor.name)}${lastTarget ? ` <span>→</span> ${lastTarget.id === me.id ? 'You' : esc(lastTarget.name)}` : ''}</strong></div><div class="featured-play">${art(game.lastAction.card, 'featured-art')}<strong>${game.lastAction.card}</strong><span><b>${CARDS[game.lastAction.card].name}</b><small>${CARD_FACE_TEXT[game.lastAction.card]}</small></span></div><p class="action-resolution">${esc(game.lastAction.resolution)}${botAside}</p></section>` : `<section class="action-stage waiting"><span class="empty-discard" aria-hidden="true">✦</span><p>Round ${game.round} is dealt.<br><small>${esc(turn?.name ?? 'The first player')} draws first.</small></p></section>`;
  const publicDiscards = `<section id="public-cards" class="discard-board" aria-label="All public cards"><div class="discard-heading"><p class="eyebrow">PUBLIC CARDS</p><small>${game.players.length > 3 ? 'Swipe for more →' : 'Use these to narrow the deck'}</small></div>${game.removedCount ? `<p class="hidden-cards-note">${game.removedCount} cards were set aside facedown. Their identities are private.</p>` : ''}<div class="discard-lanes">${game.players.map(player => `<article class="discard-lane ${game.lastAction?.targetId === player.id ? 'targeted' : ''}"><b>${player.id === me.id ? 'You' : esc(player.name)}</b><div>${player.discards.length ? player.discards.map((value, index) => `<span class="discard-chip art-${value} ${game.lastAction?.actorId === player.id && index === player.discards.length - 1 ? 'latest' : ''} ${index >= (newDiscardCounts.get(player.id) ?? Infinity) ? 'new-discard' : ''}" role="img" aria-label="${CARDS[value].name}, value ${value}"><i>${value}</i><small>${CARDS[value].name}</small></span>`).join('') : '<em>None yet</em>'}</div></article>`).join('')}</div></section>`;
  const decisivePlays = game.log.filter(line => !line.startsWith('Round ')).slice(-4);
  const roundReveals = game.roundSummary?.reveals.map(reveal => { const player = game.players.find(p => p.id === reveal.playerId); return `<li><span class="reveal-card art-${reveal.card}" aria-hidden="true"><b>${reveal.card}</b></span><span><b>${player?.id === me.id ? 'You' : esc(player?.name ?? 'Player')}</b><small>${CARDS[reveal.card].name} · value ${reveal.card}</small></span></li>`; }).join('') ?? '';
  const roundOverlay = game.phase !== 'playing' ? `<section class="result case-summary round-summary" aria-labelledby="result-title"><div class="seal-stamp" aria-hidden="true"><span>${game.phase === 'match-over' ? 'CASE' : 'ROUND'}</span><b>CLOSED</b></div><p class="eyebrow">${game.phase === 'match-over' ? 'CASE CLOSED' : `ROUND ${game.round} COMPLETE`}</p><h2 id="result-title">${esc(winnerNames || 'A rival')} ${winningIds.length > 1 ? 'win' : 'wins'}!</h2>${game.roundSummary ? `<section class="round-reason"><h3>Why the round ended</h3><p>${esc(game.roundSummary.reason)}</p>${roundReveals ? `<ul>${roundReveals}</ul>` : ''}</section>` : ''}<section><h3>Decisive plays</h3><ol>${decisivePlays.map(line => `<li>${esc(line)}</li>`).join('')}</ol></section>${game.phase === 'round-over' && room!.players.find(p => p.id === me.id)?.host ? '<button type="button" id="next-round" class="primary">Deal next round</button>' : game.phase === 'round-over' ? '<p>Waiting for the host…</p>' : '<p>The case has found its sharpest detective.</p><button type="button" id="finish-home" class="secondary">Return home</button>'}</section>` : '';
  const reaction = room!.reaction && visibleReactionSequence === room!.reaction.sequence ? room!.reaction : undefined;
  const reactionPlayer = reaction ? room!.players.find(player => player.id === reaction.playerId) : undefined;
  const aliveCount = game.players.filter(p => !p.eliminated).length;
  return `<main class="table"><header class="table-header"><span class="table-brand">${logo('mini-crest')}<b>Scarlet Seal</b><small>ROUND ${game.round}</small></span><nav aria-label="Game navigation">${leaveButton()}${rulesButton('Rules')}</nav><span class="deck-count">DRAW PILE <b>${game.deckCount}</b></span></header>
    ${roundOverlay}
    <section class="game-felt ${roundStarted ? 'round-enter' : ''}" aria-label="Game table"><section class="table-seats" aria-label="Players in turn order"><div class="table-section-heading"><span>INVESTIGATORS <b>${aliveCount} / ${game.players.length} IN</b></span><small>First to ${tokenTarget(game.players.length)} seals</small></div><div class="opponents">${game.players.map((p, index) => { const isMe = p.id === me.id; const targeted = game.lastAction?.targetId === p.id; const hasTurn = game.turnPlayerId === p.id && game.phase === 'playing'; return `<div data-player-id="${p.id}" class="opponent ${isMe ? 'your-seat' : ''} ${p.eliminated ? 'out' : 'alive'} ${targeted ? 'targeted' : ''} ${hasTurn ? 'current-turn' : ''} ${hasTurn && turnChanged ? 'turn-enter' : ''} ${newlyOut.has(p.id) ? 'just-out' : ''} ${newlyProtected.has(p.id) ? 'just-shielded' : ''}"><div class="seat-top"><span class="seat-order">${index + 1}</span><b>${isMe ? 'You' : esc(p.name)}</b><span class="seat-score ${earnedSeals.has(p.id) ? 'seal-earned' : ''}">${p.tokens} ◆</span></div><div class="seat-bottom"><span class="opponent-card ${p.handCount > 1 ? 'two-cards' : ''}" aria-label="${isMe ? 'Your hand is below' : `${p.handCount} hidden card${p.handCount === 1 ? '' : 's'}`}">${p.eliminated ? '✕' : isMe ? '↓' : '?'}</span><span class="seat-state"><strong>${p.eliminated ? 'OUT' : hasTurn ? (isMe ? 'YOUR TURN' : 'PLAYING') : 'IN'}</strong>${p.protected ? '<small>Shielded</small>' : isMe ? '<small>Your hand below</small>' : `<small>${p.handCount} card${p.handCount === 1 ? '' : 's'}</small>`}</span></div></div>`; }).join('')}</div></section><div class="board-center">${actionStage}</div>${publicDiscards}</section>
    ${game.phase === 'playing' ? `<section class="decision-zone"><section class="turn-banner ${myTurn ? 'active' : ''} ${turnChanged ? 'turn-enter' : ''}" aria-live="polite"><span class="turn-dot" aria-hidden="true"></span><div><small>${turnStep}</small><p>${instruction}</p></div><span class="turn-next">${nextPlayer ? `NEXT <b>${nextPlayer.id === me.id ? 'YOU' : esc(nextPlayer.name)}</b>` : ''}</span></section>${game.notice ? `<p class="turn-notice"><b>Private clue</b>${esc(game.notice)}</p>` : ''}<section class="play-area"><section class="hand"><div class="hand-heading"><p class="eyebrow">${game.hand.length > 1 ? 'YOUR TWO CARDS' : 'YOUR CARD'}</p><span>${choosingBottom ? `${selectedBottom.length} of ${game.bottomChoiceCount} selected` : myTurn ? 'Choose one to play' : 'Only you can see this'}</span></div><div class="cards ${choosingBottom ? 'review-cards' : ''}">${game.hand.map((v, index) => card(v, index, choosingBottom || (myTurn && playable.has(v)), forcedCard === v, choosingBottom, myTurn && !choosingBottom && !playable.has(v) ? (forcedCard !== undefined ? 'Red Herring must be played' : 'Unavailable now') : '')).join('')}</div></section>${action ? `<div id="turn-action">${action}</div>` : ''}</section></section>` : ''}
    <details class="reactions"><summary>React to the table <span aria-hidden="true">✦</span></summary><nav aria-label="Table reactions"><button type="button" data-reaction="Suspicious">Suspicious</button><button type="button" data-reaction="Nice try">Nice try</button><button type="button" data-reaction="Case closed">Case closed</button></nav></details><details class="case-feed" aria-label="Recent public plays"><summary>Case notes <span>${game.publicActions.length} plays</span></summary><ol>${game.publicActions.slice(-5).reverse().map(event => { const actor = game.players.find(p => p.id === event.actorId); const target = game.players.find(p => p.id === event.targetId); return `<li><span class="play-value">${event.card}</span><span><b>${actor?.id === me.id ? 'You' : esc(actor?.name ?? 'Player')} played ${CARDS[event.card].name}${target ? ` on ${target.id === me.id ? 'you' : esc(target.name)}` : ''}</b><small>${esc(event.resolution)}</small></span></li>`; }).join('')}</ol></details>
    ${reaction && reactionPlayer ? `<div class="reaction-pop" role="status"><b>${reactionPlayer.id === me.id ? 'You' : esc(reactionPlayer.name)}</b><span>${reaction.text}</span></div>` : ''}${error ? `<p class="error">${esc(error)}</p>` : ''}</main>${rulesSheet()}${leaveSheet()}`;
}

function animateGameState(origin: DOMRect | undefined, deck: DOMRect | undefined, fromIndex: number): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
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
  const origin = animateAction ? playOrigin : undefined;
  const deck = drawOrigin;
  const fromIndex = drawFromIndex;
  root.innerHTML = !room ? landing() : room.game ? game() : lobby();
  animateAction = false;
  playOrigin = undefined;
  drawOrigin = undefined;
  turnChanged = false;
  roundStarted = false;
  resolvedAction = false;
  newDiscardCounts = new Map();
  earnedSeals = new Set();
  newlyOut = new Set();
  newlyProtected = new Set();
  bind();
  if (origin || deck) {
    const screen = root.firstElementChild;
    requestAnimationFrame(() => { if (root.firstElementChild === screen) animateGameState(origin, deck, fromIndex); });
  }
  requestAnimationFrame(() => {
    const modal = document.querySelector<HTMLElement>('.confirm-dialog');
    if (!modal) return;
    const controls = [...modal.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')];
    if (!modal.contains(document.activeElement)) controls[0]?.focus();
    modal.addEventListener('keydown', event => {
      if (event.key !== 'Tab' || controls.length < 2) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  });
}

const revealTurnAction = () => requestAnimationFrame(() => document.querySelector('#turn-action')?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));

function bind(): void {
  document.querySelectorAll('[data-open-rules]').forEach(el => el.addEventListener('click', () => { rulesOpen = true; render(); requestAnimationFrame(() => document.querySelector<HTMLElement>('#close-rules')?.focus()); }));
  document.querySelector('#close-rules')?.addEventListener('click', () => { rulesOpen = false; render(); });
  document.querySelector('.rules-backdrop')?.addEventListener('click', e => { if (e.target === e.currentTarget) { rulesOpen = false; render(); } });
  const lanForm = document.querySelector<HTMLFormElement>('#lan-form');
  document.querySelector('#retry-seat')?.addEventListener('click', () => { error = ''; restoringSeat = true; render(); socket.connect(); });
  lanForm?.querySelector<HTMLInputElement>('input[name=name]')?.addEventListener('input', event => { landingName = (event.currentTarget as HTMLInputElement).value; });
  lanForm?.querySelector<HTMLInputElement>('input[name=code]')?.addEventListener('input', event => { landingCode = (event.currentTarget as HTMLInputElement).value.toUpperCase(); });
  const joinRoom = (code: string) => { if (!lanForm?.reportValidity()) return; const data = new FormData(lanForm); localStorage.setItem('scarlet-seal-name', String(data.get('name'))); emit(cb => socket.emit('room:join', { code, name: String(data.get('name')) }, cb)); };
  lanForm?.addEventListener('submit', e => { e.preventDefault(); const data = new FormData(e.currentTarget as HTMLFormElement); localStorage.setItem('scarlet-seal-name', String(data.get('name'))); emit(cb => socket.emit('room:create', String(data.get('name')), cb)); });
  document.querySelector('#quick-play')?.addEventListener('click', () => quickPlay('You'));
  document.querySelector('#join-code')?.addEventListener('click', () => { const code = lanForm?.querySelector<HTMLInputElement>('input[name=code]'); if (!code?.value.trim()) { code?.focus(); code?.setCustomValidity('Enter a room code.'); code?.reportValidity(); code?.setCustomValidity(''); return; } joinRoom(code.value); });
  document.querySelectorAll<HTMLElement>('[data-join-room]').forEach(el => el.addEventListener('click', () => joinRoom(el.dataset.joinRoom!)));
  document.querySelector('#add-bot')?.addEventListener('click', () => emit(cb => socket.emit('room:add-bot', cb)));
  document.querySelectorAll<HTMLElement>('[data-remove-bot]').forEach(el => el.addEventListener('click', () => emit(cb => socket.emit('room:remove-bot', el.dataset.removeBot!, cb))));
  document.querySelector('#start')?.addEventListener('click', () => emit(cb => socket.emit('game:start', cb)));
  document.querySelector('#next-round')?.addEventListener('click', () => emit(cb => socket.emit('game:next-round', cb)));
  document.querySelector('#finish-home')?.addEventListener('click', returnHome);
  document.querySelectorAll<HTMLElement>('[data-reaction]').forEach(el => el.addEventListener('click', () => emit(cb => socket.emit('room:react', el.dataset.reaction as 'Suspicious' | 'Nice try' | 'Case closed', cb))));
  document.querySelector('#share')?.addEventListener('click', async () => {
    const data = { title: 'Join my Scarlet Seal room', text: `Join room ${room!.code}`, url: `${location.origin}?room=${room!.code}` };
    try {
      if (navigator.share) await navigator.share(data);
      else { await navigator.clipboard.writeText(`${data.text}: ${data.url}`); const button = document.querySelector('#share')!; button.textContent = 'Invitation copied!'; }
    } catch (reason) { if (reason instanceof DOMException && reason.name === 'AbortError') return; error = 'Could not share this invitation. Copy the room code instead.'; render(); }
  });
  document.querySelectorAll('[data-leave-room]').forEach(el => el.addEventListener('click', () => { leaveOpen = true; render(); requestAnimationFrame(() => document.querySelector<HTMLElement>('#stay-room')?.focus()); }));
  document.querySelector('#stay-room')?.addEventListener('click', () => { leaveOpen = false; render(); });
  document.querySelector('#confirm-leave')?.addEventListener('click', returnHome);
  document.querySelectorAll<HTMLElement>('[data-card]').forEach(el => el.addEventListener('click', () => {
    const value = Number(el.dataset.card) as CardValue;
    const moves = room!.game!.legalMoves.filter(move => move.card === value);
    const direct = moves.find(move => !move.targetId && move.guess === undefined);
    if (direct && moves.length === 1 && [0, 4, 6, 8].includes(value)) { play(direct); return; }
    selectedCard = value; selectedTarget = undefined; render(); revealTurnAction();
  }));
  document.querySelectorAll<HTMLElement>('[data-bottom-index]').forEach(el => el.addEventListener('click', () => {
    const index = Number(el.dataset.bottomIndex);
    selectedBottom = selectedBottom.includes(index) ? selectedBottom.filter(value => value !== index) : selectedBottom.length < room!.game!.bottomChoiceCount ? [...selectedBottom, index] : selectedBottom;
    render();
  }));
  document.querySelectorAll<HTMLElement>('[data-target]').forEach(el => el.addEventListener('click', () => { selectedTarget = el.dataset.target; render(); revealTurnAction(); }));
  document.querySelectorAll<HTMLElement>('[data-guess]').forEach(el => el.addEventListener('click', () => play({ card: selectedCard!, targetId: selectedTarget, guess: Number(el.dataset.guess) as CardValue })));
  document.querySelector('#confirm')?.addEventListener('click', () => play({ card: selectedCard!, targetId: selectedTarget }));
  document.querySelector('#confirm-bottom')?.addEventListener('click', () => emit(cb => socket.emit('game:return-cards', selectedBottom.map(index => room!.game!.hand[index]), cb)));
  document.querySelectorAll('.cancel').forEach(el => el.addEventListener('click', () => { selectedCard = undefined; selectedTarget = undefined; render(); }));
}
function play(move: Move): void { emit(cb => socket.emit('game:play', move, cb)); }
function returnHome(): void { emit(cb => socket.emit('room:leave', result => { cb(result); if (result.ok) { localStorage.removeItem('scarlet-seal-session'); localStorage.removeItem('royal-post-session'); location.href = location.origin; } })); }

window.render_game_to_text = () => {
  const game = room?.game;
  const me = game?.players.find(player => player.id === session?.playerId);
  return JSON.stringify({
    coordinateSystem: 'DOM interface ordered top-to-bottom; no spatial playfield',
    screen: !room ? 'home' : !game ? 'lobby' : 'game', rulesOpen, roomCode: room?.code, availableRooms,
    phase: game?.phase, round: game?.round, deckCount: game?.deckCount,
    turnPlayerId: game?.turnPlayerId, playerId: me?.id, hand: game?.hand,
    selectedCard, selectedTarget, selectedBottom, legalMoves: game?.legalMoves, bottomChoiceCount: game?.bottomChoiceCount,
    removedCount: game?.removedCount, players: game?.players.map(player => ({ id: player.id, name: player.name, tokens: player.tokens, protected: player.protected, eliminated: player.eliminated, handCount: player.handCount, discards: player.discards })),
    lastAction: game?.lastAction, roundSummary: game?.roundSummary, recentLog: game?.log.slice(-3), notice: game?.notice
  });
};
window.advanceTime = () => {};
document.addEventListener('keydown', async e => {
  if (e.key === 'Escape' && rulesOpen) { rulesOpen = false; render(); return; }
  if (e.key === 'Escape' && leaveOpen) { leaveOpen = false; render(); return; }
  if (e.key === 'Escape' && (selectedCard !== undefined || selectedTarget !== undefined)) { selectedCard = undefined; selectedTarget = undefined; render(); return; }
  if (e.key.toLowerCase() === 'f' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
});

render();
