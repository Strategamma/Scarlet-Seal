# Canonical player-experience integration
- Goal: apply the reviewed improvements to this GitHub checkout, preserving its newer game features.
- Scope: one-tap host/invitation entry, truthful local/internet guidance, accessible preferences/feedback, lobby readiness, sharing, rematch/lobby reopening and session guards.
- Approach: integrate into existing DOM/Socket.IO code; retain PostgreSQL snapshots, offline solo, current card rules, reactions and consent-based host migration. Keep shared modules only where compatible.
- Risks: saved-session/autojoin races, persistence backward compatibility, socket ownership, form focus, motion and offline resume.
- Verification: canonical tests/build; dedicated canonical server port; separate-browser complete matches/rematches, invitation errors, host consent/reconnect, offline solo, responsive layouts; record physical-device and live-deployment limits.
- Outcome: canonical integration complete. 58 tests, production build, whitespace check, separate-client full matches/rematches/reopening, consent/reconnect, cached offline solo and targeted keyboard/responsive checks pass. Outer duplicate removed. No push/deployment or physical-device/live-SQL test performed.
