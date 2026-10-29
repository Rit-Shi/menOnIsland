# Daylight Island UI Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans and test-driven-development for inline implementation.

**Goal:** Replace the dark board with a daytime island and make the map and phase guidance reflect the real game process.

**Architecture:** Add a pure client view model and an SVG scene renderer/updater in a browser module. Reuse the existing filtered state and action endpoints. Preserve the scene DOM while the surrounding interface renders, then reconcile positions and public states. Restyle existing controls without changing game rules.

**Tech Stack:** Node.js built-ins, browser ES modules, SVG and CSS; no dependencies.

**Spec:** `docs/superpowers/specs/2026-10-29-daylight-island-design.md`.

## Global Constraints

- Keep the current feature branch and workspace; commit each completed module separately.
- No changes to model invocation, timers, saves, settlement or task-selection privacy.
- Scene state uses only the human observation; registration, private traffic, ballots and investments remain protected.
- Prefer reduced-motion, accessible labels, readable daytime contrast and responsive layout.
- Use an isolated offline game for browser acceptance; do not play or advance the user's real game.

## Review Focus

- All-submitted registration remains hidden until lock; map geometry/labels must not encode other roles' choices.
- Private message traffic, pending ballots and other contributions must not drive visible markers or progress.
- Repeated polling must preserve scene elements and not replay movement/celebrations unnecessarily.
- Empty rosters, underfilled/eliminated roles, multi-round votes and final ties must have coherent visible states.
- Focus, drafts, countdown and form submission must keep working after theme and renderer changes.

### Task 1: Stage and map state, movement and privacy

**Files:** Add `public/island-scene.js`, `test/island-scene.test.js`; modify `public/app.js`, `server.js`.

**Interfaces:** Export `stageInfo(game)` and `islandModel(game)` as pure functions, plus scene markup and a DOM update function. Consume existing human-view fields only. The app retains the scene node across renders and routes landmark clicks to existing task actions/card navigation.

- [x] Write RED tests for phase mapping, secret choices, private activity, hidden votes/investments and public outcomes.
- [x] Implement the pure projection, SVG world and stable role/landmark updates.
- [x] Integrate stage route, action guidance, live countdown and landmark controls with the existing app.
- [x] Run targeted/full tests and commit the scene module.

### Task 2: Daylight visual system and acceptance

**Files:** Modify `public/style.css`, `public/index.html`, `public/app.js`, `README.md`, `docs/development-ledger.md` and this plan.

**Interfaces:** Style existing components and the new scene/stage elements; preserve all form/action contracts and data-private-countdown hooks.

- [x] Implement the complete light palette, scene motion, readable cards/chat/dialogs and responsive layout.
- [x] Verify representative stages, secret reveal, movement, waiting states, investment controls, settlement and reload in an offline browser game.
- [x] Verify reduced-motion code paths, mobile width and phase announcements; run the full suite and independent review. Browser OS motion preference was off; media emulation was unavailable.
- [x] Fix material findings, commit completed work and restart the main service; verify HTTP availability.
