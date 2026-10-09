import { io, type Socket } from 'socket.io-client';
import { registerSW } from 'virtual:pwa-register';
import { CARDS, type CardValue, type Move } from '../shared/game';
import type { ClientToServerEvents, Result, RoomView, ServerToClientEvents, Session } from '../shared/protocol';
import './styles.css';

declare global { interface Window { render_game_to_text: () => string; advanceTime: (ms: number) => void } }

const root = document.querySelector<HTMLDivElement>('#app')!;
const saved = localStorage.getItem('scarlet-seal-session') ?? localStorage.getItem('royal-post-session');
let session: Session | undefined = saved ? JSON.parse(saved) : undefined;
let room: RoomView | undefined;
let selectedCard: CardValue | undefined;
let selectedTarget: string | undefined;
let rulesOpen = false;
let error = '';
let busy = false;
const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({ auth: session ?? {} });

registerSW({ immediate: true });
socket.on('session', value => { session = value; localStorage.setItem('scarlet-seal-session', JSON.stringify(value)); });
socket.on('room:state', value => { room = value; error = ''; selectedCard = undefined; selectedTarget = undefined; render(); });
socket.on('connect_error', () => { error = 'Unable to reach the game server.'; render(); });

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
const card = (value: CardValue, interactive = false, forced = false) => {
  const data = CARDS[value];
  return `<button type="button" aria-label="${data.name}, value ${value}. ${data.text}${interactive ? ' Select this card.' : ''}" class="card card-${value}${selectedCard === value ? ' selected' : ''}${interactive ? ' playable' : ''}" ${interactive ? `data-card="${value}"` : 'disabled'}>
    ${forced ? '<span class="card-badge">Must play</span>' : ''}<span class="card-value">${value}</span><span class="card-name">${data.name}</span><span class="card-text">${data.text}</span>
  </button>`;
};

function rulesSheet(): string {
  if (!rulesOpen) return '';
  const rows = (Object.values(CARDS)).map(data => `<li><span class="rule-card-value">${data.value}</span><span><b>${data.name}</b><small>${data.count} in deck</small><p>${data.text}</p></span></li>`).join('');
  return `<div class="rules-backdrop" data-close-rules><section class="rules-sheet" role="dialog" aria-modal="true" aria-labelledby="rules-title">
    <div class="sheet-handle" aria-hidden="true"></div><header><div><p class="eyebrow">QUICK GUIDE</p><h2 id="rules-title">How to play</h2></div><button type="button" id="close-rules" aria-label="Close rules">×</button></header>
    <div class="rules-body">
      <section class="rule-steps" aria-label="Turn steps"><article><b>1</b><span><strong>Draw</strong><small>Start your turn with two cards.</small></span></article><article><b>2</b><span><strong>Play one</strong><small>Tap a card, then follow its action.</small></span></article><article><b>3</b><span><strong>Survive</strong><small>Keep the higher card—or be the last player in.</small></span></article></section>
      <section class="rule-section"><h3>Winning</h3><p>A round ends when only one player remains or the deck runs out. If the deck ends, the highest card wins; tied players compare the total value of their discarded cards.</p><div class="token-goals"><span><b>2</b> players · <strong>7 ♥</strong></span><span><b>3</b> players · <strong>5 ♥</strong></span><span><b>4</b> players · <strong>4 ♥</strong></span></div></section>
      <section class="rule-section"><h3>Card reference <small>16 cards total</small></h3><ol class="card-reference">${rows}</ol></section>
      <section class="rule-section fine-print"><h3>Good to know</h3><ul><li>The Guard cannot guess another Guard.</li><li>The Prince may target any unprotected player, including you.</li><li>If you hold the Countess with a King or Prince, you must play the Countess.</li><li>The Handmaid protects you from other players until your next turn.</li><li>In a two-player round, three extra cards are revealed before dealing.</li></ul></section>
    </div>
  </section></div>`;
}

const rulesButton = (label = 'How to play') => `<button type="button" class="rules-button" data-open-rules><span>?</span>${label}</button>`;
const logo = (className: string) => `<img class="${className}" src="/icon-192.png" alt="" aria-hidden="true">`;

function landing(): string {
  return `<main class="landing">
    <div class="landing-tools">${rulesButton()}</div>
    <div class="crest">${logo('crest-logo')}</div><p class="eyebrow">A GAME OF ROYAL INTRIGUE</p><h1>Scarlet<br><i>Seal</i></h1>
    <p class="intro">Play with friends or challenge the court bots. Two to four seats, one quick game.</p>
    <form id="create-form" class="panel"><label>Your name<input name="name" maxlength="20" autocomplete="nickname" placeholder="Lady Violet" required></label><div class="home-actions"><button type="button" id="quick-play" class="primary" ${busy ? 'disabled' : ''}><span>Play now</span><small>Start with 1 bot</small></button><button class="secondary" ${busy ? 'disabled' : ''}>Create a room</button></div></form>
    <div class="or"><span>or join a friend</span></div>
    <form id="join-form" class="panel join"><label>Room code<input name="code" maxlength="5" autocomplete="off" autocapitalize="characters" placeholder="ABCDE" required></label><label>Your name<input name="name" maxlength="20" autocomplete="nickname" placeholder="Your name" required></label><button class="secondary" ${busy ? 'disabled' : ''}>Join room</button></form>
    ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
  </main>${rulesSheet()}`;
}

function lobby(): string {
  const me = room!.players.find(p => p.id === session?.playerId);
  const isHost = me?.host;
  const share = `${location.origin}?room=${room!.code}`;
  const botCount = room!.players.filter(player => player.bot).length;
  const humanCount = room!.players.length - botCount;
  return `<main class="lobby"><header><span class="brand">${logo('mini-crest')}<span>Scarlet Seal</span></span>${rulesButton('Rules')}</header>
    <section class="room-code"><p class="eyebrow">YOUR PRIVATE ROOM</p><h2>${room!.code}</h2><button id="share" class="text-button">Share invitation</button><input class="sr-only" value="${share}" aria-hidden="true"></section>
    <section class="players"><div class="seat-heading"><div><p class="eyebrow">PLAYERS &amp; BOTS</p><h3>At the table</h3></div><span>${room!.players.length} / 4 seats</span></div>${room!.players.map(p => `<div class="player-row"><span class="avatar">${p.bot ? '⚙' : esc(p.name[0].toUpperCase())}</span><strong>${esc(p.name)}</strong>${p.host ? '<small>HOST</small>' : ''}${p.bot ? '<small>BOT</small>' : ''}${isHost && p.bot ? `<button type="button" class="remove-bot" data-remove-bot="${p.id}" aria-label="Remove ${esc(p.name)}">×</button>` : `<i class="status ${p.connected ? '' : 'offline'}" aria-label="${p.connected ? 'Connected' : 'Offline'}"></i>`}</div>`).join('')}</section>
    ${isHost ? `<section class="seat-controls"><div><strong>Fill an empty seat</strong><small>${humanCount} ${humanCount === 1 ? 'person' : 'people'} · ${botCount} ${botCount === 1 ? 'bot' : 'bots'}</small></div><button type="button" id="add-bot" class="add-bot" ${room!.players.length >= 4 || busy ? 'disabled' : ''}><span>＋</span>Add bot</button></section>` : ''}
    <section class="turn-preview"><p class="eyebrow">EVERY TURN</p><div><span><b>1</b> Draw</span><i>→</i><span><b>2</b> Play one</span><i>→</i><span><b>3</b> Resolve</span></div></section>
    <div class="lobby-actions">${room!.canStart ? `<button id="start" class="primary" ${busy ? 'disabled' : ''}>Start ${room!.players.length}-player game</button>` : `<p>${isHost ? 'Invite someone or add a bot to fill the second seat.' : 'Waiting for the host to begin…'}</p>`}<small>Games support any mix of people and bots, up to four seats.</small></div>
    ${error ? `<p class="error">${esc(error)}</p>` : ''}</main>${rulesSheet()}`;
}

function game(): string {
  const game = room!.game!;
  const me = game.players.find(p => p.id === session!.playerId)!;
  const turn = game.players.find(p => p.id === game.turnPlayerId);
  const myTurn = game.turnPlayerId === me.id && game.phase === 'playing';
  const legal = game.legalMoves;
  const cardMoves = selectedCard ? legal.filter(m => m.card === selectedCard) : [];
  const targets = [...new Set(cardMoves.map(m => m.targetId).filter(Boolean))] as string[];
  const targetMoves = selectedTarget ? cardMoves.filter(m => m.targetId === selectedTarget) : cardMoves;
  const guesses = [...new Set(targetMoves.map(m => m.guess).filter(Boolean))] as CardValue[];
  const direct = cardMoves.find(m => !m.targetId && !m.guess);
  const playable = new Set(legal.map(m => m.card));
  const forcedCard = myTurn && playable.size === 1 && game.hand.length > 1 ? [...playable][0] : undefined;

  let instruction = `${esc(turn?.name ?? 'Another player')} is choosing a card`;
  if (myTurn && !selectedCard) instruction = forcedCard ? `Play your ${CARDS[forcedCard].name} — the other card cannot be played` : 'Choose one card to play';
  else if (myTurn && selectedCard && !selectedTarget && targets.length) instruction = `${CARDS[selectedCard].name}: choose a player`;
  else if (myTurn && selectedCard && selectedTarget && guesses.length) instruction = 'Guard: guess the card they hold';
  else if (myTurn && selectedCard) instruction = `Confirm your ${CARDS[selectedCard].name}`;

  let action = '';
  if (selectedCard && !direct && targets.length && !selectedTarget) action = `<div class="action-sheet"><div class="action-step">STEP 2 OF ${selectedCard === 1 ? '3' : '2'}</div><h3>Choose a player</h3><p class="action-help">${CARDS[selectedCard].text}</p>${targets.map(id => { const p = game.players.find(x => x.id === id)!; return `<button data-target="${id}"><span class="target-avatar">${p.bot ? '⚙' : esc(p.name[0])}</span><span><b>${esc(p.name)}</b><small>${p.protected ? 'Protected' : 'Available'}</small></span><span>›</span></button>`; }).join('')}<button class="cancel">Choose a different card</button></div>`;
  else if (selectedCard && selectedTarget && guesses.length) action = `<div class="action-sheet"><div class="action-step">STEP 3 OF 3</div><h3>What card do they hold?</h3><p class="action-help">A correct guess eliminates ${esc(game.players.find(p => p.id === selectedTarget)?.name ?? 'them')}.</p><div class="guess-grid">${guesses.map(v => `<button data-guess="${v}"><b>${v}</b>${CARDS[v].name}</button>`).join('')}</div><button class="cancel">Choose a different card</button></div>`;
  else if (selectedCard && (direct || selectedTarget)) action = `<div class="action-sheet confirm"><div class="action-step">FINAL STEP</div><p>Play <b>${CARDS[selectedCard].name}</b>${selectedTarget ? ` on <b>${esc(game.players.find(p => p.id === selectedTarget)!.name)}</b>` : ''}?</p><small class="action-effect">${CARDS[selectedCard].text}</small><button id="confirm" class="primary">Confirm play</button><button class="cancel">Choose a different card</button></div>`;

  const roundOverlay = game.phase !== 'playing' ? `<div class="overlay"><div class="result"><div class="crest">${logo('crest-logo')}</div><p class="eyebrow">${game.phase === 'match-over' ? 'MATCH COMPLETE' : `ROUND ${game.round} COMPLETE`}</p><h2>${esc(game.players.find(p => p.id === (game.matchWinnerId ?? game.winnerIds[0]))?.name ?? 'A rival')} wins!</h2>${game.phase === 'round-over' && room!.players.find(p => p.id === me.id)?.host ? '<button id="next-round" class="primary">Deal next round</button>' : game.phase === 'round-over' ? '<p>Waiting for the host…</p>' : '<p>The court has found its champion.</p>'}</div></div>` : '';
  return `<main class="table"><header><span>Round ${game.round}</span>${rulesButton('Rules')}<span class="deck-count">Deck <b>${game.deckCount}</b></span></header>
    <section class="opponents">${game.players.filter(p => p.id !== me.id).map(p => `<div class="opponent ${p.eliminated ? 'out' : ''}"><div class="avatar">${p.bot ? '⚙' : p.name[0]}</div><b>${esc(p.name)}</b><span>${'♥'.repeat(p.tokens)}${p.protected ? ' · Shielded' : ''}</span><small>${p.eliminated ? 'OUT' : `${p.handCount} card`}</small></div>`).join('')}</section>
    <section class="score-strip"><span>You</span><strong>${me.tokens} / ${game.players.length === 2 ? 7 : game.players.length === 3 ? 5 : 4} ♥</strong><span>to win</span></section>
    <section class="turn-banner ${myTurn ? 'active' : ''}"><span class="turn-dot" aria-hidden="true"></span><div><small>${game.phase === 'playing' ? (myTurn ? 'YOUR TURN' : 'PLEASE WAIT') : 'ROUND COMPLETE'}</small><p>${game.phase === 'playing' ? instruction : 'The round has ended'}</p></div>${game.notice ? `<strong>${esc(game.notice)}</strong>` : ''}</section>
    <section class="history">${game.log.slice(-3).map(line => `<p>${esc(line)}</p>`).join('')}</section>
    <section class="hand"><div class="hand-heading"><p class="eyebrow">YOUR HAND</p><span>${myTurn ? 'Tap a glowing card' : 'Hidden from rivals'}</span></div><div class="cards">${game.hand.map(v => card(v, myTurn && playable.has(v), forcedCard === v)).join('')}</div></section>
    ${error ? `<p class="error">${esc(error)}</p>` : ''}${action}${roundOverlay}</main>${rulesSheet()}`;
}

function render(): void {
  root.innerHTML = !room ? landing() : room.game ? game() : lobby();
  bind();
}

function bind(): void {
  document.querySelectorAll('[data-open-rules]').forEach(el => el.addEventListener('click', () => { rulesOpen = true; render(); requestAnimationFrame(() => document.querySelector<HTMLElement>('#close-rules')?.focus()); }));
  document.querySelector('#close-rules')?.addEventListener('click', () => { rulesOpen = false; render(); });
  document.querySelector('.rules-backdrop')?.addEventListener('click', e => { if (e.target === e.currentTarget) { rulesOpen = false; render(); } });
  document.querySelector<HTMLFormElement>('#create-form')?.addEventListener('submit', e => { e.preventDefault(); const data = new FormData(e.currentTarget as HTMLFormElement); emit(cb => socket.emit('room:create', String(data.get('name')), cb)); });
  document.querySelector('#quick-play')?.addEventListener('click', () => { const form = document.querySelector<HTMLFormElement>('#create-form')!; if (!form.reportValidity()) return; quickPlay(String(new FormData(form).get('name'))); });
  document.querySelector<HTMLFormElement>('#join-form')?.addEventListener('submit', e => { e.preventDefault(); const data = new FormData(e.currentTarget as HTMLFormElement); emit(cb => socket.emit('room:join', { code: String(data.get('code')), name: String(data.get('name')) }, cb)); });
  document.querySelector('#add-bot')?.addEventListener('click', () => emit(cb => socket.emit('room:add-bot', cb)));
  document.querySelectorAll<HTMLElement>('[data-remove-bot]').forEach(el => el.addEventListener('click', () => emit(cb => socket.emit('room:remove-bot', el.dataset.removeBot!, cb))));
  document.querySelector('#start')?.addEventListener('click', () => emit(cb => socket.emit('game:start', cb)));
  document.querySelector('#next-round')?.addEventListener('click', () => emit(cb => socket.emit('game:next-round', cb)));
  document.querySelector('#share')?.addEventListener('click', async () => { const data = { title: 'Join my Scarlet Seal room', text: `Join room ${room!.code}`, url: `${location.origin}?room=${room!.code}` }; if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(`${data.text}: ${data.url}`); const button = document.querySelector('#share')!; button.textContent = 'Invitation copied!'; } });
  document.querySelectorAll<HTMLElement>('[data-card]').forEach(el => el.addEventListener('click', () => { selectedCard = Number(el.dataset.card) as CardValue; selectedTarget = undefined; render(); }));
  document.querySelectorAll<HTMLElement>('[data-target]').forEach(el => el.addEventListener('click', () => { selectedTarget = el.dataset.target; render(); }));
  document.querySelectorAll<HTMLElement>('[data-guess]').forEach(el => el.addEventListener('click', () => play({ card: selectedCard!, targetId: selectedTarget, guess: Number(el.dataset.guess) as CardValue })));
  document.querySelector('#confirm')?.addEventListener('click', () => play({ card: selectedCard!, targetId: selectedTarget }));
  document.querySelectorAll('.cancel').forEach(el => el.addEventListener('click', () => { selectedCard = undefined; selectedTarget = undefined; render(); }));
}
function play(move: Move): void { emit(cb => socket.emit('game:play', move, cb)); }

window.render_game_to_text = () => {
  const game = room?.game;
  const me = game?.players.find(player => player.id === session?.playerId);
  return JSON.stringify({
    coordinateSystem: 'DOM interface ordered top-to-bottom; no spatial playfield',
    screen: !room ? 'home' : !game ? 'lobby' : 'game', rulesOpen, roomCode: room?.code,
    phase: game?.phase, round: game?.round, deckCount: game?.deckCount,
    turnPlayerId: game?.turnPlayerId, playerId: me?.id, hand: game?.hand,
    selectedCard, selectedTarget, legalMoves: game?.legalMoves,
    players: game?.players.map(player => ({ id: player.id, name: player.name, tokens: player.tokens, protected: player.protected, eliminated: player.eliminated, handCount: player.handCount })),
    recentLog: game?.log.slice(-3), notice: game?.notice
  });
};
window.advanceTime = () => {};
document.addEventListener('keydown', async e => {
  if (e.key === 'Escape' && rulesOpen) { rulesOpen = false; render(); return; }
  if (e.key.toLowerCase() === 'f' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
});

const inviteCode = new URLSearchParams(location.search).get('room');
render();
if (inviteCode) requestAnimationFrame(() => { const input = document.querySelector<HTMLInputElement>('#join-form input[name=code]'); if (input) input.value = inviteCode.toUpperCase(); });
