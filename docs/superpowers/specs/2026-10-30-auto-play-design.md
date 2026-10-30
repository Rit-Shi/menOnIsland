# Manual play or four-Agent auto play

## User intent

Choose manual play or select an NPC to replace P0. User explicitly chose personality selection only with the default model, and fully automatic progression through eight days. Automatic play is four independent Agents; human watches.

## Contract

- New-game setup defaults to manual. Auto mode requires one of the ten NPC personas for P0; sample the other three without replacement from the remaining nine. Persist mode, control status and all four profiles. No mid-game mode switch or manual takeover.
- Builder choice: MODEL_P0 defaults to MODEL_P1 (currently deepseek-v4.1-flash). It is server configuration, not a per-game model selector. Existing P1/P2/P3 models remain unchanged.
- In auto mode, P0 receives all ordinary model decisions, active private-chat scheduling/quota, private memory and daily reflection, through the same validation/retry/fallback paths as others.
- Server automatically starts private chat after public speech, locks registration after all four have submitted, and advances the day after all four reflections are processed. Private chat remains exactly 30 seconds; max five sent messages per role/day. Stop at day8 FINISHED after terminal reflections; never create another game automatically.
- Automatic state machine operations are deterministic server actions, not extra model requests. No special cooperation/knowledge advantages for P0. Unique victory remains the sole objective; ties still mean no winner.
- Human view follows the P0 seat, including only that seat's private conversations, investments and team settlements. No omniscient view or access to any Agent's private reflection text. All four Agent request observations omit human/controller/UI metadata; auto P0 uses its actual NPC name/persona.
- Auto UI is read-only gameplay: no chat sending, task choice, vote, investment, registration confirmation or next-day buttons. Show automatic progress and the proxy identity/model; allow new-game setup and viewing existing authorized history.
- Creating a new game stops a prior authenticated auto game and cancels/discards its in-flight work, after the new game validates/saves successfully. The old save remains recoverable, marked stopped; no new provider calls for abandoned games. No pause/resume UI in this feature.
- Refresh/restart resumes an active auto game at its saved stage without resetting private timers, quotas, rosters, actions or reflections. Manual and older saves keep existing behavior. Startup skips stopped auto games.

## Implementation boundaries

Agent ownership comes from one engine helper, replacing fixed three-Agent lists. Extend existing observation projection with an explicit Agent-view entry point so P0 can use the same safe projection while the human observer keeps its normal permissions. Config exposes only safe selectable NPC names/labels and the default P0 model. Validate mode/persona on create; block human game-action submissions in auto mode, with expected_game_id checked first.

Runner handles all four decisions and deterministic phase progression, with abort-aware per-game work and cancellation guards in the regular/private/reflection workers. Keep all secret batches frozen. Reuse saved facts/trust/reflections, adapting counts to three or four controlled Agents.

Initial welcome and new-game dialog share a mode/persona form. Existing light desktop layout, scene, notices and readonly chat history remain. Automatic guidance must never say a human input is required. Show each NPC's name/code label/model clearly; stage controls navigate only.

## Verification

RED/GREEN: manual compatibility; invalid mode/persona; four distinct identities; safe P0 model payload; human metadata/privacy; four private quotas and reflections; eight-day automatic engine/runner integration including votes and investment; startup resume; cancellation and late replies; auto human-action rejection; new-game stopping only the authenticated prior auto game. Keep fixed payout/winner/secrecy tests green.

Desktop offline browser acceptance covers both setup modes, a chosen P0 persona, four-role progress, disabled human actions, readonly private conversations, refresh, terminal result and new-game cleanup. No real provider calls or live-game actions during acceptance. Two local commits: complete backend, then client/docs. Independent builder and whole-feature review.
