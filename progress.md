Original prompt: I want to build a mobile PWA game based on the board game love letter. It will be hosted on decadenceinc.com. It should allow users to join via the internet or on the same wifi network lobby. It should also have a playable bot.

## Progress

- Product name selected and applied across the UI, PWA metadata, package identity, sharing text, and documentation: **Scarlet Seal**.
- Generated and integrated the circular Scarlet Seal wax logo; added 512px, 192px, and Apple touch icons and aligned the UI/PWA palette to scarlet and warm beige.
- Logo asset inspection passed and the production PWA build includes all icon sizes. Browser screenshot QA was attempted again but Chromium remains blocked by the host macOS sandbox before page load.
- Added a Render Blueprint for a single Singapore Docker web service with WebSocket support, `/health`, CI-gated auto-deploys, and `scarletseal.decadenceinc.com`.
- Verified `https://scarlet-seal.onrender.com/`: homepage and `/health` return 200, and a real WebSocket room completed a human-vs-bot round. Prepared arcade commit `55cbb02` with the live card; push is blocked only by missing local GitHub CLI credentials.
- Architecture selected: Vite DOM client + authoritative Express/Socket.IO server + pure TypeScript rules engine.
- Implemented lobby/session server, full card rules, bot turns, mobile UI, PWA manifest, and initial rules tests.
- Rules tests pass (6/6). First typecheck found narrow event/return typing issues; corrected before browser QA.
- Production build passes. Live Socket.IO smoke test created a room, added a bot, started a game, played a legal move, accepted a bot turn, and reached round-over.
- Started UI/rules usability pass: preserve the authoritative game engine and derive all prompts from server-supplied legal moves.
- Added global mobile rulebook, full card reference/counts, scoring and edge-case rules, lobby turn preview, score target, contextual turn prompts, forced-card labeling, clearer playable-card affordances, and staged target/guess/confirm sheets.
- Updated `render_game_to_text` to expose concise interactive state. Rules tests and production build pass; live room/bot playthrough reached round-over.
- Required Playwright runner attempted again but macOS sandbox blocked Chromium before page load (`MachPortRendezvousServer: Permission denied`), so no screenshots could be produced or inspected in this environment.
- Added one-tap solo-vs-bot startup, configurable add/remove bot lobby controls, unique bot names, and support for up to three bots alongside one human (four total seats). Added narrow-phone and short-screen layout rules.
- Verification: 9/9 automated tests pass; production PWA build passes; a 1-human/3-bot live round observed all three bots and reached round-over; four independent human clients joined one room and started successfully. Playwright remains blocked before page load by the host macOS sandbox.

## TODO

- Configure the production host/reverse proxy and DNS outside this repository.
- Complete screenshot-based mobile QA on a host where Chromium processes are permitted.
