# Plan

- Goal: support a mobile-first 2–4 seat game with one to four humans and bots filling available seats.
- Scope: one-tap solo-vs-bot, multiple configurable bots, mixed human/bot lobbies, and narrow-phone layouts.
- Approach: extend the existing room protocol with bot removal, remove the one-bot restriction, keep the four-seat cap, and expose clear seat controls to the host.
- Risks: bot-to-bot turn scheduling, lobby races during quick start, and cramped 320px layouts.
- Verification: unit rules, production build, live 1-human/3-bot and mixed-room protocol playthroughs, plus browser screenshots when host policy permits.
