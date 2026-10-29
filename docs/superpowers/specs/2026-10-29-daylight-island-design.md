# Daylight Island and Visible Game Progress

## Intent

The user requested a brighter daytime interface, a map that responds to actual game progress, and clear indications of the current game phase. Keep the existing local game, controls and backend rules. This is a presentation and interaction change.

## Visual direction

Implementation choice: a lightly illustrated daytime island, with warm ivory surfaces, pale blue water, green vegetation, dark readable text and warm highlights. Keep source-native SVG so map landmarks and role markers can animate with game state. No remote visual assets or new dependencies are required. Preserve a compact desktop board/chat layout and a usable single-column mobile view.

## Daily phase guidance

Show the daily route: public negotiation → private conversation → secret registration → team formation/elimination → secret investment → settlement. Highlight the current step and distinguish elimination speeches from secret ballots. Current-stage copy must name the user's next action or the reason they are waiting. Show the private countdown wherever useful using the existing authoritative deadline; do not create extra model calls or extend the phase. Announce meaningful phase changes accessibly without moving focus or opening blocking dialogs.

## Map behavior

- Idle: ambient daytime water, clouds and vegetation; four role markers at camp.
- Public negotiation: roles remain at camp and the current speaker is highlighted.
- Private conversation: show the private-window state and countdown, without exposing whom other Agents contact or their activity counts.
- Registration: all roles remain at camp; show submitted/not-submitted status only. Highlight P0's own selected landmark. Other task choices and per-task counts remain hidden until lock, even when everyone has submitted.
- Published teams: move roles to the actual task landmarks using stable role elements and CSS transitions. A role eliminated or without enough teammates stays at camp. Landmark controls select a task during registration and navigate to its task card at other stages.
- Elimination: highlight the contested landmark/current speaker or show sealed ballots. Do not reveal votes before resolution.
- Investment: show work and secrecy cues without revealing other roles' investment values or submission state.
- Settlement: show public success/failure/cancelled status and changes derived from public balances. Task landmarks celebrate success. Show only authorized team details in the existing settlement panel.
- Final ranking: gather at camp and identify public winners.

## Motion and implementation constraints

Animate movement, ambient details and stage feedback with lightweight SVG/CSS. Preserve the scene DOM across routine page renders so polling does not restart all animations. Respect prefers-reduced-motion; all phases and actions remain understandable without animation. Avoid fake investment progress or implied new gameplay bonuses. Existing games and private histories must not be changed by this work.

## Verification

Pure scene/stage projection tests cover every phase, secret registration invariance, private-activity/ballot/investment secrecy, published team positions, elimination and public settlement. Verify desktop/mobile layout and representative phase transitions through an isolated offline browser game. Checked vote radios and focus on landmarks/buttons/tabs must survive routine polling. Landmarks need keyboard activation and visible focus; navigation targets outside registration must be programmatically focusable even though the task buttons are disabled. Use a persistent live region keyed by day/phase/vote round for announcements. Existing backend tests must remain green. Commit each completed part and restart the local service after acceptance.
