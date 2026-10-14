# Tables and Scarlet Night
- Goal: discover/join tables quickly and celebrate a shared night.
- Scope: server table browser, small creation/code controls, compact sharing, authoritative night totals and downloadable device recap.
- Approach: reuse Socket.IO listing; same-server discovery only. Count completed matches once, retain across rematches/reopen/reconnect and optional snapshots.
- Risks: no cross-server Wi-Fi discovery; local invitations cannot reach internet; memory-only server resets, device archives can be cleared.
- Verification: stats idempotence/persistence tests, build, separate-client table discovery/join, bots/start, responsive and sharing fallback checks.
- Outcome: 59 tests/build pass. Two separate clients discover/join, finish two matches, migrate host/reconnect, rematch/reopen; night totals/archive/download verified. Five responsive browser sizes and local/public clipboard distinction pass. Physical LAN, live internet deployment and native sharing remain unverified.
