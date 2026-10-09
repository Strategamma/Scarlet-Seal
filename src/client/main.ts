import { io, type Socket } from 'socket.io-client';
import { registerSW } from 'virtual:pwa-register';
import { CARDS, MAX_PLAYERS, tokenTarget, type CardValue, type Move } from '../shared/game';
import type { AvailableRoom, ClientToServerEvents, Result, RoomView, ServerToClientEvents, Session } from '../shared/protocol';
import './styles.css';

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
let lastAnimatedAction = 0;
let animateAction = false;
let availableRooms: AvailableRoom[] = [];
let landingName = localStorage.getItem('scarlet-seal-name') ?? '';
let landingCode = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '';
const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({ auth: session ?? {} });

registerSW({ immediate: true });
socket.on('session', value => { session = value; localStorage.setItem('scarlet-seal-session', JSON.stringify(value)); });
socket.on('room:state', value => {
  const sequence = value.game?.lastAction?.sequence ?? 0;
  animateAction = sequence > 0 && sequence !== lastAnimatedAction;
  if (sequence) lastAnimatedAction = sequence;
  room = value; error = ''; selectedCard = undefined; selectedTarget = undefined; selectedBottom = []; render();
});
socket.on('connect_error', () => { error = 'Unable to reach the game server.'; render(); });
const refreshRooms = () => socket.emit('rooms:list', result => {
  if (!result.ok || room) return;
  if (JSON.stringify(availableRooms) === JSON.stringify(result.value)) return;
  availableRooms = result.value;
  render();
});
socket.on('connect', refreshRooms);
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
const art = (value: CardValue, className = 'card-art') => `<span class="${className} art-${value}" aria-hidden="true"></span>`;
const card = (value: CardValue, index: number, interactive = false, forced = false, bottomChoice = false) => {
  const data = CARDS[value];
  const selected = bottomChoice ? selectedBottom.includes(index) : selectedCard === value;
  const dataAttr = bottomChoice ? `data-bottom-index="${index}"` : `data-card="${value}"`;
  return `<button type="button" aria-label="${data.name}, value ${value}. ${data.text}${interactive ? ' Select this card.' : ''}" class="card card-${value}${selected ? ' selected' : ''}${interactive ? ' playable' : ''}" ${interactive ? dataAttr : 'disabled'}>
    ${art(value)}${forced ? '<span class="card-badge">Must play</span>' : ''}<span class="card-value">${value}</span><span class="card-copy"><span class="card-name">${data.name}</span><span class="card-text">${data.text}</span></span><span class="card-count" title="${data.count} in the deck" aria-label="${data.count} copies in deck">×${data.count}</span>
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
      <section class="rule-section fine-print"><h3>Good to know</h3><ul><li>A Hunch can name any card except another Hunch.</li><li>Interrogation may target any unprotected player, including you.</li><li>If you hold Red Herring with Disguise or Interrogation, you must play Red Herring.</li><li>Safehouse protects you from other players until your next turn.</li><li>Case Review lets you secretly keep one of up to three cards.</li><li>A sole surviving Wiretap user earns one bonus evidence.</li><li>In a two-player round, three extra cards are revealed before dealing.</li></ul></section>
    </div>
  </section></div>`;
}

const rulesButton = (label = 'How to play') => `<button type="button" class="rules-button" data-open-rules><span>?</span>${label}</button>`;
const leaveButton = () => `<button type="button" class="nav-button" data-leave-room aria-label="Leave this room and return home"><span aria-hidden="true">‹</span>Home</button>`;
const leaveSheet = () => leaveOpen ? `<div class="dialog-backdrop"><section class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="leave-title"><p class="eyebrow">LEAVE ROOM</p><h2 id="leave-title">Return home?</h2><p>${room?.game ? 'Your seat will remain in this match as disconnected.' : 'You will leave this lobby.'}</p><div><button type="button" id="stay-room" class="secondary">Stay here</button><button type="button" id="confirm-leave" class="primary">Leave room</button></div></section></div>` : '';
const logo = (className: string) => `<img class="${className}" src="/icon-192.png" alt="" aria-hidden="true">`;

function landing(): string {
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
    <section class="room-code"><p class="eyebrow">YOUR PRIVATE ROOM</p><h2>${room!.code}</h2><button id="share" class="text-button">Share invitation</button><input class="sr-only" value="${share}" aria-hidden="true"></section>
    <section class="players"><div class="seat-heading"><div><p class="eyebrow">PLAYERS &amp; BOTS</p><h3>At the table</h3></div><span>${room!.players.length} / ${MAX_PLAYERS} seats</span></div>${room!.players.map(p => `<div class="player-row"><span class="avatar">${p.bot ? '⚙' : esc(p.name[0].toUpperCase())}</span><strong>${esc(p.name)}</strong>${p.host ? '<small>HOST</small>' : ''}${p.bot ? '<small>BOT</small>' : ''}${isHost && p.bot ? `<button type="button" class="remove-bot" data-remove-bot="${p.id}" aria-label="Remove ${esc(p.name)}">×</button>` : `<i class="status ${p.connected ? '' : 'offline'}" aria-label="${p.connected ? 'Connected' : 'Offline'}"></i>`}</div>`).join('')}</section>
    ${isHost ? `<section class="seat-controls"><div><strong>Fill an empty seat</strong><small>${humanCount} ${humanCount === 1 ? 'person' : 'people'} · ${botCount} ${botCount === 1 ? 'bot' : 'bots'}</small></div><button type="button" id="add-bot" class="add-bot" ${room!.players.length >= MAX_PLAYERS || busy ? 'disabled' : ''}><span>＋</span>Add bot</button></section>` : ''}
    <section class="turn-preview"><p class="eyebrow">EVERY TURN</p><div><span><b>1</b> Draw</span><i>→</i><span><b>2</b> Play one</span><i>→</i><span><b>3</b> Resolve</span></div></section>
    <div class="lobby-actions">${room!.canStart ? `<button id="start" class="primary" ${busy ? 'disabled' : ''}>Start ${room!.players.length}-player game</button>` : `<p>${isHost ? 'Invite someone or add a bot to fill the second seat.' : 'Waiting for the host to begin…'}</p>`}<small>Games support any mix of people and bots, up to six seats.</small></div>
    ${error ? `<p class="error">${esc(error)}</p>` : ''}</main>${rulesSheet()}${leaveSheet()}`;
}

function game(): string {
  const game = room!.game!;
  const me = game.players.find(p => p.id === session!.playerId)!;
  const turn = game.players.find(p => p.id === game.turnPlayerId);
  const myTurn = game.turnPlayerId === me.id && game.phase === 'playing';
  const choosingBottom = myTurn && game.bottomChoiceCount > 0;
  const legal = game.legalMoves;
  const cardMoves = selectedCard ? legal.filter(m => m.card === selectedCard) : [];
  const targets = [...new Set(cardMoves.map(m => m.targetId).filter(Boolean))] as string[];
  const targetMoves = selectedTarget ? cardMoves.filter(m => m.targetId === selectedTarget) : cardMoves;
  const guesses = [...new Set(targetMoves.map(m => m.guess).filter((value): value is CardValue => value !== undefined))];
  const direct = cardMoves.find(m => !m.targetId && !m.guess);
  const playable = new Set(legal.map(m => m.card));
  const forcedCard = myTurn && playable.size === 1 && game.hand.length > 1 ? [...playable][0] : undefined;

  let instruction = `${esc(turn?.name ?? 'Another player')} is choosing a card`;
  if (choosingBottom) instruction = `Choose ${game.bottomChoiceCount} card${game.bottomChoiceCount === 1 ? '' : 's'} to return`;
  else if (myTurn && !selectedCard) instruction = forcedCard ? `Play your ${CARDS[forcedCard].name} — the other card cannot be played` : 'Choose one card to play';
  else if (myTurn && selectedCard && !selectedTarget && targets.length) instruction = `${CARDS[selectedCard].name}: choose a player`;
  else if (myTurn && selectedCard && selectedTarget && guesses.length) instruction = 'Hunch: name the card they hold';
  else if (myTurn && selectedCard) instruction = `Confirm your ${CARDS[selectedCard].name}`;

  let action = '';
  if (choosingBottom) action = `<div class="action-sheet confirm"><div class="action-step">CASE REVIEW</div><p>Return ${game.bottomChoiceCount} card${game.bottomChoiceCount === 1 ? '' : 's'} to the bottom</p><small class="action-effect">Tap cards to choose. The unselected card stays in your hand.</small><button id="confirm-bottom" class="primary" ${selectedBottom.length === game.bottomChoiceCount ? '' : 'disabled'}>Return selected cards</button></div>`;
  else if (selectedCard && !direct && targets.length && !selectedTarget) action = `<div class="action-sheet"><div class="action-step">STEP 2 OF ${selectedCard === 1 ? '3' : '2'}</div><h3>Choose a player</h3><p class="action-help">${CARDS[selectedCard].text}</p>${targets.map(id => { const p = game.players.find(x => x.id === id)!; return `<button data-target="${id}"><span class="target-avatar">${p.bot ? '⚙' : esc(p.name[0])}</span><span><b>${esc(p.name)}</b><small>${p.protected ? 'Protected' : 'Available'}</small></span><span>›</span></button>`; }).join('')}<button class="cancel">Choose a different card</button></div>`;
  else if (selectedCard && selectedTarget && guesses.length) action = `<div class="action-sheet"><div class="action-step">STEP 3 OF 3</div><h3>What card do they hold?</h3><p class="action-help">A correct guess eliminates ${esc(game.players.find(p => p.id === selectedTarget)?.name ?? 'them')}.</p><div class="guess-grid">${guesses.map(v => `<button data-guess="${v}"><b>${v}</b>${CARDS[v].name}</button>`).join('')}</div><button class="cancel">Choose a different card</button></div>`;
  else if (selectedCard && (direct || selectedTarget)) action = `<div class="action-sheet confirm"><div class="action-step">FINAL STEP</div><p>Play <b>${CARDS[selectedCard].name}</b>${selectedTarget ? ` on <b>${esc(game.players.find(p => p.id === selectedTarget)!.name)}</b>` : ''}?</p><small class="action-effect">${CARDS[selectedCard].text}</small><button id="confirm" class="primary">Confirm play</button><button class="cancel">Choose a different card</button></div>`;

  const winningIds = game.phase === 'match-over' ? game.matchWinnerIds : game.winnerIds;
  const winnerNames = winningIds.map(id => game.players.find(p => p.id === id)?.name).filter(Boolean).join(' & ');
  const lastActor = game.players.find(p => p.id === game.lastAction?.actorId);
  const lastTarget = game.players.find(p => p.id === game.lastAction?.targetId);
  const actionStage = game.lastAction && lastActor ? `<section class="action-stage action-${game.lastAction.card} ${animateAction ? 'animate' : ''}" aria-live="polite"><div class="action-person actor"><span class="target-avatar">${lastActor.bot ? '⚙' : esc(lastActor.name[0])}</span><small>PLAYED BY</small><b>${lastActor.id === me.id ? 'You' : esc(lastActor.name)}</b></div><div class="featured-play">${art(game.lastAction.card, 'featured-art')}<strong>${game.lastAction.card}</strong><span><b>${CARDS[game.lastAction.card].name}</b><small>${CARDS[game.lastAction.card].text}</small></span></div><div class="action-arrow" aria-hidden="true">${lastTarget ? '➜' : '✦'}</div><div class="action-person target"><span class="target-avatar">${lastTarget ? (lastTarget.bot ? '⚙' : esc(lastTarget.name[0])) : '◎'}</span><small>${lastTarget ? 'TARGETED' : 'AFFECTED'}</small><b>${lastTarget ? (lastTarget.id === me.id ? 'You' : esc(lastTarget.name)) : 'The case'}</b></div><p class="action-resolution">${esc(game.lastAction.resolution)}</p></section>` : `<section class="action-stage waiting"><p>No cards played yet</p></section>`;
  const publicDiscards = `<section class="discard-board" aria-label="All public cards"><div class="discard-heading"><p class="eyebrow">PUBLIC CARDS</p><small>Use these to narrow the deck</small></div><div class="discard-lanes">${game.faceUpRemoved.length ? `<article class="discard-lane removed"><b>Set aside</b><div>${game.faceUpRemoved.map(value => `<span class="discard-chip art-${value}" title="${CARDS[value].name}, value ${value}"><i>${value}</i><small>${CARDS[value].name}</small></span>`).join('')}</div></article>` : ''}${game.players.map(player => `<article class="discard-lane ${game.lastAction?.targetId === player.id ? 'targeted' : ''}"><b>${player.id === me.id ? 'You' : esc(player.name)}</b><div>${player.discards.length ? player.discards.map((value, index) => `<span class="discard-chip art-${value} ${game.lastAction?.actorId === player.id && index === player.discards.length - 1 ? 'latest' : ''}" title="${CARDS[value].name}, value ${value}"><i>${value}</i><small>${CARDS[value].name}</small></span>`).join('') : '<em>None yet</em>'}</div></article>`).join('')}</div></section>`;
  const roundOverlay = game.phase !== 'playing' ? `<div class="overlay"><div class="result"><div class="crest">${logo('crest-logo')}</div><p class="eyebrow">${game.phase === 'match-over' ? 'CASE CLOSED' : `ROUND ${game.round} COMPLETE`}</p><h2>${esc(winnerNames || 'A rival')} ${winningIds.length > 1 ? 'win' : 'wins'}!</h2>${game.phase === 'round-over' && room!.players.find(p => p.id === me.id)?.host ? '<button id="next-round" class="primary">Deal next round</button>' : game.phase === 'round-over' ? '<p>Waiting for the host…</p>' : '<p>The case has found its sharpest detective.</p>'}</div></div>` : '';
  return `<main class="table"><header><span>Round ${game.round}</span><nav aria-label="Game navigation">${leaveButton()}${rulesButton('Rules')}</nav><span class="deck-count">Deck <b>${game.deckCount}</b></span></header>
    <section class="opponents">${game.players.filter(p => p.id !== me.id).map(p => { const targeted = game.lastAction?.targetId === p.id; const hasTurn = game.turnPlayerId === p.id && game.phase === 'playing'; return `<div class="opponent ${p.eliminated ? 'out' : 'alive'} ${targeted ? 'targeted' : ''} ${hasTurn ? 'current-turn' : ''}"><div class="avatar">${p.bot ? '⚙' : esc(p.name[0])}</div><b>${esc(p.name)}</b><span>${'◆'.repeat(p.tokens)}${p.protected ? ' · Shielded' : ''}</span><small class="life-state">${p.eliminated ? 'OUT' : hasTurn ? 'TAKING TURN' : 'ALIVE'}</small><small>${p.eliminated ? 'No hand' : `${p.handCount} card`}</small></div>`; }).join('')}</section>
    ${actionStage}<section class="score-strip"><span>You</span><strong>${me.tokens} / ${tokenTarget(game.players.length)} seals</strong><span>to win</span></section>
    <section class="turn-banner ${myTurn ? 'active' : ''}"><span class="turn-dot" aria-hidden="true"></span><div><small>${game.phase === 'playing' ? (myTurn ? 'YOUR TURN' : `${esc(turn?.name ?? 'Opponent')}'S TURN`) : 'ROUND COMPLETE'}</small><p>${game.phase === 'playing' ? instruction : 'The round has ended'}</p></div>${game.notice ? `<strong>${esc(game.notice)}</strong>` : ''}</section>
    ${publicDiscards}<section class="history" aria-label="Action history"><ol>${game.log.slice(-3).map(line => `<li>${esc(line)}</li>`).join('')}</ol></section>
    <section class="hand"><div class="hand-heading"><p class="eyebrow">YOUR HAND</p><span>${choosingBottom ? `${selectedBottom.length} of ${game.bottomChoiceCount} selected` : myTurn ? 'Tap a glowing card' : 'Hidden from rivals'}</span></div><div class="cards ${choosingBottom ? 'review-cards' : ''}">${game.hand.map((v, index) => card(v, index, choosingBottom || (myTurn && playable.has(v)), forcedCard === v, choosingBottom)).join('')}</div></section>
    ${error ? `<p class="error">${esc(error)}</p>` : ''}${action}${roundOverlay}</main>${rulesSheet()}${leaveSheet()}`;
}

function render(): void {
  root.innerHTML = !room ? landing() : room.game ? game() : lobby();
  animateAction = false;
  bind();
}

function bind(): void {
  document.querySelectorAll('[data-open-rules]').forEach(el => el.addEventListener('click', () => { rulesOpen = true; render(); requestAnimationFrame(() => document.querySelector<HTMLElement>('#close-rules')?.focus()); }));
  document.querySelector('#close-rules')?.addEventListener('click', () => { rulesOpen = false; render(); });
  document.querySelector('.rules-backdrop')?.addEventListener('click', e => { if (e.target === e.currentTarget) { rulesOpen = false; render(); } });
  const lanForm = document.querySelector<HTMLFormElement>('#lan-form');
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
  document.querySelector('#share')?.addEventListener('click', async () => { const data = { title: 'Join my Scarlet Seal room', text: `Join room ${room!.code}`, url: `${location.origin}?room=${room!.code}` }; if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(`${data.text}: ${data.url}`); const button = document.querySelector('#share')!; button.textContent = 'Invitation copied!'; } });
  document.querySelectorAll('[data-leave-room]').forEach(el => el.addEventListener('click', () => { leaveOpen = true; render(); requestAnimationFrame(() => document.querySelector<HTMLElement>('#stay-room')?.focus()); }));
  document.querySelector('#stay-room')?.addEventListener('click', () => { leaveOpen = false; render(); });
  document.querySelector('#confirm-leave')?.addEventListener('click', () => emit(cb => socket.emit('room:leave', result => { cb(result); if (result.ok) { localStorage.removeItem('scarlet-seal-session'); localStorage.removeItem('royal-post-session'); location.href = location.origin; } })));
  document.querySelectorAll<HTMLElement>('[data-card]').forEach(el => el.addEventListener('click', () => { selectedCard = Number(el.dataset.card) as CardValue; selectedTarget = undefined; render(); }));
  document.querySelectorAll<HTMLElement>('[data-bottom-index]').forEach(el => el.addEventListener('click', () => {
    const index = Number(el.dataset.bottomIndex);
    selectedBottom = selectedBottom.includes(index) ? selectedBottom.filter(value => value !== index) : selectedBottom.length < room!.game!.bottomChoiceCount ? [...selectedBottom, index] : selectedBottom;
    render();
  }));
  document.querySelectorAll<HTMLElement>('[data-target]').forEach(el => el.addEventListener('click', () => { selectedTarget = el.dataset.target; render(); }));
  document.querySelectorAll<HTMLElement>('[data-guess]').forEach(el => el.addEventListener('click', () => play({ card: selectedCard!, targetId: selectedTarget, guess: Number(el.dataset.guess) as CardValue })));
  document.querySelector('#confirm')?.addEventListener('click', () => play({ card: selectedCard!, targetId: selectedTarget }));
  document.querySelector('#confirm-bottom')?.addEventListener('click', () => emit(cb => socket.emit('game:return-cards', selectedBottom.map(index => room!.game!.hand[index]), cb)));
  document.querySelectorAll('.cancel').forEach(el => el.addEventListener('click', () => { selectedCard = undefined; selectedTarget = undefined; render(); }));
}
function play(move: Move): void { emit(cb => socket.emit('game:play', move, cb)); }

window.render_game_to_text = () => {
  const game = room?.game;
  const me = game?.players.find(player => player.id === session?.playerId);
  return JSON.stringify({
    coordinateSystem: 'DOM interface ordered top-to-bottom; no spatial playfield',
    screen: !room ? 'home' : !game ? 'lobby' : 'game', rulesOpen, roomCode: room?.code, availableRooms,
    phase: game?.phase, round: game?.round, deckCount: game?.deckCount,
    turnPlayerId: game?.turnPlayerId, playerId: me?.id, hand: game?.hand,
    selectedCard, selectedTarget, selectedBottom, legalMoves: game?.legalMoves, bottomChoiceCount: game?.bottomChoiceCount,
    faceUpRemoved: game?.faceUpRemoved, players: game?.players.map(player => ({ id: player.id, name: player.name, tokens: player.tokens, protected: player.protected, eliminated: player.eliminated, handCount: player.handCount, discards: player.discards })),
    lastAction: game?.lastAction, recentLog: game?.log.slice(-3), notice: game?.notice
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
