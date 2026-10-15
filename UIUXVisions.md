# UI/UX Vision

Scarlet Seal belongs to Decadence Inc.: dark grid, coral/scarlet, amber, bold sans, playful motion. Artwork is optional; the value, name, and effect must read at a glance.

- One primary action per phase: choose card, choose player, name card, confirm, resolve, round result. Current and next player remain visible.
- First-round help sits inside the turn prompt, never covers controls, and disappears after completion or dismissal.
- Results use viewer-relative winner names, seal progress, final card comparisons, and a compact replay action. Optional timeline rows stay collapsed and aligned. Targets, guesses, and reactions use large labeled touch controls instead of stacked explanations.
- Back moves one step through a decision; leaving a room requires confirmation. Rules stay available during play.
- Board shows seats, alive/out state, seal scores, draw pile, last card with actor/target/result, and public discards. Recent public plays are in Case notes.
- Icons support short text labels. An unfamiliar symbol never carries a rule alone.
- Hand cards read value → name → effect → target/choice and deck copies. Symbols are small supporting cues; selected, locked, and Case Review return states stay visible without shrinking the rule text.
- Private Case Review asks for the single card to keep. Show KEEP on it and RETURN on the others before confirmation, including when card values repeat.
- Card confirmations preview the specific consequence using only the player's own hand and public information. Hunch shows its public named card in the central receipt; Lead's revealed card stays private. No-target actions explain why they did nothing, and self-elimination requires an explicit danger label.
- Safe card plays resolve on the final choice, with no redundant confirm. A personal turn uses one brief gold cue and an optional synthesized chime after user interaction. Clues, last plays, and Case notes use distinct information tiles with readable rows.
- Rules open with the three-step guide and keep card reference and special cases expandable. Dialogs trap focus and return it to the opener. Public discard cards are large touch targets that reveal value, name, and full effect in place. Lobby presence is visible text, not a hover-only dot.
- Entry offers immediate solo play, explicit host and code-join paths, and nearby tables. Lobby seats show occupancy and readiness. A restored seat summarizes the current turn and last public play; final standings follow the rematch action.
- Animate actual state changes once: draw, play, discard, handoff, elimination, protection, and seal. Respect reduced motion.
- Mobile at 320–520px must avoid overlap and keep two hand cards legible; desktop separates shared board and personal choices. Non-card controls need 44px touch targets.
- Newcomer testing is the quality gate: observe people starting, taking turns, reading outcomes, using back/leave, and explaining how they won without help.

## Canonical experience integration
Keep dark-grid arcade styling, teaching, reactions and result reveals. Cards use value, name and effect without portraits. Player circles use distinct colors and initials; full names remain visible. Primary gameplay fits the viewport; secondary history and choices use in-game panels. Keep elimination attribution visible through the round. Extend through `experience.css`. Host uses optional saved/suggested identity; invites autojoin only after restoration settles. Connection tabs explain requirements rather than pretending to select transports. Ready/start lead the lobby; links lead sharing. Keep consent-based host transfer and persistent seats, not automatic timeout eviction. Preserve offline solo and existing sound settings; add master mute, quiet motion and optional haptics. Prefer SVG control symbols and readable status text. Confirm the nested Git root before any future edits.

Use isolated text-card geometry: rank/name followed by effect and one tap cue. Do not inherit portrait-era positioned spans or move cards between screen regions. Private three-card review uses full-width rows with Keep/Return labels; results use readable player/card rows with replay first. Test text bounds and panel overlaps, including long names and landscape; scrollbar checks alone are insufficient.
The choice region uses `play-choice` and review cards use `review-options`; the legacy `turn-action`/`review-cards` selectors contain ID-specific and last-child geometry that must not apply to the new components.
