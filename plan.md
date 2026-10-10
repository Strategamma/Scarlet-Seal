# Plan

- Goal: make the lobby and active game immediately readable on phones without removing useful deduction information.
- Scope: lobby density, active-turn hierarchy, hand sizing, last-action presentation, and progressive disclosure for public cards/history.
- Approach: keep one primary decision surface, compress status into edge strips, move reference information into a native disclosure, and reduce oversized decorative panels.
- Risks: hiding information needed for deduction, cramped two-card hands, inaccessible collapsed content, and short-screen overflow.
- Verification: tests/build, room and solo network flows, narrow/short layout review, disclosure and card-selection interactions, text-state parity, and Playwright attempt.
