# Competition and phase transitions

## User requirements

- Agents should understand that contributions may exceed task thresholds or be below an equal share; thresholds are not investment caps or required individual shares.
- Victory requires a uniquely highest final balance. Sharing the highest balance does not count as winning.
- User steering: winning is the only goal. Cooperation, fairness, promises and reputation are optional strategies rather than independent objectives; personality cannot override this goal.
- Public negotiation must end at a waiting screen. The player explicitly starts the 30-second private window.
- Every completed phase needs a conspicuous, attractive transition notice consistent with the daylight island.

## Behavior and builder decisions

The user's four requested changes authorize implementation in the existing local repository and feature branch. Continue the established inline implementation and incremental commits; no new platform, dependencies or external publishing.

Investment rules remain unchanged: any integer from zero through the role's current balance is legal, the success test applies to the team's total, and successful payouts use the actual total even above the threshold. State these options explicitly in the shared prompt and investment instructions without numeric payout examples or forcing random/unequal behavior. Preserve personalities but make the final competition objective primary. Prompt clarity cannot guarantee varied model strategies.

Keep equal numerical ranks for equal balances, but mark a winner only when exactly one role holds rank 1. A tie for the highest balance means no winner, with no random tiebreak or extra round (interpretation of the user's explicit rule). Reflect this in server observations, prompts, ranking labels, end copy and map crowns. Existing finished saves must also display the correct result without replaying money or changing historical chat.

Introduce PRIVATE_CHAT_READY after the fourth public speech. It has no private countdown, deadline or model calls. Only P0 can submit start_private_chat from this phase; acceptance atomically creates the original 30-second window. Reject premature, duplicate and Agent starts. Reload/restart preserves waiting; already active private saves retain their original deadline. Keep the six-step rail: ready belongs to the private-chat step and clearly says it has not started.

Record a bounded public phase_events history in the engine (maximum 128, sufficient for this eight-day game), with unique ID, day, from/to phases and public vote-round/task metadata if applicable. Each real transition is recorded, including immediate transitions where an all-A/underfilled day skips investment. Secret messages, submission progress and hidden ballot/investment values never become events. Expose events only to the human UI; Agents keep their current filtered context shape.

On first load, use the event history only as a cursor; do not replay old notices. Later polls enqueue unseen events once, in order, even when several phases completed between polls. A new game resets the notice cursor/queue. Repeated state polls, private messages and mere readiness changes do not replay phase notices. The queue is independent of the game timer and cannot delay server actions.

Builder visual choice: a warm ivory and green island-themed notice centered near the upper viewport, with a seal/check motif, short completed-stage title, next-step copy and a brief glow/particle entrance. Show each notice for approximately 1.7 seconds. Use pointer-events:none so controls remain usable; do not steal focus. Reduced motion keeps a static readable notice for the same duration and disables movement. Persistent phase guidance and accessible announcements remain available after the notice disappears.

## Verification

- Unique leader, tied leaders and tied lower ranks; old finished-save observations and map crown behavior.
- Legal high/zero/non-average contributions continue to settle from actual totals; prompts checked through an offline captured request, not a claim about model strategy.
- No private timer or requests before clicking; ownership, double click, quota, exact deadline, reload and restart.
- Public transition history includes rapid/round transitions while remaining invariant under hidden activity.
- Frontend notice cursor, ordered queue, no refresh replay, multi-round labels, private countdown activation, draft/focus preservation, reduced-motion code paths, desktop and 390px layouts.
- Offline browser/data/provider fixtures only; do not advance the user's live game or call the real gateway for acceptance.
