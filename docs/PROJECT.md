# Scarlet Seal

Scarlet Seal is a mobile-first, installable turn-based card game inspired by the classic 16-card Love Letter rules. The repository is a TypeScript monorepo-shaped app without workspace complexity: Vite serves the client, Express serves production assets, and Socket.IO carries lobby/game events.

Canonical source: `https://github.com/Strategamma/Scarlet-Seal`, branch `main`.

## Architecture

- `src/shared/`: pure rules, protocol types, and card definitions. The server is authoritative; clients receive redacted views only.
- `src/server/`: in-memory room registry, Socket.IO handlers, reconnect support, and bot turns.
- `src/client/`: DOM UI and Socket.IO client. No canvas engine; text-heavy card UI stays accessible and responsive.
- `public/`: PWA manifest and static artwork.

Brand palette: scarlet `#A51D35`, warm beige `#F3E6D0`, oxblood shadows, and restrained antique gold. The circular wax-seal logo is the canonical app mark.

Rooms use short join codes and work identically over the deployed internet origin or a server's LAN URL. State is currently memory-only, so rooms disappear on server restart. Tables contain 2–4 total seats in any human/bot mix, with at least one human; one human may quick-start against a bot or add up to three bots.

## Rules and conventions

Classic 1–8 deck distribution (5 Guards, 2 Priests, 2 Barons, 2 Handmaids, 2 Princes, 1 King, 1 Countess, 1 Princess). First to the player-count token target wins: 2 players = 7, 3 = 5, 4 = 4. Game logic must remain deterministic under an injected RNG and must not leak hidden cards in public state.

Use Node 20+. Commands: `npm run dev`, `npm test`, `npm run build`, `npm start`. Production expects a reverse proxy with WebSocket upgrades and HTTPS. Set `PORT` as needed.

Production target: one Render Docker web service in Singapore, configured by `render.yaml`, with `scarletseal.decadenceinc.com` as the custom domain. Keep one instance while rooms are in memory; add shared room state before horizontal scaling.

## Current state

Playable vertical slice: quick solo start, create/join lobbies, configurable bots, reconnect identity, complete card actions, round/match scoring, mobile PWA shell, and production server. UI guidance must be derived from server-supplied legal moves. A reusable bottom-sheet rulebook is available from home, lobby, and gameplay; keep rule details out of the core playfield except for the current action prompt.
