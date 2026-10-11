# Mobile PWA — summary

Branch `mobile-pwa` (worktree `../VideoGen-mobile`). Plans: `docs/superpowers/plans/2026-10-11-mobile-pwa.md` (design and research) and `2026-10-11-mobile-pwa-implementation.md` (tasks). Prototype: https://claude.ai/artifact/FJq8HJxJxMn8bYoRuKmcvV

## What changed

- **One responsive app, dark only.** Phone (< 768 px): top bar with a status pill, content, four tabs (Studio, Chat, Library, Settings). Tablet: icon rail. Desktop (≥ 1200 px): labelled sidebar, the Studio's production and chat side by side, the usage footer.
- **"Night parchment" theme.** Warm graphite surfaces, parchment text, the brand teal for fills and a lighter teal for focus, links and progress. Tokens live in `apps/web/src/styles/theme.css`.
- **English interface.** Every screen, status, label, date and number format, and the API's error messages. Shared labels (`packages/shared`) are untouched because the agents and the TikTok caption read them; the web maps them by id (`apps/web/src/lib/i18n.ts`). Video content, agent output and worker notes stay Turkish.
- **Phone screens.** The New video form is a sheet from the docked box (or the first screen when there are no videos); video chips pick the Studio video; Chat is its own tab; library detail has a back bar and an Open in Studio action; Compare defaults to A/B under 600 px; Settings is a grouped list with sub-pages, Audit log and Assets sit under it; audit filters open in a sheet.
- **PWA.** Manifest with shortcuts, icons from `docs/mobile-pwa/icon/app-icon.svg` (`node bin/icons.mjs`), a flat favicon, a service worker that caches only the app shell (API, `/events` and media Range requests bypass it), a "new version" prompt, a "can't reach the server" screen, `no-cache` for the page/worker/manifest and `immutable` for hashed assets, and a live stream that reconnects at once when the app comes back to the front.
- **Tailscale.** The API accepts the exact `VG_TAILNET_HOST` with a `Tailscale-User-Login` in `VG_TAILNET_USERS`, and tailnet writes only from that origin (`apps/api/src/guard.ts`). `bin/tailnet.mjs` sets up Serve; the launcher prints the phone address and refuses to start with Funnel on. TikTok account connection stays on the computer (409 `connect_on_host` over the tailnet). Check results: `docs/mobile-pwa/tailscale-check.md`.

## Known limits

- Server-written prose stays Turkish: worker step notes and status notes, agent summaries and findings, and a few messages that come from `packages/shared`/`packages/db` (duration window, publish checklist reasons, attribution lines). Moving the agents to English for user-facing text is decision K5 in the design plan.
- Web Push is not built (decision K3). The app icon badge counts videos that need you or failed (`apps/web/src/lib/badge.ts`); it updates while the app is open.
- Remotion's live draft player on iPhone has not been measured on a real device yet (risk R2).
