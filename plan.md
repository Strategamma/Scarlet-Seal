# Plan

- Goal: make the journey into, through, and out of a Scarlet Seal match clearer and more rewarding.
- Scope: entry choices, lobby seats and start state, quick rules, return recap, and match result presentation. Preserve game rules and networking.
- Approach: simplify entry into explicit solo/host/join paths, show table readiness, make rules scannable, explain the restored state, and emphasize the match winner and rematch.
- Risks: rendering replaces transient DOM; keep mode selection and return state explicit. Browser access is blocked by saved permission, so visual QA is limited.
- Verification: production build and 54 tests passed; diff and responsive CSS reviewed. Live phone and desktop visual QA remains blocked by saved browser permission.
