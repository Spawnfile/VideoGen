# Design

Recorded from the shipped build (`apps/web/src`), not from intentions. Spec: `docs/superpowers/specs/2026-10-11-ember-ui-design.md`.

## World

**Cutting room.** A product goes in, the agents cut a short video, and it comes out on the contact sheet. The pipeline already works that
way, so the material describes the mechanism: an editing timeline with a playhead, timecode, 9:16 frames, a contact sheet. The metaphor
is never spoken — see **Voice**.

Refused: the generic dark dashboard (grey rows, rounded status pills, one teal accent everywhere) that this replaced.

## Color

Tokens live in `src/styles/theme.css` (`@theme`); components never spell a colour out (`test/theme-tokens.test.ts` enforces it).

| Token | Value | Role |
|---|---|---|
| `canvas` | `#0A0A0C` | graphite, the room |
| `paper` / `inset` | `#111114` / `#17171B` | raised surfaces, fields |
| `line` / `line-strong` | `#222228` / `#2E2E36` | hairlines, borders, finished timeline blocks |
| `ink` / `ink-2` / `ink-3` | `#EEEEF2` / `#A6A6B0` / `#7C7C88` | text, three levels (`ink-3` ≥ 4.5:1 on canvas) |
| `ember-a` → `ember-b` | `#FF4D6A` → `#FF8A3D` | `--grad-ember`, 100° — live work and the primary action |
| `accent` / `accent-glow` | `#FF6B3D` / `#FF9466` | flat ember for tiny marks; focus rings and links |
| `amber` | `#FFC94D` | needs you — a decision, not a failure |
| `red` | `#F0445C` | failed only |
| `green` | `#4CC38A` | ready, uploaded |
| `dim` | `#5A5A64` | stopped, skipped — not failures |
| `--poster-0…7` | dark two-stop gradients | derived posters; none is ember, red or amber |

**Ember is spent only on:** the primary action (`Create video`, the dock's `New video`, `Save to phone` on Platforms, `Try again` on
the unreachable screen), live work
(the running video's ring, the running timeline block, the playhead while the run is live, `LIVE n`, overall progress while running, a running agent's
progress), the active tab line, and the logo. A second filled ember block on a screen means one of them is wrong. Selection is neutral:
`bg-ink text-canvas` for chips and tabs, `bg-paper` + `ring-line-strong` inside a segmented control. `bg-accent` is not used.

The ember field (`body::before`) is a soft radial bleeding from the top right at 16 % opacity; grain (`body::after`) is an inline SVG
`feTurbulence` at 4 %. Both are fixed under the app. No external request, ever.

## Type

Inter, self-hosted through `@fontsource` (400/500/600/700). Character comes from the scale.

- Screen title: 28px / 1.0, 700, `-0.035em` (22px in the phone top bar) · Video title: 26px, same
- Card title: 14px, 600 · Body: 14px (16px in phone fields, so iOS does not zoom)
- Mono (`--font-mono`, `ui-monospace` stack): every number, duration, state and section label. `label-mono`: 10.5px, uppercase,
  `letter-spacing .12em`, `tabular-nums`. Text is written in sentence case and uppercased by CSS, so tests and screen readers read words.

## Shape and motion

Sharp corners: control 6px, input 10px, card 12px, sheet 16px, frames and posters 6px. Dark surfaces carry no shadow; the one glow is
`shadow-ember` under the primary action.

Motion that carries information only: the playhead and progress widths ease (500ms), the `LIVE` dot breathes (2.4s). Sheet slide, spin
and fade are kept from before. `prefers-reduced-motion` stops all of them.

## Layout

Fixed shell (`components/AppShell.tsx`): only the inner scroll root moves; safe-area insets on the top bar, the tab bar and the sheet;
the tab bar steps aside for the keyboard and the sheet sits above it.

- Phone (< 768px): top bar (title or back, `LIVE n`, the mono usage pill `27% · 5H`), content, four tabs with mono labels and an ember
  line over the active one. The primary action lives in the bottom third: the dock opens the New video sheet.
- Tablet: icon rail. Desktop (≥ 1200px): labelled sidebar (active item `bg-inset` with a 2px ember edge), the production beside the chat,
  the usage footer.

## Components

- `studio/VideoBin.tsx` — the phone Studio's videos as 60px 9:16 frames with a mono state label (`62%`, `NEEDS YOU`, `READY`, `FAILED`,
  `STOPPED`, `QUEUED`); a live frame wears `ring-ember`, the selected frame that is not live a 2px ink border; `+ New` at the
  end. `role="tab"` per frame.
- `studio/NeedsYou.tsx` — up to two other videos waiting for the user, amber, with `Open`.
- `production/Timeline.tsx` + `lib/timeline-view.ts` — the run on one time axis in lanes `V` / `A` / `QC`; widths from real step timings
  (`STEP_DEFAULT_S` where there are none), at least 4 % per block, skipped steps as a 4px mark; the playhead; `● Now · 4:12` with the
  running step's note. Tapping a block scrolls to its row in the step list (`#step-<StepView.id>`).
- `production/VideoHeader.tsx` — title, one mono meta line (state in its tone, voiceover, length window and source), a 3px progress bar.
- `library/Poster.tsx` — a 9:16 frame: the cover (`final` then `draft`), else the derived poster (`lib/poster.ts posterTint`: stable tone,
  Turkish-uppercase initial, length window); a broken cover falls back to it.
- `library/PosterCard.tsx` — one library card: poster with state label and length, product, mono day · length · points; a bottom-left
  `badges` slot that `routes/Library.tsx` fills with the platform badges (YT/IG/TT: uploaded green, old version amber, none dim) and
  Imported. The video-library filter chips sit above the grid, selected chip `bg-ink`.
- `production/ProduceBar.tsx` — the New video form (`bar` / `sheet` / `hero`) with mono section labels, segmented controls, the ember
  focus ring on the product field and the ember `Create video`; `ProduceDock` above the tab bar.
- `shell/LiveIndicator.tsx`, `shell/TabBar.tsx`, `shell/TopBar.tsx`, `shell/SideNav.tsx`, `shell/Sheet.tsx`.

## Voice

English, plain, literal, active. A control says what happens ("New video", "Create video", "Stop production", "Open"). Errors say what
broke and what to do. **No metaphor in copy** — the cutting room is a material, not a vocabulary. Video content, agent output and worker
notes stay Turkish: they are generated data, not interface copy.

## Icon

`apps/web/design/app-icon.svg` is the master: graphite tile, ember light from the top right, an ember 9:16 frame with a play cut, and
three timeline bars crossed by the playhead. `node bin/icons.mjs` renders the PNGs (maskable and Apple variants full bleed, everything
meaningful inside the 80 % safe circle); `public/favicon.svg` is the flat 32px version.
