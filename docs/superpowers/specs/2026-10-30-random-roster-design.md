# Random NPC rosters

## Intent

Each new game draws three different characters from the ten NPCs in the supplied NPC V3.6 document. Private chat must keep addressing the correct participant regardless of names or seating. The user authorizes random selection; existing rules and winning as the sole objective remain binding.

## Behavior

- Draw three without replacement, equally likely, only at game creation. Persist the chosen NPC identity, name, display label and concise personality on P1/P2/P3 for the whole game. P0 remains unchanged.
- NPC-01 through NPC-10 are Lin Zhou, Shen Mo, Gu Han, Su Ran, A Mu, Chen Suan, Qin Lan, Jiang Yin, Lu Heng and Chu Yan, with Chinese names from the supplied document. Use their core investment/voting/language tendencies, subordinate to unique victory. No payout examples in persona prompts.
- Builder choice: adopt the ten core personality descriptions for this feature, without implementing the document's separate relationship matrix, probabilistic enforcement, custom trust formulas, enemies or alliance subsystems. Existing private facts, shared trust update and daily reflections remain.
- Seat IDs remain P0/P1/P2/P3. Existing configured models remain bound to seats, so character and model are independent. The human UI shows actual character names, their labels and the configured model.
- Every model request uses its persisted own personality, not a seat-hardcoded identity. It receives the current ID/name roster; private output uses `to` with a seat ID. Existing unique-name compatibility resolves only against this game's participants and never the global catalog. Unknown names and self-contact remain invalid.
- All UI names, avatars, chat tabs, draft labels, task members, votes, progress, charts and results use the current persisted roster. Map already reads actual names and must remain consistent.
- Existing saves keep their exact roster and personality. No re-roll on refresh, restart, next day, or lazy old-save reflection. Legacy own personality is usable even without an NPC ID. No identity markers revealing human control are sent to Agents.
- New-game drafts must be reset so a private message intended for the previous character cannot be sent to a different person occupying the same seat.
- Poll responses started before an accepted game switch are discarded. Current-client actions identify expected_game_id; the server rejects an ID that differs from the authenticated session, preventing stale tabs from addressing a different occupant. Legacy direct API callers without this field remain compatible.

## Implementation

Add a server-only NPC catalog plus without-replacement selection in src/personas.js. createGame persists selected profiles; sampling reuses the injected randomInt source. Observation exposes the owner's persona privately and human-facing character labels only. requestDecision uses the owner's observed persona and explicit seat identity. A small browser roster helper supplies all names and labels from the state, preserving legacy saves and neutral welcome placeholders.

## Validation

Deterministic draws exercise all ten candidates, distinct membership and ordered samples. Real save/load and next-day actions preserve profiles. Capture real local-gateway JSON for a non-default roster and verify model-seat mapping, self identity, current recipients, ID and name delivery, unknown-name rejection and privacy. Test scene identity and human labels. Run the full suite, desktop browser QA with isolated store/fake decisions, fresh independent review, incremental local commit and restart. No real gateway calls or live-game actions during QA.

## Constraints

Same existing branch/workspace; desktop Web; no dependencies or new public services. Preserve integer payouts, hidden choices, chat timing/quotas, reflection gate and sole unique-win objective.
