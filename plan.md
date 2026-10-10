# Plan

- Goal: audit every interactive surface and make its placement, accessibility, and responsive behavior coherent from 320px phones through desktop.
- Scope: home, reconnect, lobby, game, action sheets, rules, leave confirmation, round/match summaries, reactions, disclosures, tooltips, and error states.
- Approach: close control-state gaps first, add semantic dialog/button behavior, use a two-column desktop table without changing mobile order, and verify every server-backed action through targeted flows.
- Risks: focus loss after DOM rerenders, inaccessible modal states, desktop grid collisions, short-screen overflow, and mobile-only title tooltips.
- Verification: static control inventory, 320/375/520/900px layout reasoning, full tests/build, multi-client socket flows, keyboard/dialog audit, and required Playwright attempt.
