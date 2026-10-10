# Plan

- Goal: make hidden information truly private, keep cards selectable, clarify the latest play, and explain every round-ending result.
- Scope: authoritative game views, card/discard UI, last-play receipt, round summary, rules copy, tests, and durable project notes.
- Approach: stop sending set-aside identities to clients, remove hover overlays from cards, strengthen the compact play receipt, and add an authoritative round-end explanation with surviving-card reveals.
- Risks: leaking hidden values through debug output, stale round summaries carrying into a new round, and tied winners needing an accurate explanation.
- Verification: targeted engine assertions, full tests/build, diff checks, responsive source review, socket flow, and required Playwright attempt.
