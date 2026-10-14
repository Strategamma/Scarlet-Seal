# Scarlet Seal

A mobile-first PWA of deception and deduction. One person can play immediately against a bot, or 2–6 total seats can contain any mix of people and bots.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. For same-Wi‑Fi play, other devices open `http://YOUR-LAN-IP:5173`; the terminal running Vite prints the network address. Everyone then joins with the same five-character room code.

Use **Play now** for an immediate one-person game against a bot. In a hosted room, the host can add or remove bots until the table has 2–6 occupied seats.

If the game server is unavailable, **Play against a bot** starts a private offline case using the same rules. Its state stays in this browser and resumes after reopening an already cached or installed PWA. Multiplayer still requires the server. An arcade launch may prefill the editable multiplayer name from `#arcadeName=...`; a previously saved game name takes priority, and the hint is removed from the URL.

## Production

```bash
npm run build
PORT=3000 npm start
```

Point `decadenceinc.com` (or a game subdomain) to the host and reverse-proxy HTTPS traffic to port 3000. The proxy must support WebSocket upgrades for `/socket.io/`. HTTPS is required for reliable PWA installation. `GET /health` is available for health checks.

Set `DATABASE_URL` to a PostgreSQL connection string to preserve active rooms across server restarts. The server loads saved rooms before accepting connections; returning players reclaim their seats with their saved session tokens. Without `DATABASE_URL`, all hosting—including Render—keeps rooms in memory only; restarts and redeploys clear rooms and active matches. Keep one web instance: room coordination still happens in that instance.

### Render

The repository includes `render.yaml` for one Docker web service in Render's Singapore region. No SQL database is required. Rooms live in memory and reset on server restarts or redeploys. Optional PostgreSQL persistence can be enabled later by setting `DATABASE_URL`. The service uses `/health` for health checks and declares `scarletseal.decadenceinc.com` as its custom domain.

After the GitHub repository is pushed:

1. In Render, create a new Blueprint from `Strategamma/Scarlet-Seal`.
2. Approve the `scarlet-seal` web service.
3. In the DNS provider for `decadenceinc.com`, add the CNAME value shown by Render for `scarletseal`.
4. Wait for Render to verify the domain and issue TLS.

Players on any internet connection—including devices sharing Wi-Fi—can use the Render URL. For internet-free same-Wi-Fi play, run the app locally and have devices open the host computer's LAN address.

When a host disconnects, the room pauses. Connected people can agree to let the first connected player in seat order become host, or wait for the original host to return. The former host keeps their seat and does not take control back after a transfer. A web-service restart also pauses saved rooms until players reconnect.
If the current turn belongs to a disconnected person, the host may wait or forfeit that person's current round so play can continue.

## Checks

```bash
npm test
npm run build
```

## Quick entry and preferences

**Host a table** opens in one tap with a saved or suggested nickname; choosing another name is optional. Invitation links join directly once saved-seat restoration settles. Existing seats are preserved until you deliberately leave. Manual code entry supports Enter. Guests mark **I'm ready** before the host starts; bots/hosts start ready. Finished groups can rematch immediately, skip to final results, or **Invite more friends** to reopen the same lobby and reset readiness.

The **Over the internet** and **Same network** tabs explain connection requirements; they do not switch servers or discover nearby devices. A local server must be installed/running, and friends must open its reachable LAN IP/port. Never send another device a localhost link. Shared or guest Wi-Fi can block access. Internet play requires a publicly reachable game server. PostgreSQL restart recovery is optional; consent-based host transfer works while the server is running; there is no automatic 30-second eviction.

Preferences control sound, quiet motion and optional supported haptics. System reduced motion always applies. Help/preferences isolate input but do not pause multiplayer. The illustrated card atlas remains cached because this canonical version uses it, including offline solo.

All edits/builds/Git commands belong in this nested `Scarlet-Seal` repository. The outer duplicate source/package/build were removed. See [canonical verification](docs/EXPERIENCE_VERIFICATION.md).

### Table browser and Scarlet Night
Available tables refresh automatically every three seconds on the server you opened. Tap **Join** once to take a seat; use the small **Create table** button if none are waiting. Wi-Fi and LAN are the same local-network path: browsers cannot scan other host computers. Everyone must first open the same host LAN address (or the same public game URL).

The small seal/share icon copies or shares the online game. On a local host it shares the public game as a **separate server**, not the local room. The lobby’s **Invite friends** control shares the current room’s actual local or public invitation.

**Scarlet Night** tracks completed matches, wins and seals at a table across rematches and lobby reopening. Bots are labeled. Results show the night leaderboard and a downloadable text recap; the latest recap remains accessible on this device’s home screen. No account or SQL is required. Live totals reset with the memory-only server; device storage can be cleared, so download the recap to keep it. These are friendly table bragging rights, not authenticated global rankings.
