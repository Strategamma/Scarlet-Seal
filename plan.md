# Plan

- Goal: make finished matches easy to replay and reduce touch-screen UI clutter.
- Scope: same-room rematch, match result actions, turn decision panels, reactions, and first-round guidance.
- Approach: restart a fresh authoritative game with connected seats; keep one prominent action at a time, fold optional details, and use large labeled icon controls.
- Risks: disconnected seats during rematch, stale bot timers, narrow-screen targets, and unverified visual layout without browser access.
- Verification: service and rules tests for rematch authorization/reset, production build, diff check, and responsive playtest when browser access is available.
