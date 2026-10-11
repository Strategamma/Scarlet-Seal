# Plan

- Goal: meet the arcade handoff for display names, host loss, and match recovery.
- Scope: URL name hint, hosted room pause/consent/transfer, durable room snapshots, offline solo, connection UI, and relevant documentation.
- Approach: preserve the authoritative room service, add a migration state and PostgreSQL snapshots loaded before accepting traffic; use the shared rules engine for a browser-local solo case when the server is unavailable.
- Risks: concurrent writes, restart during a turn, old seats reconnecting, and hosted storage availability.
- Verification: targeted tests for name parsing, migration across phases, snapshot reload, and offline solo; full tests/build; local browser flow where possible. Live Render and device checks require the deployed environment.
