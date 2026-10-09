# Plan

- Goal: make every game surface vivid, legible, animated, and navigable on mobile.
- Scope: illustrated cards, deck-copy counts, opponent played cards, attributed action history, action motion, dialogs/tooltips, and page navigation.
- Approach: use one optimized portrait atlas, add public last-action state, enrich card markup/history, and add responsive menu/exit controls without changing core rules.
- Risks: hiding card text at small sizes, animation noise, sprite alignment, modal focus, and six-seat vertical crowding.
- Verification: rules/room tests, production build, live six-seat play, and Playwright screenshots/text/error review at phone and desktop sizes.
