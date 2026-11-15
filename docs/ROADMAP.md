# Plinth — Product Roadmap

> A living, prioritised plan for improving Plinth. Work through the phases in order — each one ships on its own and leaves the product better than before. Tick items off (`- [x]`) as they land and add a one-line note under **Completed**.

**Strategy in one line:** fix trust → make picks shareable → give people a reason to return → monetise.

**Positioning:** album discovery for people who still listen to whole records (crate-diggers and vinyl collectors), rather than background "music to work to".

**Platform strategy:** one backend, thin clients — the web app first, then an installable PWA, then iOS, and Android only if iOS earns it. Logic lives on the server so each new client is mostly a screen, not a rewrite.

## How to use this file

- Each item has an ID (e.g. `P1.2`) — reference it in commit messages, e.g. `feat(share): add OG tags (P1.2)`.
- Mark an item done by changing `- [ ]` to `- [x]`, then add a short entry to **Completed** at the bottom.
- A phase is done when its **Done when** check passes, not just when its boxes are ticked.
- New ideas go in **Backlog** until they are prioritised into a phase.
- Effort estimates are rough, for one person working evenings.

---

## Phase 0 — Trust fixes (~1 week)

**Goal:** every recommendation looks right and is right.

- [x] **P0.1 Fix tagline typo** — "Music to work too" → "to"; rewrite the tagline to match the positioning above
- [x] **P0.2 Fix cover-art matching** — look up the MusicBrainz release group by artist + title + year, restrict to primary type "Album" (currently _Jeopardy_ by The Sound shows the Jeopardy! TV show artwork)
- [x] **P0.3 Fallback cover art** — a styled placeholder when there's no confident match or Cover Art Archive has no artwork, instead of a wrong image
- [x] **P0.4 Check albums exist** — reject or regenerate any pick that doesn't resolve in MusicBrainz, so made-up albums never reach the user
- [x] **P0.5 Match logging** — log failed matches and regenerations so you can see how often each happens

**Done when:** 50 test runs across genres produce no wrong covers and no albums that don't exist.

---

## Phase 1 — Shareability (2–3 weeks)

**Goal:** every recommendation can bring in a new user.

- [ ] **P1.1 Permalinks** — each result gets its own page (e.g. `/album/the-sound-jeopardy`); store the generated result so the page loads without another API call
- [ ] **P1.2 Preview cards (OG tags)** — shared links show cover, title and a one-line hook (WhatsApp, Bluesky, Slack)
- [ ] **P1.3 Share button** — copy link, plus the native share sheet on mobile
- [ ] **P1.4 Album detail page** — the permalink page shows the tracklist, release info and related albums via MusicBrainz
- [ ] **P1.5 Caching layer (Redis)** — cache MusicBrainz/Cover Art lookups and reuse results for identical inputs and permalink pages, to control API costs and rate-limit risk
- [ ] **P1.6 Versioned API** — serve the routes under `/api/v1` and only add to them from now on, so older clients keep working (an app version stays in people's pockets for years)
- [ ] **P1.7 Server-assembled recommendation** — `/recommend` returns the pick with its artwork and connected artists, so no client has to repeat the recommend → artwork → relations chain that `useRecommendation` runs today
- [ ] **P1.8 Safe retries** — an idempotency key on `/recommend`, so a retry after a dropped connection doesn't pay for a second Claude call

**Done when:** a shared link shows a proper card and opens a working page for someone who has never visited.

---

## Phase 2 — First-run experience (~1 week)

**Goal:** new visitors get a great result within seconds.

- [ ] **P2.1 Vibe presets** — tappable presets in the empty state (e.g. "Rainy Sunday krautrock", "3am post-punk", "Ambient for deep work") that fill in the controls
- [ ] **P2.2 Real example result** — show a real example in the empty result panel instead of placeholder text
- [ ] **P2.3 Rework Artist Essentials** — lead with "Start here" (the two or three key albums and why), add cover art, then the rest of the discography in order

**Done when:** people who arrive from a shared link try at least one recommendation of their own.

---

## Phase 3 — The crate (2–3 weeks)

**Goal:** Plinth learns your taste — the thing a plain chatbot can't do.

- [ ] **P3.1 Feedback on each pick** — Save · Own it · Want on vinyl · Heard it · Not for me
- [ ] **P3.2 Visible Crate tab** — move the library out of the "···" menu into a "Crate" tab with a grid of covers, filterable by status
- [ ] **P3.3 Want list** — "Want on vinyl" items form a persistent wishlist with buy/stream links
- [ ] **P3.4 Feed taste back into the prompt** — never recommend albums you own or rated "Not for me"; weight towards saved and loved albums
- [ ] **P3.5 Insights that describe taste** — a plain-English summary (e.g. "you lean toward early-80s UK post-punk with sparse arrangements") rather than counts

**Done when:** returning users rate at least a few picks per session, and repeat picks drop to near zero.

---

## Phase 4 — Accounts & sync (2–3 weeks)

**Goal:** the crate survives cleared browser data and works across devices.

- [ ] **P4.1 Optional magic-link sign-in** — local storage stays the default, so trying Plinth still needs no account
- [ ] **P4.2 Merge local library on first sign-in** — keep import/export as a backup
- [ ] **P4.3 Rate limits** — a daily cap for anonymous users and a higher one for signed-in users, counted per device or account rather than per IP (mobile carriers put many people behind one IP)
- [ ] **P4.4 Server-side library** — the server database becomes the source of truth for the crate; each client keeps a local copy and syncs through idempotent endpoints with last-modified times and delete markers (last write wins)
- [ ] **P4.5 Token-based auth for every client** — an anonymous device token first, upgraded to an account at sign-in; bearer tokens rather than cookies, so web and native share one path
- [ ] **P4.6 Insights on the server** — compute the stats on the server once the library is synced, so every client shows the same numbers

**Done when:** a user can sign in on their phone and see the crate they built on desktop.

---

## Phase 5 — The vinyl layer (2–3 weeks)

**Goal:** make Plinth the obvious tool for record collectors.

- [ ] **P5.1 Discogs collection import** — automatically marks everything you already own as "Own it"
- [ ] **P5.2 Discogs pricing & pressings** — current marketplace prices, notable pressings and "find a copy" links on album pages
- [ ] **P5.3 "What's missing"** — flag acclaimed albums by artists in your crate that you don't own yet
- [ ] **P5.4 Shareable want list** — export or share "Want on vinyl" (doubles as a gift list)

**Done when:** an imported collection measurably changes what gets recommended.

---

## Phase 6 — Monetisation (ongoing)

**Goal:** cover costs first, then make a profit.

- [ ] **P6.1 Record-shop affiliate links** — on want-list and album pages; research which retailers actually run programmes before building
- [ ] **P6.2 Weekly "dig" email** — three picks based on your crate; free at first, to build the list
- [ ] **P6.3 Plinth+ (~£3–4/month)** — unlimited picks, full taste profile, Discogs sync, a more detailed weekly email; only launch once Phases 3–5 are in place; if it's sold inside the iOS app, Apple's in-app purchase takes 15–30%, so plan the price around that
- [ ] **P6.4 Independent record-shop widget (explore)** — recommends from a shop's own stock; B2B experiment and consultancy showcase

---

## Phase 7 — Platforms: PWA, iOS, Android (ongoing)

**Goal:** the same crate on the web, an installed PWA, an iPhone and (maybe) Android, all served by one backend.

**Order:** the PWA can ship once P1.6 and P1.7 are done. iOS needs Phase 4 first, because a phone app with a local-only crate loses everything when it's deleted. Items can be interleaved with Phases 2–6.

- [ ] **P7.1 Choose the native stack and its reason to exist (explore)** — Expo/React Native (shares the TypeScript), Capacitor (wraps the web app, fastest to the store but feels like a web page) or Swift (best feel, a second codebase). Only go native if at least one thing needs it: MusicKit library access, barcode scanning for the vinyl layer, push notifications or a widget, a share extension, an offline crate
- [ ] **P7.2 API contract (OpenAPI)** — define each request and response once (for example with Zod), generate the OpenAPI spec and typed clients from it, and have the server report a minimum supported app version so old apps can be asked to update. Needed for any non-TypeScript client; skippable if P7.1 picks Expo
- [ ] **P7.3 Repo layout** — `apps/web`, `apps/ios` (later), `packages/contract` and `server/`; keep the server one modular monolith, with no microservices or per-client backends
- [ ] **P7.4 Installable PWA** — a service worker, offline browsing of the crate, cached covers and an install prompt. On iOS, push only works once installed to the home screen, storage can be cleared by the system, and there is no MusicKit or scanning
- [ ] **P7.5 Phone-first Discover flow** — a one-tap path (presets, "surprise me") with the fine controls behind "adjust"; a loading state for the 4–12 second wait that can be cancelled and survives the app going to the background
- [ ] **P7.6 iOS app** — deep links into Apple Music and Spotify, universal links from album permalinks (P1.1), App Attest to check requests come from the real app, haptics, Dynamic Type and VoiceOver. Before submitting: privacy labels (listening preferences go to Anthropic) and a plan for the Monzo tip link, since Apple restricts external payment links
- [ ] **P7.7 Android (explore)** — only if the iOS app shows traction; reuses the generated client and the same backend

**Done when:** a user signed in on the web, the PWA and an iPhone sees the same crate on all three, and an API change doesn't break the previous app version.

---

## Metrics to track throughout

- **Cost per recommendation** (API plus lookups), compared with the cache hit rate
- **Share rate** — links shared ÷ recommendations generated
- **Return rate** — users back within 7 days
- **Crate activity** — feedback taps per session
- **Platform mix** — sessions on the web, the installed PWA and iOS

---

## Backlog (unprioritised)

- [ ] **Keyboard navigation** — quick "next recommendation" via spacebar or arrow keys
- [ ] **Dark/light mode toggle** — theme switching for different environments
- [ ] **Last.fm scrobble data** — import listening history for richer recommendation signals
- [ ] **Play count weighting** — if Apple Music play data is accessible (MusicKit in the iOS app, P7.6), weight towards artists actually listened to
- [ ] **Progressive loading** — stream results in rather than waiting for the full library parse

---

## ✅ Completed

- **"More like this" refinement** — Pivot buttons after each recommendation steer the next suggestion via "more like this" or "something different", feeding the signal into the Claude prompt
- **Similar artist discovery** — Connected artists surface on the recommendation card via MusicBrainz relationships and recording co-credits; clicking a chip seeds Claude to recommend from that artist's catalogue
- **Library stats dashboard** — Dedicated Insights page with summary cards, monthly activity chart, decade/genre/country breakdowns, top artists, and gap observations
- **Reload from history** — History grid cards are clickable; selecting one restores it as the current recommendation with a fresh connected-artists fetch
- **Genre/mood filtering** — Genre, mood, tempo/energy/density sliders, era and discovery controls on the Discover tab

---

_Last updated: November 2026_
