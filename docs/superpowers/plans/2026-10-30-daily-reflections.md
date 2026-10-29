# Daily Reflections Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline with test-driven-development for behavioral changes.

**Goal:** Give each Agent a private daily retrospective that informs future decisions and gates progression.

**Architecture:** Engine owns enrolled-day metadata, private memory records and the next-day guard. A small concurrent reflection worker reuses requestDecision and diagnostic logs. Runner resumes pending work; HTTP lazily enrolls the selected older settled save. Existing client phases show filtered progress.

**Tech Stack:** Node.js 22 built-ins, existing browser modules/CSS. No dependencies.

**Spec:** docs/superpowers/specs/2026-10-30-daily-reflections-design.md.

## Global Constraints

- P1/P2/P3 only; one persisted record per day, including day8, private to its owner.
- Winning is the only objective; no hidden information or invented facts in reflection instructions.
- Existing model mapping, JSON correction/timeout policy and safe diagnostics; explicit fallback record on exhausted failure.
- All three records required before next_day; manual advancement remains.
- Current-day enrollment only, startup resumes pending enrolled jobs without enrolling historical finished games.
- Desktop Web acceptance, same branch/workspace, incremental commits, isolated offline QA.

## Review Focus

- Old saves and source fallback notes must not be mistaken for real model reflection or backfilled en masse.
- Repeated requests/reloads, shutdown and late results must not duplicate records or overwrite another day.
- All Agents must receive only their own private memory and authorized outcomes in both reflection and later decisions.
- One slow/failing model must not hide completed progress or permanently block next-day.
- Current timing, settlement values, manual controls, strict winner and phase-notice behavior must remain unchanged.

### Task 1: Persisted reflection records, privacy and progression guard

**Files:** src/engine.js, src/observation.js, test/daily-reflection.test.js (new), affected engine/scene fixtures.

**Interfaces:** ensureDailyReflection(game) enrolls only current settled ROUND_UPDATE/FINISHED; reflectionActors(game) returns missing P1/P2/P3 IDs. Action reflect has day, summary, lesson, next_plan and server-controlled source. memory.reflections stores up to eight unique day records; human reflection_status exposes progress/source only.

- [x] RED tests for next-day gate, one record/Agent/day, wrong actor/phase/day, private views, persistence, final day and older saves.
- [x] Implement initialization, bounded record validation, atomic completion and human-safe progress; adapt fixtures that manually advance days to provide valid reflection records.
- [x] GREEN full npm test; commit together with Task 2 so the next-day guard ships with its worker.

### Task 2: Model reflection worker, corrections and resume

**Files:** src/agents.js, src/reflection.js (new), src/runner.js, server.js; test/reflection-runner.test.js (new), test/agents.test.js, test/server.test.js and affected offline fixtures.

**Interfaces:** kind reflect normalizes a bounded structured action; fallback explicitly says reflection unavailable. runDailyReflections receives frozen owner observations, persists results independently, checks day/phase/enrollment and uses abort-aware jobs. Runner kicks pending enrolled work at startup. Current /api/state enrolls an older selected settled day only.

- [x] RED adapter/worker tests plus API coverage for legal reflection/correction/fallback, concurrent independent saves, completed-job reuse, old-save loading, next-day guard, restart and late-result cancellation.
- [x] Implement shared prompt/adapter path, worker, safe logging, runner lifecycle and lazy selected-save enrollment.
- [x] GREEN full npm test and commit the complete backend.

### Task 3: Desktop progress and acceptance

**Files:** public/app.js, public/island-scene.js, public/style.css, README.md, writing-block.md, docs/development-ledger.md; test/island-scene.test.js.

**Interfaces:** stageInfo and action panel consume only reflection_status; next-day remains disabled until complete. No private text in DOM or human API. Existing phase/scene contracts remain.

- [x] RED progress/guidance tests, implement clear pending/completed/fallback rows and next-day gating; preserve settlement access and final ranking.
- [x] Full tests/syntax checks, offline desktop browser acceptance, independent read-only feature review; fix material findings.
- [x] Update docs, commit, restart main service and verify HTTP availability.
