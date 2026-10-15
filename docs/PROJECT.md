# Scarlet Seal

Phone-first detective deduction PWA. Canonical source: `https://github.com/Strategamma/Scarlet-Seal`, branch `main`.

**Canonical local repository: `/Users/farzan/Documents/Codex/Scarlet Seal/Scarlet-Seal`. Run all edits/builds/Git commands there. The outer directory is a container; its duplicate game source/package/build were deleted. Never recreate them.**

## Architecture

TypeScript, Vite, Express, Socket.IO, optional PostgreSQL; Node 20+. `src/shared/` owns deterministic rules (injectable RNG), cards and protocol. Server owns authoritative state and redacted views. `src/server/` coordinates rooms, queued PostgreSQL snapshots, reconnects and bots. `src/client/` renders accessible DOM cards; `local-solo.ts` runs the shared rules offline with browser saves. `public/` contains wax-seal icons and legacy artwork. Keep one web instance for live coordination. PostgreSQL recovers rooms after restarts; without `DATABASE_URL`, rooms on all hosts (including Render) are memory-only and lost on restarts/redeploys.

Commands: `npm run dev`, `npm test`, `npm run build`, `npm start`. Production requires HTTPS/WebSockets; `PORT` selects server port.

## Identity and rules

Arcade identity: dark grid, scarlet/coral, amber, bold sans, warm-paper cards and wax seal. Preserve HTML values/effects/counts. Avoid fantasy/courtly imagery. `readable-table.css` owns viewport gameplay overrides. Isolated `readable-face`/`hand-card` components use value/name/effect; avoid legacy positioned spans. Review uses full-width rows; results use text rows. Card feedback stays within its panel. Bots wait 3.2s online/offline. Public actions carry optional eliminatedIds for persistent loss attribution, including Alibi. Play fits the viewport; choices/notes open in-game.

21 cards, values 0–9, one private reserve. Two-player rounds use the remaining deck for longer play. Exactly three seals win. Wiretap bonuses and private Case Review keep existing rules. Hands, reserve and returned cards stay private; played/discarded cards are public. Rules modules must remain deterministic and unchanged by UI work.

## Player experience and networking

Home lists joinable same-server tables every 3s; one-tap join and small create control. No cross-server LAN scan. One-tap host uses a saved/suggested nickname; names remain editable. Valid invitations autojoin after saved-seat restoration settles. Saved names override arcade hints; hints never authenticate. Local/internet tabs explain requirements; they do not discover devices or switch servers. Everyone needs the same origin. Offline LAN requires an installed, running host server and reachable LAN address/port; shared Wi-Fi may be isolated.

Lobby humans explicitly ready before starting; host/bots start ready. Existing absent-seat bot replacement remains. Finished groups can rematch immediately or reopen a lobby with readiness reset. Host loss **pauses** play; unanimous connected-human consent transfers hosting deterministically. Returning former hosts keep their seat without reclaiming control. Hosts can forfeit disconnected turns for a round.  Restored socket owns its seat.

Retain offline solo, reactions, first-round tips, card inspections and rich results. Preferences store sound, quiet motion and optional haptics. Sound uses gesture-unlocked synthesis. System reduced motion always applies; finale can be skipped. Modals isolate focus/input; render preserves form focus/caret and choices.

Scarlet Night counts completed matches once server-side; wins/seals persist across rematches/reopen and optional snapshots. Latest recap is saved/downloadable on each device. Local sharing distinguishes public game from LAN rooms.

Production: `https://scarlet-seal.onrender.com/`, Render web service in Singapore. Blueprint provisions no SQL database; persistence can be enabled later with `DATABASE_URL`. Local integration is not deployed; see `docs/EXPERIENCE_VERIFICATION.md` for evidence and limits.
