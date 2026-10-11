# Plan

- Goal: make hand cards readable and satisfying on narrow touch screens and desktop.
- Scope: card hierarchy, selected/review/locked states, choice focus, and duplicate-submit feedback.
- Approach: keep the existing DOM and rules; give value, name, effect, and action distinct areas; preserve full rule text for assistive tech; make decision transitions focus the next control.
- Risks: long card names and effects at 320px, forced-play badges, reduced-motion behavior, and unavailable browser visual QA.
- Verification: tests, build, diff check, source review of card states and responsive CSS.
