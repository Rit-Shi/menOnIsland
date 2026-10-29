# Integer Gold Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace fractional gold units with actual integer coins everywhere, rounding each member's successful reward upward.

**Architecture:** New saves use schema version 2 and direct `gold`, `reward_pool`, `reward_per_player`, `net_changes` values. Calculate each reward as `ceil(total × multiplier / members)` and report the actual total paid. Migrate old saves by replaying recorded settlements from 10 coins, with a byte-for-byte backup before the first write.

**Tech Stack:** Existing Node.js built-ins and browser JavaScript; no dependencies.

**Spec:** User's 2026-10-29 instruction; updated integer rules in `writing-block.md`.

## Global Constraints

- A remains +2; B/C membership, thresholds and multipliers remain unchanged.
- Investment/promise amounts remain nonnegative integers within balance; failures lose the submitted investment.
- Preserve sessions, private information boundaries, messages, votes, locked investments and game phase.
- Commit each completed module after its tests pass.

## Review Focus

- B rewards requiring half/quarter rounding, C requiring thirds, and already integral rewards.
- Multiple historical fractional rewards must round separately, rather than round only the final balance.
- ROUND_UPDATE/FINISHED versus mid-day starting balances and final tie rankings.
- Repeated/concurrent loads must not reapply migration or overwrite the original backup.
- Browser/Agent investment limits must use the full integer balance.

### Task 1: Integer economy throughout new games

**Files:** `src/engine.js`, `src/observation.js`, `src/agents.js`, `public/app.js`, `public/index.html`, `test/engine.test.js`, `test/privacy.test.js`, `test/agents.test.js`, `test/server.test.js`.

**Interfaces:** Produce schema-2 games and filtered observations with direct coin values; export `calculateSettlement(taskId, memberIds, investments)` and `rankPlayers(players)` for migration.

- [x] Write and run failing assertions: B 5+5 → balances 13/13, B 6+5 →13/14, C 20+11+0 from 30 →31/40/51; A eight days →26.
- [x] Implement integer balances, ceil per-member payouts, integer UI and Agent context/limits; actual pool equals the sum paid.
- [x] Run `npm test` (all green), then commit the coherent economy module.

### Task 2: Existing saves and documentation

**Files:** Create `src/migrations.js`, `test/store.test.js`; modify `src/store.js`, `README.md`, `writing-block.md`, `docs/development-ledger.md`.

**Interfaces:** Consume Task 1 settlement/ranking functions; `migrateGame(game)` returns whether migration occurred. Store load backs up raw legacy data, migrates once, then atomically saves schema 2.

- [x] Write migration fixtures for two B days, C rounding, failed/underfilled roles, pending investments and finished ranking; exercise backup and repeated/concurrent load against real temporary files.
- [x] Run `node --test test/store.test.js` and confirm the new expectations fail before implementing migration.
- [x] Implement migration, update rules/formulas/examples, and run `npm test` (all green).
- [x] Migrate local saves, restart the local server to discard old cached state, and verify unchanged phase/actions, integer history and UI.
- [x] Commit migration and documentation; perform final independent review and fix any material findings with regression tests.
