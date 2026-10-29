# Island MVP implementation ledger

Plan: docs/superpowers/plans/2026-10-29-island-mvp.md

- Design confirmed by user; gateway and three model identifiers supplied by user.
- Environment: fresh directory, no existing Git repository; Node 22 available, no runtime dependencies required.
- Ruling: work in the named project directory on a new implementation branch rather than create a worktree without a source repository. This keeps the delivered files where the user expects them.
- Ruling: use integer twelfths of a coin, which exactly represent every possible B/C reward for integer contributions.
- Ruling: local browser application with loopback server; no external deployment or source upload is part of this development request.
- Task 1: complete — authoritative rules and private observations.
- Task 2: complete — gateway adapter, persistence and human API; external P2 model ID confirmation pending.
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
