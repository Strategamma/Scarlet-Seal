# Plan

- Goal: get solo and LAN players into games from the home screen with fewer decisions and taps.
- Scope: one-tap bot play, one shared multiplayer name, and a list of joinable waiting rooms with code fallback.
- Approach: expose safe lobby summaries through the existing Socket.IO service, render them as join actions, and keep identity only in the multiplayer section.
- Risks: stale room listings, accidentally exposing private game state, full/started rooms changing before join, and cramped mobile layout.
- Verification: room-list service tests, full tests/build, and Playwright checks for solo, room creation, visible-room join, code join, responsive layout, and console errors.
