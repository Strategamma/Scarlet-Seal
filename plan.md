# Plan

- Goal: bug-audit card timing and make the complete public game state usable at six seats.
- Scope: every card ability, universal three-seal match target, six-seat lobby/table layout, and complete played/discarded-card visibility.
- Approach: add focused timing tests, remove duplicate UI actions, expose compact labeled discard lanes for every player, and keep hands/private Case Review choices hidden.
- Risks: resolving an effect after round-end checks, losing zero-value cards in truthy checks, and crowding the phone table with six discard histories.
- Verification: per-card timing tests, room-capacity tests, build/typecheck, live six-seat network round, and required browser QA attempt.
