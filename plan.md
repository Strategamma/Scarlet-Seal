# Contained, readable game page
- Goal: keep every card, label, choice and replay control legible inside the game page.
- Scope: card faces, compact hand/review layout, player seats, action panels and round summaries.
- Approach: replace inherited portrait-era card geometry with isolated text-first components; consolidate the gameplay stylesheet; reserve space for each game region and use bounded in-game choice panels.
- Risks: six long player names, three-card review, nine guesses, short landscape, results and safe areas.
- Verification: tests/build; browser screenshots plus element/text bounds in normal turns, review, target/guess/confirm, elimination and results at narrow, standard and landscape sizes.
- Outcome: 60 tests and build pass. Twenty visual fixture cases (five states × four sizes) passed text/panel bounds and non-overlap checks. Review selection/submission, target/guess flow, risk confirmation/Back, focus containment and replay verified. Standalone runner lacks Chromium; in-app browser supplied screenshot evidence. Physical devices and deployment remain unverified.
