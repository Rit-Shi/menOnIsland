# Secret Registration Implementation Plan

> **For agentic workers:** Use test-driven-development and inline execution.

**Goal:** Keep current-day task choices private to their owner until the existing final registration lock reveals everyone together.

**Architecture:** Filter registration choices in the shared observation builder for both human and Agent consumers. Expose a separate boolean submitted map for readiness. Preserve raw choices, own revisions and published previous-day history; reveal all after lock before normal team/vote processing.

**Spec:** User's 2026-10-29 request to hide other roles' task choices during selection for human and Agents alike.

## Constraints

- Current REGISTRATION view contains only the viewer's task, even when all have submitted; no per-task roster or count before final confirmation.
- Submission readiness is public. Final lock requires every role submitted and all reassessments finished; it still ends changes for the day.
- Initial and reconsidered Agent requests use the same secret projection; previous-round revealed history remains public.
- Keep current saved choices and progress; no save rewrite or new game required.

### Task 1: Backend secrecy and Agent contract

- [x] Write failing observation and scheduler regressions, including alternative hidden assignments with identical visible state.
- [x] Add `registration_submitted`, filter `registrations` by viewer until lock, update Agent instructions and reassessment wording.
- [x] Verify real API GET/POST/restart behavior and old regression suite: 63 tests pass.
- [x] Commit backend module after verification.

### Task 2: Interface and acceptance

- [x] Hide task-card rosters/counts during selection; show submitted status separately and own choice; confirmation button explicitly publishes.
- [x] Update rules and documentation, verify offline browser selection/reload/reveal and restart main service preserving saved progress.
- [x] Commit interface, request independent review, address material findings with regression tests and record final verification.
