# Scarlet Seal

Scarlet Seal is an original detective-themed, mobile-first, installable deduction card game. The repository is a TypeScript monorepo-shaped app without workspace complexity: Vite serves the client, Express serves production assets, and Socket.IO carries lobby/game events.

Canonical source: `https://github.com/Strategamma/Scarlet-Seal`, branch `main`.
Canonical local repository: `/Users/farzan/Documents/Codex/Scarlet Seal/Scarlet-Seal`. Make all project edits and run all Git commands from this nested folder; the similarly named parent folder is not the GitHub repository.

## Architecture

- `src/shared/`: pure rules, protocol types, and card definitions. The server is authoritative; clients receive redacted views only.
- `src/server/`: authoritative in-memory room registry, PostgreSQL snapshots, Socket.IO handlers, reconnect support, and bot turns.
- `src/client/`: DOM UI and Socket.IO client. Offline solo uses the shared rules engine and browser storage. No canvas engine.
- `public/`: PWA manifest and static artwork.

Brand direction follows decadenceinc.com: dark grid, scarlet/coral, amber, and bold sans. The circular wax-seal logo is canonical. Hand cards prioritize HTML value, name, effect, and count over artwork. Avoid royal, courtly, or fantasy likenesses.

Rooms use short join codes over the deployed origin or a LAN URL. PostgreSQL snapshots recover rooms after a server restart; one web instance remains required for live coordination. Tables contain 2–6 seats in any human/bot mix, with at least one human.

## Rules and conventions

The 21-card deck uses values 0–9 and original detective names. Wiretap grants a bonus seal to its sole surviving user; Case Review privately draws up to two cards and returns the same number to the deck. Every table requires exactly three seals to win. Played, effect-discarded, and elimination-discarded cards are public; hands, all set-aside cards (including the three removed in two-player rounds), and Case Review returns stay private. Game logic must remain deterministic under an injected RNG.

Use Node 20+. Commands: `npm run dev`, `npm test`, `npm run build`, `npm start`. Production expects a reverse proxy with WebSocket upgrades and HTTPS. Set `PORT` as needed.

Production: `https://scarlet-seal.onrender.com/`, one Render Docker web service plus PostgreSQL in Singapore via `render.yaml`. Target custom domain: `scarletseal.decadenceinc.com`. Free PostgreSQL expires and lacks backups; a durable plan is needed for long-term recovery.

## Current state

Live playable game: one-tap solo, offline solo on a cached PWA, code-based rooms, configurable bots, authenticated seat resume, complete card actions, reactions, scoring, and rematches. The arcade display-name fragment is an editable hint used only when no game name is saved. Host loss pauses the table; unanimous consent from connected humans transfers control to the first eligible seat, while the former host retains their seat. A host may resolve a disconnected player's turn by forfeiting that player for the round. The table shows seats, turn, last play, public discards, hand, and a result with award reasons. First-round tips, optional sound, accessible dialogs, and reduced-motion support are present. Two-player set-aside cards stay private. Quality milestones live in `docs/GAMEPLAY_ROADMAP.md`.
