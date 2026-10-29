# Island Protocol MVP Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan inline. Steps use checkbox syntax for tracking.

**Goal:** Deliver an eight-day browser game with one human and three independently configured real-model agents.

**Architecture:** A Node.js server owns the game state, validates every action, persists atomic JSON snapshots and filters all observations by actor identity. The browser receives only P0's authorized view. A Chat Completions adapter calls the supplied Volcengine gateway with a different configured model for each agent.

**Tech Stack:** Node.js 22 built-ins, native fetch, node:test, HTML/CSS/JavaScript; no runtime package dependencies.

**Spec:** `writing-block.md`, including confirmed random-start cyclic negotiation and fresh speeches/ballots after each elimination. This is the sole design baseline; use its three MVP roles 林舟、沈默、顾寒. The remote's previous two design documents have been removed at the user's request.

## Global Constraints

- Four roles P0–P3; initial balance 10; eight days; ties share first place.
- A pays exactly 2 per participant; B requires two and total 10, pool ×1.5; C requires three and total 30, pool ×2.
- Secret nonnegative integer contributions; no debt; no refunds on failure; equal rewards on success, including zero investors.
- Unfilled and eliminated registrations earn zero and never move automatically to A.
- Daily public negotiation defaults to one speech per role, cyclic order from a persisted uniformly random starting role.
- Repeated elimination uses fresh speeches and fresh ballots; tie elimination is random among that round's highest-vote candidates.
- Money representation superseded by the user's integer-gold correction: direct integer coins, with each successful member reward rounded upward. See `2026-10-29-integer-gold.md`.
- Private conversations and settlements are filtered on the server, including agent context, memory and final history.
- Secrets stay in ignored `.env.local`; the application stays local and binds to loopback by default.

## Review Focus

- Refresh/restart during a model request must not repeat a locked action or payment.
- An outsider must not get secret votes, investments, private conversations or internal memory through any endpoint.
- A model timeout, malformed JSON or unlawful action must not leave the day stuck or bypass validation.
- Double-clicked human actions must be rejected without altering the first accepted action.
- Persisted balances, ties and chart histories must use exact units; two-decimal formatting cannot affect ranking.

## Task 1: Authoritative engine and exact settlement

**Files:** `src/engine.js`, `src/observation.js`, `test/engine.test.js`, `test/privacy.test.js`.

**Interfaces:** `createGame({id, randomInt})`, `applyAction(game, actorId, action, randomInt)`, `settleRound(game)`, `getObservation(game, viewerId)`, `getHumanView(game)`.

- [x] Write and run failing tests for A/B/C arithmetic, failed and zero contributions, repeat voting, random turn order, invalid actions, eight days and ties.
- [x] Implement state transitions and money operations (subsequently converted to direct integer coins under `2026-10-29-integer-gold.md`).
- [x] Write and run privacy tests covering all phases, chat, settlements, memory and final history; implement filtered observations.
- [x] Run `node --test test/engine.test.js test/privacy.test.js` and commit the independently testable engine.

## Task 2: Gateway, persistence and human API

**Files:** `src/config.js`, `src/agents.js`, `src/store.js`, `src/runner.js`, `server.js`, `scripts/check-models.js`, `test/agents.test.js`, `test/server.test.js`.

**Interfaces:** `requestDecision(config, observation, actionKind)`, `GameStore.load/save`, `advanceAgents(gameId)`, same-origin `/api/*` JSON endpoints; session always resolves to P0.

- [x] Write failing tests for response parsing, validated fallbacks, per-agent model selection and absent credentials.
- [x] Implement environment loading and Chat Completions requests with bounded output, timeout and safe error reporting.
- [x] Write failing integration tests for session authorization, path traversal, duplicate actions, restart and persisted settlement.
- [x] Implement atomic storage, serialized commands and asynchronous model turns; simultaneous secret decisions use one filtered snapshot per batch.
- [x] Run the tests and small live checks against the three specified models; record availability without exposing credentials.
- [x] Commit the API and runner.

## Task 3: Playable interface and handoff

**Files:** `public/index.html`, `public/app.js`, `public/style.css`, `.env.example`, `README.md`, `start.ps1`.

**Interfaces:** Browser uses only the human API; supports negotiation, private chat, registration, speeches, ballots, investment, settlement, next day and final ranking.

- [x] Build a responsive Chinese island dashboard with role cards, task cards, chronological chat, private channels and explicit phase actions.
- [x] Display money (subsequently converted to direct integers), private settlement records, eight-day trends, loading and recoverable errors.
- [x] Verify with `node --check`, the full test suite, an eight-day automated API playthrough and browser inspection of key stages and narrow layouts.
- [x] Run a fresh whole-project review, fix material findings with regression tests, document startup and the verified limitations, then commit.

## Implementation defaults

- Private messages may be sent during live play; agents read them on their next scheduled decision and may send private replies as part of that action. They do not trigger an unbounded background conversation.
- Agent task registration is automatic once public negotiation completes; the human may change their selection before locking all registrations.
- Model availability failures retain the requested model mapping and use the documented legal action fallback; no silent replacement with another model.
- Native inline execution follows the user's instruction to begin development after the design discussion; no extra execution-method approval is required.
