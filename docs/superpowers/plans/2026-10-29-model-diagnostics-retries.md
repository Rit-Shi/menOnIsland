# Model Diagnostics and Corrective Retries Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans and test-driven-development for inline implementation.

**Goal:** Diagnose every model request and let an Agent correct rejected output before using a fallback.

**Architecture:** Retain the existing Chat Completions JSON protocol: models propose actions, the adapter validates them, and the engine commits them. Write private append-only JSONL traces under the configured data directory. Retry rejected model output with explicit validation feedback; use one time budget across attempts, including the existing private-chat deadline. Correlate attempts and engine submission outcomes with an opaque call ID. Only safe diagnostic summaries reach the human interface.

**Tech Stack:** Existing Node.js built-ins, node:test and browser JavaScript; no dependencies.

**Spec:** User's 2026-10-29 request to improve invalid_JSON diagnostics, explain whether Agents submit with tools, and have failed submissions corrected. Existing game design section 18.10 defines the final legal fallbacks. Implementation choices: at most three attempts total, including two retries; no change to native tool calling in this task.

## Global Constraints

- Keep the current dedicated feature branch and named workspace; commit each completed module separately.
- Preserve identity-filtered snapshots, hidden choices, private deadlines, quota and atomic engine actions.
- A rejected response never commits an action or consumes message quota; retries must not resubmit an action already accepted by the engine.
- Full model request/response traces are server-side files only, excluded from Git and every player/Agent observation. Never log credentials or authorization headers.
- Do not replay old games, rewrite historical messages or invent missing historical response data.

## Review Focus

- Invalid JSON, empty/truncated output, illegal amounts/targets, HTTP errors and cancellation remain distinguishable in logs.
- A recovered response should show successful correction, rather than incorrectly report a fallback.
- Retries share the original timeout; private expiry cancels work without extending the window or sending late messages.
- Concurrent calls produce valid separate JSONL records; log-write failure does not replace an otherwise valid decision.
- Provider output, private messages, investments, raw responses and retry details cannot leak through API diagnostics or HTML.

### Task 1: Persistent private traces and submission diagnostics

**Files:** Add `src/model-log.js`, `test/model-diagnostics.test.js`; modify `src/agents.js`, `src/runner.js`, `src/private-chat.js`, `src/observation.js`, `public/app.js` and relevant tests.

**Interfaces:** `writeModelLog(config, record)` appends redacted JSONL to `<dataDir>/model-calls/<game_id>.jsonl`, with serialized writes per file and graceful I/O failure. Adapter result `trace` carries `call_id`, `phase`, `kind`, `attempt_count` and safe error codes; raw content stays only in files. Submission records distinguish applied, fallback and discarded results. Human diagnostics whitelist only stage, action kind, attempt count and recovery status in addition to existing actor/model/code.

- [x] Write tests for raw malformed/empty/truncated responses, metadata and correlation, concurrent logs, credential redaction, storage failure and API/Agent privacy. Run RED.
- [x] Implement trace persistence and adapter recording for all existing single attempts, including HTTP and cancellation outcomes.
- [x] Connect engine outcomes and safe diagnostic summaries; preserve legacy notices lacking stage metadata.
- [x] Run targeted tests and the full suite; commit the logging module.

### Task 2: Bounded correction and verification

**Files:** Modify `src/agents.js`, `public/app.js`, `test/model-diagnostics.test.js`, `test/agents.test.js`, `test/runner.test.js`, `README.md`, `writing-block.md`, `docs/development-ledger.md` and this plan.

**Interfaces:** `requestDecision(config, observation, kind, { signal, callId })` keeps the current return contract and adds trace metadata. Invalid JSON/illegal actions receive the Agent's own previous output plus precise correction feedback. At most three attempts share one overall abort signal; transient gateway errors may retry within that same cap, while credentials and non-retryable HTTP errors fail immediately. Engine commits only the final valid action or terminal fallback once.

- [x] Write RED tests for invalid→valid correction, illegal→valid correction, exhausted attempts, non-retryable errors, transient errors, shared timeout, explicit cancellation and exactly-once engine submission.
- [x] Implement bounded retries and validation feedback using only the original identity-filtered observation.
- [x] Verify recovered diagnostics, final fallback notices, private deadline/quota and hidden response privacy. Update protocol and logging documentation.
- [ ] Run the full suite, review the changes independently, resolve material findings, then commit completed work.
- [ ] Verify an offline browser game and JSONL artifacts, restart the main service, and confirm its HTTP response.
