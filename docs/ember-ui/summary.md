# Ember UI — summary

Branch `ember-ui` (worktree `../VideoGen-ember`). Spec: `docs/superpowers/specs/2026-10-11-ember-ui-design.md`. Plan:
`docs/superpowers/plans/2026-10-11-ember-ui.md`. Design system as built: `apps/web/DESIGN.md`. Direction picked in the visual companion:
"Prism Timecode" (a cutting-room layout) in the **Ember** dose — `mockup-layout.png`, `mockup-color.png` (option 1).

## What changed

- **Theme.** Graphite surfaces, a short rose-to-coral ember gradient for live work and the primary action only, amber for "needs you",
  red for failures, dim grey for stopped/skipped. A faint ember light from the top right and film grain under the app. Inter 600/700 for
  titles, monospace for every number, state and section label. Sharper corners. Tokens in `apps/web/src/styles/theme.css`; a test keeps hex
  colours and `bg-accent` out of components.
- **Studio (phone).** The video chips became a strip of 9:16 frames with covers (or a derived poster) and a state label; other videos that
  need you show in an amber strip with Open; the header is one mono line; a **timeline** draws the run from real step timings in three
  lanes (V / A / QC) with a playhead and a "Now · 4:12" line, and tapping a block scrolls to its step. The New video dock and sheet use
  segmented controls, mono labels, an ember focus ring and the ember Create video key.
- **Library.** A contact sheet of 9:16 posters (2 columns on a phone up to 5 on a desktop) with state, length, day and score; the
  video-library filter chips above it (neutral selection) and its YT/IG/TT badges and Imported tag in the poster's bottom-left slot (an old
  version uploaded is amber, not red). Save to phone on Platforms is that screen's ember key.
- **Shell.** LIVE n in the top bar while productions run, a mono usage pill, mono tab labels with an ember line over the active tab, a
  neutral active item with an ember edge in the rail/sidebar, sharper sheets.
- **Everything else** (chat, settings, audit, assets, library detail, platforms, review, agents): selection is neutral, secondary keys are
  ink, score bars are neutral, running agent progress is ember, desktop titles use the new scale.
- **Icon.** `apps/web/design/app-icon.svg` (ember 9:16 frame, play cut, timeline and playhead) → `node bin/icons.mjs`; flat favicon.
- **PWA.** Manifest and theme colour `#0A0A0C`. Service worker unchanged.
- **Smoke harness.** `VG_SMOKE_PORT`, `VG_SMOKE_DB`, `VG_SMOKE_DIR` (defaults 5190, `videogen_smoke`, `/tmp/videogen-smoke`) let a
  second checkout run its own stack beside another. S9 checks the video bin, the timeline, LIVE, the two-column grid, a derived poster
  and 320 px without sideways scroll.

## Screens

From the worktree's dev server against the live data (390×844 @3x and 1440×900): `phone-studio.png`, `phone-new-video.png`,
`phone-library.png`, `phone-chat.png`, `phone-settings.png`, `phone-detail.png`, `desktop-studio.png`, `desktop-library.png`.

## Verification

`npm test`, `npm run typecheck`, `npm run build` green. Smoke on a separate stack (`VG_SMOKE_PORT=5191`): mobile S9 5/5; desktop S1, S3,
S4, S5, S6, S8 and the S2 cancel/unmodellable/stop cases pass. The desktop specs that need a production to advance (S2a full run, S2b,
S2c, S2d, S2e, S2f, S7) could not run on this machine today: swap was 4.0/4.0 GiB, and the worker's GPU pre-check holds heavy steps at
"swap %100 ≥ %90" (a code constant), so every later run queued behind them. Re-run `npm run test:smoke` when swap is free.

## Known limits

- Agent output, worker notes and status notes are still Turkish (decision K5 of the mobile-pwa work).
- A video's timeline appears only for runs that have steps; imported videos show the header and player only.

## Deferred review minors

- The timeline measures its width only on mount and on resize; labels can stay hidden after a first render that returned nothing (use a ResizeObserver).
- Timeline blocks are 22 px tall; the step list stays the accessible path on a phone.
- Ruler labels follow the real total while block positions follow the stretched scale.
- Ember still appears outside the closed list in a few places: the draft/final round label, "Queued" and its playhead, and the selected Settings cards (`border-accent-glow`).
- The LIVE indicator's accessible name says "running" but also counts queued work.
- The library card no longer shows the status note; it is only in the tooltip and on the detail page.
- Tapping a timeline block scrolls smoothly even with reduced motion turned on.
- The product field shifts 1 px on focus (1 px border → 2 px ember ring).
- A failed step in a run that is still going keeps growing with the clock (the fallback the spec prescribes).

## Preview and merge

- Preview now: in the worktree, `npm run dev -w @videogen/web -- --port 5183` (proxies to the running service on 5180).
- After merging into main: `npm run build` and `systemctl --user restart videogen`; the phone link (8443 → 5180) then serves the new UI.
  Installed home-screen apps pick up the new icon after being removed and added again (iOS caches the old one).
