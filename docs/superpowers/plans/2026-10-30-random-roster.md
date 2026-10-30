# Random NPC Rosters Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline, with test-driven-development for behavior changes.

**Goal:** Randomly choose three distinct NPCs for every new game and keep all prompts, UI and private-message recipients tied to the saved roster.

**Architecture:** Server-side catalog is sampled only in createGame. Saved own persona feeds the existing observation/adapter; seat IDs continue routing actions and selecting models. Browser names derive from state rather than static seat labels.

**Tech Stack:** Node.js 22 built-ins, existing browser modules; no dependencies.

**Spec:** docs/superpowers/specs/2026-10-30-random-roster-design.md.

## Global Constraints

- Three distinct choices from ten, equal probability; persistence across all eight days and reloads.
- Models remain P1/P2/P3 configuration, while character identity is independent.
- Private JSON uses seat IDs; unique-name compatibility only in the current roster.
- Own personality only, no human markers or other private memory in Agent contexts.
- Sole unique-win objective and all existing timing, payouts, secrecy and reflection rules remain.
- Existing branch/workspace, desktop Web acceptance and local incremental commits.

## Review Focus

- Same person in a different seat must receive their saved persona and the seat's model.
- A reused seat in a new game must not carry a previous recipient's unsent private draft.
- Names must agree across tabs, messages, maps, diagnostic rows and results, including old saves without NPC IDs.
- Draws must have no repeats or roster mutation on loading/advancing; speaker randomness remains cyclic.
- Extra identity/profile data must not expose P0 control or other Agents' private personality/state.

### Task 1: Saved roster, prompt identity and private routing

**Files:** src/personas.js (new), src/engine.js, src/observation.js, src/agents.js; test/random-roster.test.js (new), test/agents.test.js.

**Interfaces:** drawNPCs(randomInt) returns three copied profiles `{npc_id,name,code_name,personality}`; saved on players. Agent `self_persona` contains only own saved profile; human players may include code_name. requestDecision reads self_persona with neutral fallback and uses live recipientChoices.

- [x] RED real create/save/load/advance tests for distinct/variable rosters and owner filtering; local-gateway test for non-default persona/model, seat-ID/name delivery and rejected nonparticipant.
- [x] Implement catalog/sampling, persist profiles and feed own personality into all decisions; preserve existing resolver and model mapping.
- [x] GREEN focused/full suite; integrate Task 2 before committing so a random roster never ships with stale UI names.

### Task 2: Dynamic client names and desktop acceptance

**Files:** public/roster.js (new), public/app.js, server.js, test/roster.test.js (new); README.md, writing-block.md, docs/development-ledger.md.

**Interfaces:** rosterNames(game) and personaLabel(player) provide escaped-at-use current names/display labels; reset drafts when switching games. Existing scene uses saved players.

- [x] RED helper/scene consumer tests for non-default and legacy rosters; implement dynamic client labels and new-game draft reset.
- [x] Full npm test, syntax/diff checks, independent read-only review and isolated desktop QA of random names, private sending, reload and new-game reset. Important review finding covered by test/client-roster.test.js and test/server.test.js RED→GREEN: discard old poll responses and reject expected_game_id mismatches.
- [x] Update docs/ledger, local cohesive feature commit, restart service and verify static HTTP availability.
