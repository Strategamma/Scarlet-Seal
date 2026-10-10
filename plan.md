# Plan

- Goal: make movement explain each play, turn change, and reward.
- Scope: draw, play, discard, turn handoff, choices, and seal awards in the existing UI; preserve rules and accessibility.
- Approach: derive animation triggers from authoritative state changes, move the played card from its source seat or hand to the discard stage, and use short entrance animations for related feedback.
- Risks: rapid bot updates, repeated room renders, and reduced-motion preferences; browser access was denied in this environment.
- Verification: TypeScript/build, tests, source inspection of state transitions, and live motion QA when browser access is available.
