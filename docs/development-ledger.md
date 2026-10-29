# Island MVP implementation ledger

Current money rule: direct integer gold; each member's successful reward is rounded upward. The integer-gold change below supersedes the historical fractional-money notes.

Plan: docs/superpowers/plans/2026-10-29-island-mvp.md

- Design confirmed by user; gateway and three model identifiers supplied by user.
- Environment: fresh directory, no existing Git repository; Node 22 available, no runtime dependencies required.
- Ruling: work in the named project directory on a new implementation branch rather than create a worktree without a source repository. This keeps the delivered files where the user expects them.
- Ruling: use integer twelfths of a coin, which exactly represent every possible B/C reward for integer contributions.
- Ruling: local browser application with loopback server; no external deployment or source upload is part of this development request.
- Task 1: complete — authoritative rules and private observations.
- Task 2: complete — gateway adapter, persistence and human API; all configured models have passed live checks.
- Task 3: complete — playable interface, browser acceptance and final review fixes.

## Remote repository setup

- User selected `https://github.com/Rit-Shi/menOnIsland.git` as origin.
- Fetched remote main at ad8d19b; its two commits include README, gameplay V3.6 and NPC personas V2.0.
- Preserved the previous independent local root on backup/local-bootstrap-20261029.
- Created codex/island-mvp from origin/main and carried the local baseline onto it as 88342b5.
- Local main tracks origin/main; development uses codex/island-mvp.
- Applied the confirmed negotiation/voting amendments to the repository's existing gameplay document; retained the supplied root design copy.
- Gameplay implementation remains pending while repository setup is handled.

## Development resumed

- User explicitly requested deletion of both remote design files and development from the discussed writing-block.md only.
- Removed doc/personas/人设设计v2.md and doc/playmode/核心玩法v3p6.md; retained README.md.
- Supersedes the previous remote-document baseline: writing-block.md is the only design authority.
- Model mapping supplied by user: P1 deepseek-v4.1-flash; P2 deepseek-v4.0-flash; P3 glm-5.2, via the supplied Chat Completions gateway.

- Task 1: complete. Engine and observation filtering verified with 18 passing node:test cases, including eight-day shared ranking and exact fractional payouts.

- Gateway adapter: complete, 22 tests passing. Live gateway checks succeeded for P1 and P3; gateway models list confirms P2's requested deepseek-v4.0-flash is absent, deepseek-v4-flash is available. Awaiting user choice before changing P2's mapping.

- Task 2 backend: complete. All 26 tests pass, including a full eight-day API playthrough, persisted-session recovery, authorization, CSRF and hidden-file access checks. Live models P1/P3 verified; P2 mapping decision remains pending.

- Task 3 interface: implemented and browser-verified at desktop and 390px viewport widths; no horizontal overflow. Live B cooperation produced 12.50 balances from 5+5 investment. Public promise badges and private channels verified. All 28 tests pass, including end-to-end double B elimination and request deduplication. Integration polling now waits for the actual asynchronous settlement rather than a transient no-thinking snapshot. Final review pending.

- Final independent review identified two Important issues: segmented UTF-8 request decoding and missing Agent registration revision. Both reproduced RED in regression tests, then fixed GREEN; full suite 31/31. Added two bounded optional registration reassessments per day and a waiting guard before lock. No minor findings. External model availability/strategic quality remain outside the offline review; live P1/P3 checks stand, P2 choice pending.

## Final verification

- 31 offline tests pass after the review fixes.
- Browser-driven offline eight-day game completed: every role selecting A finishes at 26.00, four shared first places; final statistics show 8 successes, 0 failures and 0 eliminations.
- Optional Agent registration reassessment was exercised through the browser.
- Real gateway game verified a successful B task with P0/P1 contributing 5 each and both reaching 12.50. Private messages and promise badges were checked.
- Mobile 390px viewport check: document content width equals viewport content width, no horizontal overflow.
- User preview remains at http://127.0.0.1:3000; temporary offline QA server is stopped.
- P2 model choice remains pending; no silent substitution was made.
- GitHub HTTPS authentication was unavailable during push preflight; changes remain local on codex/island-mvp.

## Confirmed P2 model correction

- User confirmed the intended model ID is deepseek-v4-flash, replacing the previously supplied deepseek-v4.0-flash.
- Updated the source default, example configuration, README and ignored local configuration. Historical pending-choice notes above are superseded.
- A real P2 speech request returned a valid action with no fallback in 3102 ms; all 31 offline tests pass.

## Integer gold correction

- Plan: `docs/superpowers/plans/2026-10-29-integer-gold.md`; user requested direct integer coins and upward rounding wherever rewards would be fractional.
- Economy module committed as `0dec465`: direct `gold`, `reward_pool`, `reward_per_player`, `net_changes` in saves, API, UI and Agent inputs; each successful member receives ceil(total × multiplier / members), with the pool showing the actual sum paid.
- Updated B examples: 5+5 pays 8 each (net +3 each), 6+5 pays 9 each; C total 31 pays 21 each. A remains +2.
- Economy tests RED (17 expected failures) → GREEN (35/35). Added real-file migration tests RED (4 expected failures) → GREEN; full suite 40/40.
- Legacy saves replay every recorded settlement from the initial 10 coins; preserve sessions, messages, votes, memories and locked investments. Original bytes are backed up once under `.data/backups/integer-gold/` before atomic replacement. Repeated/concurrent loads do not reapply the migration.
- Both local saves migrated successfully with verified unchanged progress. Current game remains Day 3 NEGOTIATION, version 65; gold P0=8, P1=5, P2=14, P3=2. Public rule-update notice explains that historical chat amounts remain as originally written.
- Design formulas, examples, marginal-return analysis, README and in-app rules now use integer rewards.
- Browser acceptance used a separate offline QA server: B contributions 5+5 paid 8 each, net +3, balances 13/13; actual total reward 16, integer settlement rows and chart labels, no horizontal overflow. No live model requests or real-game actions were triggered. QA server/tab closed after verification; main server restarted at http://127.0.0.1:3000.
- Final independent read-only review (gpt-6-astra/high) of e87b289..27f41f4 found no Critical, Important or Minor issues and independently passed all 40 tests. Review limits: single-process storage remains the supported scope; corrupt/unknown save repair and live model output evaluation are outside this change.

## Separate timed private conversation

- Plan: `docs/superpowers/plans/2026-10-29-private-chat-phase.md`. User confirmed one sequential public round, then 30 seconds of private conversation, then registration; each human/Agent can send at most five private messages daily across all recipients. Agents can initiate and reply.
- Engine/adapter/scheduler committed as `ae9b840`. PRIVATE_CHAT stores an absolute deadline. Engine enforces phase, deadline, outgoing quota and message validation; observations reveal only the viewer's quota. Ordinary public/registration decisions no longer carry private side messages.
- Private Agent requests run independently with at most one request per Agent. Initial proactive opportunity and new incoming messages trigger decisions; a pass waits for new input. Only the inbox captured for that request is acknowledged, so input arriving in flight is reconsidered.
- Server deadline timer cancels/discards late private replies and enters registration without waiting for slow models. Restart resumes private timers without extending the saved deadline. Existing registration/later saves keep their progress; unfinished public rounds enter the new stage when completed.
- RED→GREEN: five engine phase/quota tests, two adapter contract failures, five scheduler tests. Full suite now 53/53, including an explicit timer-only transition without browser polling, concurrent API quota enforcement, idempotent messages, privacy and an eight-day integer-gold playthrough.
- UI adds server-clock countdown, own remaining quota, private contact buttons and disabled composition outside the private window. README, in-app rules and design chat/state-machine sections updated; UI module committed as `74ab27b`.
- Independent review identified two Important findings: private busy markers/sequential IDs could disclose hidden activity, and sequential save recovery could block a later game's timer behind a slow first game's registration. Both reproduced in new regression tests (2 expected RED failures), then fixed; full suite 55/55 GREEN.
- Privacy fix also keeps private traffic out of the shared public revision. Only visible appended messages trigger private UI refresh, with a guard against stale shorter responses. New message IDs are opaque UUIDs; private thinking/cursors stay internal. Recovery dispatches games independently. The incorrect elimination-speech waiting text was corrected to say voting follows, rather than suggesting a second private window.
- Offline browser acceptance: public round → live private countdown; P1 initiated and replied after its public speech; sending five messages exhausted the shared quota and disabled send; automatic registration closed composition after 30 seconds. Private P2/P3 exchange stayed absent from the human view. After review fixes, fresh browser play confirmed new replies render without a shared revision change, and reload preserved 4/5 remaining messages and the decreasing deadline. No live provider requests or real-game actions were used for this QA.
- Review boundaries: initial proactive opportunity then wait-for-input is intentional; gateway failures become a pass without spinning; provider quality/latency, multi-process storage and corrupted-save recovery remain outside this local MVP change.

- Final acceptance after review fixes: private messages and quota render correctly, reload keeps the deadline, and the server automatically enters registration with private composition disabled. Main service restarted at http://127.0.0.1:3000; existing human game remains Day 3 NEGOTIATION/version65 with gold [8,5,14,2]. QA server/tab stopped. All 55 tests pass; final review findings fixed with regression coverage.

## Uniform Agent identity perspective

- User requested removing explicit disclosure that P0 is human: all other participants should appear as Agents to each model.
- Shared model prompt now describes four independent Agents and removes human-specific language. Agent observations omit all `is_human` flags, use neutral P0 display names in player lists/rankings, and neutralize controller labels in SYSTEM-authored history, including existing saved messages.
- P0's human-facing view, raw saves and server authorization retain the actual controller identity. Role-authored public/private messages remain verbatim; this change removes system disclosure rather than rewriting negotiations or promises.
- Regression tests RED (3 expected failures) → GREEN. Full offline suite 58/58 passes; actual local gateway request capture checks all five action types for each of P1/P2/P3 (15 requests), plus legacy SYSTEM history, final ranking labels, source immutability and preserved human interface fields. No live provider requests or real-game actions are needed.

## Secret task registration

- Plan: `docs/superpowers/plans/2026-10-29-secret-registration.md`. User requested hiding other roles' actual task choices from humans and Agents during selection, revealing them together after final confirmation.
- Backend committed as `2c99e2f`. Current REGISTRATION observations include only the viewer's task plus a public boolean `registration_submitted` map. All-submitted remains secret until lock; later phases expose the published full assignment. Previous-day published history stays visible; raw saved choices are preserved.
- Initial and reconsidered model requests use this same filtered view. Prompts explain submission readiness is not a task choice and task rosters/counts are unavailable until reveal. Reassessment can use own previous choice and negotiation history.
- Observation/scheduler tests reproduced four RED failures before implementation. Full suite now 63/63 GREEN, including GET/POST secrecy, persisted-session restoration, own-choice reassessment, identical observations under alternative hidden choices, and reveal before normal team/vote processing.
- Interface uses submission readiness rather than hidden task values to enable confirmation; task cards hide all rosters/counts during selection and show a secrecy notice. Confirmation explicitly publishes choices; module committed as `8eee358`.
- Offline browser acceptance: A/B/C actual choices remained absent from task-card rosters before final confirmation; only own B choice and per-role submitted status appeared. Reload retained secrecy. Confirmation revealed B=P0/P1, C=P2, A=P3 together and entered investment normally. No horizontal overflow, live provider calls or real-game actions during QA.
- Independent read-only review (gpt-6-astra/high) approved with no findings; independently passed all 63 tests, checked all 81 full task assignments (324 observation equivalence comparisons), and all 81 assignments with absent legacy revision fields. Public readiness/activity and previously revealed history/negotiation claims are intentional; raw legacy choices require no migration because submission flags are derived.

## Simplified Agent rounding instruction

- User requested removing payout examples from the model prompt after Agents incorrectly claimed C contributions of 10 each would net 11. Replaced the detailed rounding formula and examples with “所有金币字段直接表示整数金币。金币除不尽时向上取整。”
- Settlement logic and existing chat history are unchanged. All 63 offline tests pass.

## Clarified team formation and investment failure

- Investigated P1's historical Day 1 private claim that four willing C participants would fail if one withdrew. The observation path includes all four role IDs and C's required_members=3; the short visible history fits within the 60-message limit. The original model request body was not recorded, so the audit does not claim an exact historical request replay or certainty about the model's internal reasoning.
- Shared rules now distinguish oversubscription voting, underfilled cancellation without investment or deduction, and a formed team's investment failure. Only insufficient total investment after team formation loses submitted contributions. No payout examples were added.
- All 63 offline tests pass. Additional offline engine checks verify four C applicants enter voting, three can form C and contribute 10 each for net +10, and two C applicants retain their coins. Captured an offline adapter request to verify four IDs, C's three-member requirement, the private phase, no submitted registrations and the clarified rules. No live provider calls or real-game actions were used for these checks.

## Model diagnostics and corrective retries

- Plan: `docs/superpowers/plans/2026-10-29-model-diagnostics-retries.md`. User requested diagnostic detail and correction after failed model submissions. Retain the existing JSON response → adapter validation → engine submission protocol. Native tool calling is not currently used.
- Task 1: complete. Server-only `.data/model-calls/<game-id>.jsonl` records stage, action kind, actor/model, call correlation, request, raw output, HTTP status/request ID, finish reason, token usage, latency and parse errors. Separate submission events distinguish applied, fallback and discarded results. Serialized append and credential redaction protect concurrent traces; storage errors preserve valid actions.
- Seven regression tests reproduced missing diagnostics/metadata before implementation and now pass. Full suite 70/70; browser script syntax passes. Human diagnostics whitelist safe stage/attempt/recovery summaries only; full traces never enter player or Agent observations. Legacy notices remain readable.
- Ruling: continue in the existing named workspace on codex/island-mvp, following the established development workflow. New retries use one overall deadline and at most three attempts; invalid output is not a committed game action.
- Task 2: implemented. Invalid JSON and illegal actions receive corrective feedback with their own prior output and the unchanged filtered snapshot. At most two retries share the original timeout; transient gateway/network errors use bounded retry delays. Credentials and non-retryable HTTP errors stop immediately. Structured invalid promises are rejected for correction rather than silently removed.
- Eight new retry tests failed against the single-attempt adapter, then passed after implementation. Ten additional cases now cover correction, exhaustion, HTTP policies, shared timeout, cancellation, private deadline and single quota use, retained human investment control and final diagnostics. Full suite 80/80 passes. Independent review and offline browser acceptance pending.
- Independent read-only review of a13244a..cb35f47 passed all 80 tests and identified two Important findings: awaited trace I/O could delay retries/deadlines, and malformed HTTP-200 envelopes discarded provider evidence. Both findings reproduced in three RED regression cases, then fixed. Logs now serialize immutable records synchronously and enqueue I/O without awaiting it on game paths; a separately bounded flush is available to tests/shutdown consumers. All HTTP response bodies are retained with credential redaction, and malformed envelopes use invalid_gateway_response.
- Review fix verification: four additional tests cover blocked storage with correction/cancellation, bounded flush, raw provider error/malformed envelopes and private-stage progression while submission logs are blocked. Full suite 84/84 GREEN. No Critical or Minor findings.
- Final review rulings: browser interactions are checked separately by the parent; live provider behavior and strategic quality remain outside the offline verification because the wire protocol is unchanged; cross-process writes remain outside the documented single-process MVP scope. None changes the required private filtering, retries or deadlines.
- Final offline browser acceptance on the corrected backend: P1 registration corrected after two attempts; P3 exhausted three attempts and fell back to A; P1 corrected an excessive investment to 5 after two attempts. P0 still manually selected and locked 5, B settled at net +3. Notices showed the correct stage, attempt count and recovery/fallback result; reload preserved them and rejected raw text remained absent from the page. No horizontal overflow.
- Verified the offline JSONL artifact contained 28 valid records and 11 model attempts, raw gateway bodies for every attempt, matching submission correlation and no configured credential. QA used an isolated local gateway/data directory; no live provider calls or real-game actions were used for acceptance. Temporary QA tab/server stopped; main service restarted and HTTP 200 verified at http://127.0.0.1:3000. Earlier missing historical response data remains unrecoverable.
