# Private daily Agent reflections

## Requested outcome

Each of P1, P2 and P3 reflects once on the day's decisions after settlement, before the player can enter the next day. Reuse the current models, private observations, structured JSON protocol and local persistence. Winning remains the sole objective.

## Implementation decisions

- Store one concise structured reflection per Agent/day in that Agent's private memory: summary, lesson and next_plan. This is an actionable retrospective, not a request for hidden chain-of-thought. Use only visible conversation, public balances/results, the Agent's own choices and authorized team settlement; distinguish observed facts from negotiation claims/inferences.
- Include prior own reflections in subsequent decision contexts. Never expose another Agent's reflections to a model, the public chat or the player's state. Human UI receives only progress and whether a record used a fallback.
- Keep ROUND_UPDATE/FINISHED as the underlying phases. Initialize a persisted reflection_round for the current settled day, run the three model jobs concurrently and save each independently. Block next_day in the engine until all three records exist; then retain the existing manual next-day button.
- The eighth day also reflects, with next_plan discussing a future game rather than inventing a ninth day. Final ranking can be read while the reflection progress completes.
- One logical reflection record per Agent/day. Invalid responses use the existing at-most-three-attempt correction policy and shared timeout. Exhaustion uses an explicitly marked unavailable/fallback note, not a fabricated analysis, so a failed provider cannot indefinitely block the game.
- New settlements initialize reflection work. Loading the currently viewed old ROUND_UPDATE/FINISHED save enrolls only its current settled day. Startup resumes already-enrolled pending work; it does not enroll every historical finished save or backfill all previous days. Preserve money, messages, existing facts/trust and all completed reflection records.
- Duplicate submissions and repeated polls must not repeat completed work. Reload/restart resumes missing records, and shutdown/late results cannot create wrong-day or duplicate records. Persist completion and the private memory atomically.
- Desktop Web remains the primary UI. Show three progress rows, retain access to settlement, clearly disable next-day while pending, and display a completed/fallback status afterwards. Existing notices, focus, scene retention, timers and secret choices must remain intact.

## Validation

Engine gating, duplicate/wrong actor/day/phase, fallback labeling, own-memory-only observations and persistence; concurrent jobs and independent completion, bad output correction/exhaustion, restart/cancellation, old-save enrollment without retroactive startup calls; full suite and isolated offline desktop browser acceptance. No real provider calls or live-game actions for QA. Commit each completed part on the current branch.
