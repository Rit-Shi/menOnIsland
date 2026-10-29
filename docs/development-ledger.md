# Island MVP implementation ledger

Plan: docs/superpowers/plans/2026-10-29-island-mvp.md

- Design confirmed by user; gateway and three model identifiers supplied by user.
- Environment: fresh directory, no existing Git repository; Node 22 available, no runtime dependencies required.
- Ruling: work in the named project directory on a new implementation branch rather than create a worktree without a source repository. This keeps the delivered files where the user expects them.
- Ruling: use integer twelfths of a coin, which exactly represent every possible B/C reward for integer contributions.
- Ruling: local browser application with loopback server; no external deployment or source upload is part of this development request.
- Task 1: pending.
- Task 2: pending.
- Task 3: pending.

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
