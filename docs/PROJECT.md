# Scarlet Seal

Scarlet Seal is an original detective-themed, mobile-first, installable deduction card game. The repository is a TypeScript monorepo-shaped app without workspace complexity: Vite serves the client, Express serves production assets, and Socket.IO carries lobby/game events.

Canonical source: `https://github.com/Strategamma/Scarlet-Seal`, branch `main`.
Canonical local repository: `/Users/farzan/Documents/Codex/Scarlet Seal/Scarlet-Seal`. Make all project edits and run all Git commands from this nested folder; the similarly named parent folder is not the GitHub repository.

## Architecture

- `src/shared/`: pure rules, protocol types, and card definitions. The server is authoritative; clients receive redacted views only.
- `src/server/`: in-memory room registry, Socket.IO handlers, reconnect support, and bot turns.
- `src/client/`: DOM UI and Socket.IO client. No canvas engine; text-heavy card UI stays accessible and responsive.
- `public/`: PWA manifest and static artwork.

Brand direction follows decadenceinc.com: dark grid, scarlet/coral, amber, and bold sans. The circular wax-seal logo is canonical. Hand cards prioritize HTML value, name, effect, and count over artwork. Avoid royal, courtly, or fantasy likenesses.

Rooms use short join codes and work identically over the deployed internet origin or a server's LAN URL. State is memory-only, so rooms disappear on restart. Tables contain 2–6 seats in any human/bot mix, with at least one human; one human may quick-start against a bot or add up to five bots.

## Rules and conventions

The 21-card deck uses values 0–9 and original detective names. Wiretap grants a bonus seal to its sole surviving user; Case Review privately draws up to two cards and returns the same number to the deck. Every table requires exactly three seals to win. Played, effect-discarded, and elimination-discarded cards are public; hands, all set-aside cards (including the three removed in two-player rounds), and Case Review returns stay private. Game logic must remain deterministic under an injected RNG.

Use Node 20+. Commands: `npm run dev`, `npm test`, `npm run build`, `npm start`. Production expects a reverse proxy with WebSocket upgrades and HTTPS. Set `PORT` as needed.

Production: `https://scarlet-seal.onrender.com/`, one Render Docker web service in Singapore configured by `render.yaml`. Target custom domain: `scarletseal.decadenceinc.com`. Keep one instance while rooms are in memory; add shared room state before horizontal scaling.

## Current state

Live playable vertical slice: one-tap solo, discoverable LAN tables, code-based rooms, configurable bots, authenticated seat resume, automatic host transfer, complete card actions, reactions, round/match scoring, mobile PWA shell, and production server. A host can rematch in the same room after match-over; only connected humans return, and a lone host gets a bot. The responsive table shows seats, current/next turn, last play, public discards, and a separate hand. Pure client selectors derive turn phases, first-round tips, and state-change cues; public action history feeds Case notes. Round results list authoritative seal award sources and totals. Choices and results are in-page; back moves one step, and exit requires confirmation. Two-player set-aside cards stay private. State-triggered draw, play, turn, discard, and seal motion respects reduced motion. Quality milestones live in `docs/GAMEPLAY_ROADMAP.md`.
