# Scarlet Seal

A mobile-first PWA of deduction and royal intrigue. One person can play immediately against bots, or 2–4 total seats can contain any mix of people and bots.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. For same-Wi‑Fi play, other devices open `http://YOUR-LAN-IP:5173`; the terminal running Vite prints the network address. Everyone then joins with the same five-character room code.

Use **Play now** for an immediate one-person game against a bot. In a hosted room, the host can add or remove bots until the table has 2–4 occupied seats.

## Production

```bash
npm run build
PORT=3000 npm start
```

Point `decadenceinc.com` (or a game subdomain) to the host and reverse-proxy HTTPS traffic to port 3000. The proxy must support WebSocket upgrades for `/socket.io/`. HTTPS is required for reliable PWA installation. `GET /health` is available for health checks.

Rooms are stored in memory in this first version. Use one server process; restarting it clears active rooms. Durable rooms or horizontal scaling will require a shared store such as Redis.

## Checks

```bash
npm test
npm run build
```
