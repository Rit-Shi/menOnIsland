# Competition and Phase Transitions Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation and test-driven-development for behavioral changes.

**Goal:** Clarify contribution freedom and unique victory, gate private chat on a player click, and surface completed phases with reliable notices.

**Architecture:** Keep the current engine/filtered observation/client modules. Add an explicit waiting phase and public transition events in the engine, and a small client notice module that projects and queues unseen events. Derive winner metadata from current balances, including older finished saves.

**Tech Stack:** Node.js 22 built-ins, browser ES modules, SVG/CSS. No dependencies.

**Spec:** docs/superpowers/specs/2026-10-29-competition-and-transitions-design.md.

## Global Constraints

- Existing branch/workspace and inline incremental commits; preserve saves, hidden information and real manual inputs.
- A unique highest balance wins; tied highest means no winner. Numerical ties in ranks are retained.
- PRIVATE_CHAT_READY has no timer or model requests; P0's accepted start begins exactly 30 seconds.
- Contributions remain any integer in [0, gold], actual total drives payouts, no numeric payout examples added to prompts.
- Notices last about 1.7 seconds, never intercept input or focus, honor reduced motion and do not replay history on load.
- Use isolated offline acceptance; main service is restarted only after verification.

## Review Focus

- Older finished saves lack winner flags and old waiting/active saves must not gain time or lose money.
- Rapid phase changes between polls and multiple vote rounds must produce ordered, nonduplicated public notices.
- Hidden private traffic and partial submissions must not change public transition data.
- Double-start or racing requests must not extend the private window or start duplicate model jobs.
- Notices must remain readable without covering/intercepting mobile actions or resetting focus/drafts/scene motion.

### Task 1: Unique victory and explicit investment freedom

**Files:** src/engine.js, src/observation.js, src/agents.js, public/island-scene.js, public/app.js, public/index.html, README.md, writing-block.md; test/engine.test.js, test/island-scene.test.js, test/privacy.test.js.

**Interfaces:** rankPlayers(players) retains ranks and adds is_winner boolean. Finished getObservation derives ranking with rankPlayers for old/new saves. Client map/ranking/end copy use a unique winner only. Shared prompt states zero/full/above-threshold options and strict victory without forcing an investment strategy.

- [x] RED tests: unique leader wins, top tie yields no winner, lower tie does not disqualify leader; old finished observation normalizes winner metadata, tied map roles receive no crowns.
- [x] Implement winner metadata and consistent prompt/UI/rule wording; retain all existing contribution bounds and math.
- [x] GREEN full npm test; capture an offline request to inspect prompt and authorized context; commit this completed part.

### Task 2: Explicit private start and public transition history

**Files:** src/engine.js, src/observation.js, src/private-chat.js or src/runner.js only if necessary; test/private-chat.test.js, test/runner.test.js, test/server.test.js, affected test fixtures.

**Interfaces:** PRIVATE_CHAT_READY + action {type:'start_private_chat'}. game.phase_events contains sanitized {id,day,from,to,vote_round?,task_id?}; human observation includes it, Agent observation does not. The existing private scheduler starts only for PRIVATE_CHAT.

- [x] RED tests: fourth public speech waits without a timer; before-click/restart no private request; only P0 can start, exact 30 seconds from click, repeated start rejected and deadline unchanged.
- [x] RED tests: public event sequence includes immediate investment→settlement, vote rounds, ready/private transitions; private traffic and hidden progress produce no events.
- [x] Implement phase transition helper and waiting action; update existing fixtures to explicitly start private chat. Do not extend already active saves.
- [x] GREEN full npm test; commit this completed part.

### Task 3: Waiting UI and animated transition notices

**Files:** public/phase-notice.js (new), public/app.js, public/island-scene.js, public/style.css, server.js, public/index.html; test/phase-notice.test.js (new), test/island-scene.test.js; README.md, writing-block.md, docs/development-ledger.md.

**Interfaces:** Pure noticeEvents(previous,next) returns unseen sanitized display notices; phaseNotice(event) maps completed/next steps and vote rounds. A small DOM presenter owns its independent queue/timer and can reset per new game. static allowlist serves the module. stageInfo(PRIVATE_CHAT_READY) yields the private step, explicit waiting title and start CTA.

- [x] RED tests: initial history produces no replay, unchanged polls produce none, several unseen events stay ordered, new-game reset, human-only safe copy and round/day distinctions; ready stage guidance has no active countdown.
- [x] Implement start button and waiting scene/chat copy, independent notice presenter with no focus/input capture, animated daylight styling and reduced-motion fallback.
- [x] Run full npm test/syntax checks; offline browser walk-through for ready pause/reload/start/countdown, transitions, investment controls, tie/unique ending, desktop/mobile and absence of console errors. Rapid completion/queue timing use real engine/controller tests. Reduced motion inspected in code; browser preference emulation unavailable.
- [x] Independent whole-feature read-only review; fix material findings, update docs, commit and restart the main service; verify HTTP 200.
