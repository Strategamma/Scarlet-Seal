# Canonical experience integration — 14 October 2026

Repository: `/Users/farzan/Documents/Codex/Scarlet Seal/Scarlet-Seal`, GitHub `Strategamma/Scarlet-Seal`. The outer duplicate project and obsolete servers were removed. The separate outer `arcade-deploy` directory was retained because it is a checkout of `Strategamma/Arcade`.

## Integrated changes

One-tap hosting with optional saved/suggested names; direct invitation entry after session restoration; truthful internet/local guidance; visible sharing-link/code fallback; explicit guest readiness; readiness/start above the lobby; saved preferences; gesture-unlocked tap/play/turn/victory sound and master mute; optional haptics/quiet motion; skippable finale and immediate rematch; lobby reopening; collection navigation; stale-socket and duplicate create/join guards; acknowledgement-timeout recovery; form focus/caret preservation. Fixed the empty-directory connection enablement and 320px gameplay header during browser QA.

Preserved canonical features: PostgreSQL room snapshots and queued writes, offline solo/browser saves, consent-based host migration, disconnected-turn handling, reactions, first-round teaching, card inspection, complete card rules and hidden information, richer result reveals, current brand and active illustrated atlas. Readiness is optional in persisted JSON for older snapshots. No database schema/dependency migration was introduced.

The earlier parent-copy performance numbers and 30-second eviction policy do not apply here. The canonical atlas is actively used and remains precached.

## Verification evidence

- 58 canonical automated tests pass, including shared rules/redaction, offline restore, host consent, persistence restart through a snapshot test store, readiness/reset and latest-socket ownership.
- TypeScript/production PWA build and Git whitespace check pass.
- Browser scripts and screenshots live under ignored `output/experience/`; they name this exact repository and use the dedicated canonical server at `http://localhost:3100`.
- Separate-client flow coverage: host, invitation copy/direct join, readiness gate, start, legal card actions/targets/guesses, private keep-card review, complete matches, immediate rematch, lobby reopening, invalid invitation, host consent transfer/rejoin, offline cached solo restore. Final run status is in `output/experience/results.json`.
- Phone 320×640 and 390×844; landscape 844×390; tablet 768×1024; desktop 1440×900. Lobby/game overflow assertions and screenshots. Targeted entry/preferences verification is in `entry-results.json`.
- Interruptions are simulated: the app receives an offline signal before network blocking, then an online signal/reconnection. This verifies app/socket recovery and consent; it does not measure detection delay for a silent physical Wi-Fi loss.

## Limits

No new deployment, actual multi-device Wi-Fi, current upgraded internet match, actual PostgreSQL database restart, iOS/Safari, native share sheet, physical keyboard/safe-area/haptics hardware, screen-reader session, or listening/mix-quality test was performed. PostgreSQL behavior is regression-tested through the existing snapshot-store boundary; live SQL verification remains required before release. Existing service-worker offline caching is exercised; native PWA installation remains unverified. Rare rules have automated coverage; not every rare visual outcome was forced. Timing/CPU claims from the removed copy are not reused.

Before release, deploy this checkout and run internet matches/rematches plus physical-device local/offline-hosting checks. PostgreSQL must use a durable plan/backups if long-term availability is promised.

## Table browser and Scarlet Night — 2026-10-15
- 59 tests passed; build passed. New server test verifies once-only match accounting, optional snapshot restoration, rematch totals and lobby reopening.
- Separate Chrome contexts automatically discover one server’s table, tap Join once, complete two synchronized matches, retain totals across rematch, save device recap and trigger text download; host migration/reconnect and invalid invitations exercised.
- Table browser screenshots at 320×568, 390×844, 844×390, 768×1024 and 1440×900; overflow, reduced motion and public-link clipboard checks pass. Narrow-table card layout corrected and retested. No page errors.
- Local icon copies public game URL on a separate server; local lobby invitation still uses actual LAN origin. No cross-server discovery or relay implemented.
- No physical-device LAN, deployed internet, native share-sheet, or real PostgreSQL validation. Memory-only rooms/totals reset on server restart; latest device recap is exportable. Evidence: ignored `output/experience/night-playtest.mjs`, `table-browser-check.mjs`, `table-browser-*.png`, `results-phone.png`.
