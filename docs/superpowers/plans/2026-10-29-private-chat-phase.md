# Timed Private Chat Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans and test-driven-development for inline implementation.

**Goal:** Each day has one sequential public round, then 30 seconds of private conversation, then registration; each role may send at most five private messages per day.

**Architecture:** Persist an absolute private deadline after the final public speech. Validate all messages and quotas in the engine. During this phase, independently schedule one model call per Agent at a time: one opportunity to initiate, then reconsider whenever new incoming private messages arrive. Agents may send one message or pass. A server timer closes the phase even with slow models; cancel and discard late results. Existing ordinary turns continue to use simultaneous snapshots where required.

**Tech Stack:** Existing Node.js built-ins and browser JavaScript; no dependencies.

**Spec:** User's confirmed 2026-10-29 change: public and private chat are separate; private chat lasts 30 seconds; each human/Agent sends at most five private messages daily; Agents can initiate and reply.

## Global Constraints

- Five means outgoing messages across all recipients; replies count; receiving, passing and public speeches do not consume this quota.
- Private messages can be sent only during PRIVATE_CHAT, including by Agents; ordinary speech/registration requests no longer carry side messages.
- The backend deadline is authoritative and survives reload/restart; expiry moves to REGISTRATION without waiting for model responses.
- Model observations remain identity-filtered; no private activity counts or scheduler cursors of other roles are exposed.
- Keep the current feature branch and named workspace per the existing project workflow; commit completed modules separately.
- Do not rewind saves already in registration or a later phase; an unfinished public round enters private chat when completed.

## Review Focus

- Exact deadline boundary and quota under duplicate/concurrent submissions.
- A slow Agent must not block another Agent's private reply or delay registration.
- Incoming messages during a request must cause a later decision; an idle pass must not spin repeatedly.
- Restart/reload must preserve remaining time and consumed quota; expired saves must progress without extending time.
- New stage must preserve eight-day playthrough, repeat-vote rules, private filtering and integer economics.

### Task 1: Engine, model adapter, scheduler and API

**Files:** Modify `src/engine.js`, `src/observation.js`, `src/agents.js`, `src/runner.js`, `src/store.js`, `server.js`; modify existing tests and add `test/private-chat.test.js`, `test/runner.test.js`.

**Interfaces:** `applyAction(game, actorId, action, randomInt, now)` accepts an injectable clock. Export `advanceTime(game, now)` and `privateMessagesSent(game, actorId)`. `createRunner` accepts `now`, provides `kick`, `idle`, `resume`, `close`; model decisions accept optional abort signal. Observation exposes own quota and absolute start/end times.

- [x] Write tests for the new phase, 30-second boundary, five-message limit and private permissions; run them RED.
- [x] Implement engine transitions and filtered quota/deadline observations.
- [x] Write scheduler and adapter tests: proactive/reply, no spin, per-Agent concurrency, incoming during request, deadline cancellation and restart; run RED.
- [x] Implement independent private scheduling, server timer, bounded requests, lifecycle recovery; remove old side-message channel.
- [x] Adapt API/engine/privacy fixtures with injected time, then run `npm test` and commit after all pass.

### Task 2: Interface, rules and live acceptance

**Files:** `public/app.js`, `public/index.html`, `public/style.css`, `README.md`, `writing-block.md`, `docs/development-ledger.md`.

**Interfaces:** Consume PRIVATE_CHAT and own quota/deadline, using server clock offset for countdown; preserve private history and disable send outside the window or at zero quota.

- [x] Display a live countdown and remaining daily messages; clearly separate public/private compose availability.
- [x] Update rules, prompt descriptions, workflow and relevant design sections to remove all-stage private chat.
- [ ] Run all tests and syntax checks, verify real-time countdown, replies, cap and automatic registration in an offline browser game, restart main service and preserve current progress.
- [ ] Commit the interface/docs and request a fresh independent review; fix material findings with RED→GREEN tests.
