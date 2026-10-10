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
- Re-themed the full card set as an original detective case: Wiretap, Hunch, Lead, Alibi, Safehouse, Interrogation, Case Review, Disguise, Red Herring, and Scarlet Evidence.
- Expanded play to 2–6 seats with the 21-card distribution, six-player evidence targets, Wiretap bonus, private Case Review return flow, simultaneous winners, and five unique detective bots. The UI/rulebook and five-opponent mobile layout now reflect the expanded game.
- Verification: 13/13 tests pass, including a complete six-bot round and both new card mechanics; production PWA build passes; a live 1-human/5-bot Socket.IO round reached round-over and awarded Wiretap bonus evidence correctly.
- Added a vibrant original 10-subject detective portrait atlas and redesigned every card with character art, prominent value/ability, and bottom-right deck copy count. The rule reference reuses the same portraits.
- Opponents now retain a visible last-played mini card, targets highlight, the action feed names targets, and card-play/status animations respect reduced-motion. Added responsive Home navigation plus an accessible leave confirmation; leaving an active game forfeits cleanly instead of stalling the turn.
- Verification: 15/15 tests and production build pass; the portrait atlas is PWA-precached; a live 1-human/5-bot round completed with target-rich last-action state. Required Playwright and the app browser were both attempted, but macOS browser process policy blocked page launch, so screenshot inspection remains the only outstanding QA item.
- Bug audit expanded coverage to every card's resolution timing, protection expiry, deck-empty order, zero-value handling, the third-seal match transition, and six-bot completion. All 22 tests and the production build pass.
- All table sizes now win at exactly three seals. Replaced last-card-only opponent displays with a labeled, horizontally scrollable public-card rail containing every player's full discard history plus the two-player face-up removed cards. Two simultaneous clients receive identical public piles while opponent hands remain redacted.
- Required Playwright QA was retried after these changes; Chromium is still blocked before page load by the host macOS Mach port policy.
- Reworked the landing page around fast starts: bot play now launches in one tap as “You” with no name prompt, multiplayer has one persisted name field, and waiting LAN rooms appear as tappable tables with seat/bot counts plus a manual-code fallback.
- Added safe server-side room summaries and a lightweight three-second home refresh; started/full rooms are omitted and join still revalidates capacity and state authoritatively.
- Verification: 24/24 tests pass, production build passes, and a two-client Socket.IO smoke test created, discovered, joined, and refreshed a LAN table. The required Playwright client was run after installing Chromium into writable temporary storage, but macOS still blocked Chromium at launch (`MachPortRendezvousServer: Permission denied`). The built-in browser was also unavailable because local-page access was declined, so screenshot inspection remains outstanding.
- Added a persistent actor → full card → target action stage with ability text and public resolution outcome. Every seat now clearly shows TAKING TURN, ALIVE, or OUT; the turn banner names the active player.
- Added ten distinct card animations: signal pulse, hunch snap, lead slide, alibi balance, safehouse lock, interrogation slam, case-review fan, disguise flip, red-herring swerve, and evidence reveal. Reduced-motion disables all nonessential motion.
- Replaced the portrait set with `detective-card-atlas-v2.png`, an original diverse urban-mystery ensemble with no royal/court likenesses. Generated through the built-in image tool and visually inspected after project optimization.
- Verification: 23/23 tests and production build pass; a live six-seat action exposed actor/card/target/resolution and public discard while all alive states remained accurate. Playwright was retried but remains blocked by the macOS Mach port policy.
- Rebuilt the lobby and active-table hierarchy from user screenshots: compact room identity and seats, removed the redundant turn tutorial, moved the turn prompt and hand ahead of secondary information, reduced normal hand height, converted the last action into a compact receipt, and placed public cards/history in an accessible “Case notes” disclosure.
- Preserved three-card Case Review sizing and all ten per-card last-play animations, including reduced-motion behavior. Added `UIUXVisions.md` with the durable one-primary-action and progressive-disclosure direction.
- Verification: 24/24 tests and production build pass. The required Playwright runner was attempted after the UI change but macOS again blocked Chromium at process launch, so no new automated screenshots were available in this environment.
- Added faster low-risk turns: Wiretap, Safehouse, Case Review, and Red Herring resolve on tap when they have exactly one legal move; destructive Scarlet Evidence and every targeted action still require confirmation.
- Cards now state target requirements and what becomes public, forced cards explain why alternatives are locked, and every last-play receipt explicitly preserves actor, card, target, and outcome. Detective bots add short card-specific remarks between turns.
- Added bounded table reactions (Suspicious, Nice try, Case closed), a saved-seat reconnect surface, automatic host transfer to a connected human, and a round/match overlay with an animated seal stamp plus decisive public log entries.
- Verification: 26/26 tests and production build pass. A two-client Socket.IO smoke test verified reaction delivery, host transfer, and authenticated seat resume end to end.
- Completed a full control/layout audit across home, reconnect, lobby, game, rules, card choice sheets, Case notes, leave confirmation, reactions, and round/match overlays. Added explicit button types, modal semantics and focus containment, retry/share error states, and a match-over Return home action.
- Added 44px mobile touch targets, readable microcopy floors, focus styling for disclosures, compact short-landscape rules, and a real two-column desktop table while preserving the mobile-first order. Connection dots now expose both visible hover titles and accessible labels; card restrictions are included in accessible names.
- Verification: all 26 tests, production build, diff validation, and a static handler inventory pass. A real Socket.IO sweep exercised create/list, add/remove bot, react, start, play, round completion, next round, and leave. Required Playwright screenshot capture remains blocked at Chromium launch by the host macOS Mach-port policy.

## TODO

- Configure the production host/reverse proxy and DNS outside this repository.
- Complete screenshot-based mobile QA on a host where Chromium processes are permitted.
