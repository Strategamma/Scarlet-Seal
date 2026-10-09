# Scarlet Seal

A mobile-first PWA of deception and deduction. One person can play immediately against a bot, or 2–6 total seats can contain any mix of people and bots.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. For same-Wi‑Fi play, other devices open `http://YOUR-LAN-IP:5173`; the terminal running Vite prints the network address. Everyone then joins with the same five-character room code.

Use **Play now** for an immediate one-person game against a bot. In a hosted room, the host can add or remove bots until the table has 2–6 occupied seats.

## Production

```bash
npm run build
PORT=3000 npm start
```

Point `decadenceinc.com` (or a game subdomain) to the host and reverse-proxy HTTPS traffic to port 3000. The proxy must support WebSocket upgrades for `/socket.io/`. HTTPS is required for reliable PWA installation. `GET /health` is available for health checks.

Rooms are stored in memory in this first version. Use one server process; restarting it clears active rooms. Durable rooms or horizontal scaling will require a shared store such as Redis.

### Render

The repository includes `render.yaml` for a single Docker web service in Render's Singapore region. It serves both the PWA and Socket.IO, uses `/health` for health checks, and declares `scarletseal.decadenceinc.com` as its custom domain.

After the GitHub repository is pushed:

1. In Render, create a new Blueprint from `Strategamma/Scarlet-Seal`.
2. Approve the `scarlet-seal` web service.
3. In the DNS provider for `decadenceinc.com`, add the CNAME value shown by Render for `scarletseal`.
4. Wait for Render to verify the domain and issue TLS.

Players on any internet connection—including devices sharing Wi-Fi—can use the Render URL. For internet-free same-Wi-Fi play, run the app locally and have devices open the host computer's LAN address.

## Checks

```bash
npm test
npm run build
```
