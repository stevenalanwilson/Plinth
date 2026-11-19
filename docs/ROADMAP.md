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

**Order:** P1.6 → P1.1 (server) → P1.7 and P1.1 (client) → P1.5 → P1.4 → P1.2 and P1.3. Don't announce permalinks until the cache (P1.5) has landed.

- [x] **P1.1 Permalinks** — each album gets its own page (e.g. `/album/the-sound-jeopardy`); only picks MusicBrainz confirmed get one, and a slug never changes once issued. Store the album with a short `hook` from Claude (one line that doesn't depend on the user's preferences), so the page loads without calling Claude or MusicBrainz. The MusicBrainz release group ID identifies the album and the slug is its public name
- [x] **P1.2 Preview cards (OG tags)** — shared links show cover, title and a one-line hook (WhatsApp, Bluesky, Slack)
- [x] **P1.3 Share button** — copy link, plus the native share sheet on mobile
- [x] **P1.4 Album detail page** — the permalink page shows the tracklist, release info and related albums via MusicBrainz
- [x] **P1.5 Caching layer (Postgres)** — cache MusicBrainz, Cover Art and iTunes lookups and reuse results for identical inputs and permalink pages, to control API costs and rate-limit risk. Postgres rather than Redis, since Phase 4 needs it anyway; keep the cache behind a small interface so Redis can replace it later. Log cache hits and misses
- [x] **P1.6 Versioned API** — serve the routes under `/api/v1` and only add to them from now on, so older clients keep working (an app version stays in people's pockets for years). No legacy alias is needed while the server and client ship together; keep `/api/health` unversioned, as the Railway health check uses it
- [x] **P1.7 Album resource** — `GET /api/v1/albums/:slug` returns the album with its cover and listening links, and `/recommend` returns the pick with its slug straight away. Every client, including the permalink page, uses that one endpoint instead of repeating the recommend → artwork chain in `useRecommendation`. The cover stays a separate step so the pick appears without waiting for MusicBrainz, and history entries from before the slug keep using the existing artwork endpoint. Validate new endpoints with Zod so the API contract (P7.2) can be generated from them

**Done when:** a shared link shows a proper card and opens a working page for someone who has never visited, and a visit to a permalink makes no Claude calls.

---

## Phase 2 — First-run experience (~1 week)

**Goal:** new visitors get a great result within seconds.

- [x] **P2.1 Vibe presets** — tappable presets in the empty state (e.g. "Rainy Sunday krautrock", "3am post-punk", "Ambient for deep work") that fill in the controls
- [x] **P2.2 Real example result** — show a real example in the empty result panel instead of placeholder text
- [x] **P2.3 Rework Artist Essentials** — lead with "Start here" (the two or three key albums and why), add cover art, then the rest of the discography in order

**Done when:** people who arrive from a shared link try at least one recommendation of their own.

---

## Phase 3 — The crate (2–3 weeks)

**Goal:** Plinth learns your taste — the thing a plain chatbot can't do.

- [x] **P3.1 Feedback on each pick** — Save · Own it · Want on vinyl · Heard it · Not for me
- [x] **P3.2 Visible Crate tab** — move the library out of the "···" menu into a "Crate" tab with a grid of covers, filterable by status
- [x] **P3.3 Want list** — "Want on vinyl" items form a persistent wishlist with buy/stream links
- [x] **P3.4 Feed taste back into the prompt** — never recommend albums you own or rated "Not for me"; weight towards saved and loved albums
- [x] **P3.5 Insights that describe taste** — a plain-English summary (e.g. "you lean toward early-80s UK post-punk with sparse arrangements") rather than counts

**Done when:** returning users rate at least a few picks per session, and repeat picks drop to near zero.

---

## Phase 4 — Accounts & sync (2–3 weeks)

**Goal:** the crate survives cleared browser data and works across devices.

- [x] **P4.1 Optional magic-link sign-in** — local storage stays the default, so trying Plinth still needs no account
- [x] **P4.2 Merge local library on first sign-in** — keep import/export as a backup
- [x] **P4.3 Rate limits** — a daily cap for anonymous users and a higher one for signed-in users, counted per device or account rather than per IP (mobile carriers put many people behind one IP)
- [x] **P4.4 Server-side library** — the server database becomes the source of truth for the crate; each client keeps a local copy and syncs through idempotent endpoints with last-modified times and delete markers (last write wins)
- [x] **P4.5 Token-based auth for every client** — an anonymous device token first, upgraded to an account at sign-in; bearer tokens rather than cookies, so web and native share one path
- [ ] **P4.6 Insights on the server** — compute the stats on the server once the library is synced, so every client shows the same numbers. **Not done, on purpose:** the browser works the stats out from the crate, and a synced crate is the same on every device, so every client already shows the same numbers. Move this to the server when a client that can't do the sums (the iOS app, P7.6) needs it
- [x] **P4.7 Safe retries** — an idempotency key on `/recommend`, kept briefly on the server, so a retry after a dropped connection (common on mobile) doesn't pay for a second Claude call

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
- [ ] **P7.2 API contract (OpenAPI)** — define each request and response once with Zod (new endpoints from P1.7 already do), generate the OpenAPI spec and typed clients from it, and have the server report a minimum supported app version so old apps can be asked to update. Needed for any non-TypeScript client; skippable if P7.1 picks Expo
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
- **Album pages and permalinks (P1.1, P1.4, P1.7)** — Every pick MusicBrainz confirms is stored with a permanent slug and a one-line hook, and gets a page at `/album/:slug` with the cover, release details, formats, the tracklist numbered as on the record and the artist's other albums, loaded through one cached `GET /api/v1/albums/:slug`
- **Shareable links (P1.2, P1.3)** — Album links carry the tags WhatsApp, Slack and Bluesky read to build a preview card (the server adds them, and a Plinth card stands in when there's no cover), and a Share button copies the link or opens the share sheet on a phone
- **Lookup cache and versioned API (P1.5, P1.6)** — MusicBrainz, iTunes and verified Artist Essentials lookups are cached in Postgres, the API lives under `/api/v1`, and the rate limits now count each visitor behind Railway's proxy
- **First-run example and vibe presets (P2.1, P2.2)** — A first-time visitor sees a real stored pick (cover, one-line hook and a link to its page, no Claude call) before asking for one, with six vibe presets that fill in the vibe box and every control; on a phone the example comes before the controls
- **Artist Essentials leads with where to start (P2.3)** — The two or three albums to begin with come first, with covers and reasons, then the artist's studio albums in order; the list is checked against MusicBrainz, and bootleg-only releases are left out of the discography
- **Shared links lead to a pick (Phase 2)** — Album pages offer "Find me something like this", which opens Discover and starts a "more like this" pick on that album at once
- **Answers on each pick, and a Crate tab (P3.1, P3.2)** — Every pick can be marked Save, Own it, Want on vinyl, Heard it or Not for me, with a badge on rated albums; the Crate tab shows the library as a grid of covers filterable by answer, holds Import, Export and Clear (Clear now asks for a second tap, as does removing a rated album), and keeps every rated album for good, while picks nobody rated keep the old 50-pick, 90-day limits. On a phone the cards keep the cover clear, with links behind a tap
- **Want list (P3.3)** — The Want on vinyl filter shows a list, newest first, with Apple Music, Spotify and Discogs links for each album and a Got it button that moves it to Own it
- **Taste feeds the picks (P3.4)** — An album the listener has answered is never picked again (checked in code for up to 500 albums, not left to the prompt), and the albums they own, want or saved give picks a gentle lean towards their taste, while the ones marked Not for me are steered away from
- **Taste summary (P3.5)** — Insights opens with a plain-English paragraph about the listener's taste, worked out in the browser from the genres, decades and countries of their albums, counting the ones they own or want most; it can't speak to tempo or density, because picks don't record the sliders they were made with. The numbers behind it are tunable: see `docs/taste-summary.md`
- **A token for every device (P4.5)** — The first pick or sign-in gives a browser a random device token, kept only in a scrambled form on the server and sent as a bearer token, never a cookie. A browser that can't keep it stays anonymous and is counted by a hash of its address. Signing in links the device to an account, so web and native clients share one path. Request logs no longer write the `Authorization` header (they had been, since the tokens arrived)
- **Safe retries (P4.7)** — A pick carries an `Idempotency-Key`. If the connection drops, the browser asks once more with the same key and gets the same pick back within ten minutes, without a second Claude call; a repeat that arrives while the first is still running waits for it
- **Daily limits (P4.3)** — A visitor gets 25 picks a day (a device, or an address for a browser with no token), a signed-in account 100 shared by all its devices, and everyone together 1000, resetting at midnight UTC. All three are set on the server without a deploy, and 0 pauses all picks. A visitor turned away sees a plain message and is not counted as a pick
- **Optional sign-in (P4.1)** — A link emailed through Resend signs a browser in; it works once, for 15 minutes, and opens a page that waits for a tap because mail programs open links to look at them. The reply is the same for known and unknown addresses. Signing out and deleting the account are in the header menu, and `/privacy` says what is kept. Without the email settings in production, sign-in switches itself off and the log says what is missing
- **The crate follows the account (P4.4)** — A signed-in browser saves its crate to the account when it changes, when the page comes back into view, and every minute, and takes what other devices changed. The newer answer to an album wins, and a removal is remembered for 60 days so other devices drop the album. Signing out saves first, warns before losing anything unsaved, then takes the crate off that device; deleting the account removes the saved crate but leaves the device's alone. Known edges: a removed album stays removed if an old backup is re-imported, one album under two spellings can be two rows, and a new device downloads the whole crate at once
- **Keeping the crate (P4.2)** — Signing in adds the browser's crate to the account at once. Someone who isn't signed in and has an answered album sees a note on the Crate page saying it only lives in this browser, with Sign in and Not now; Import and Export stay as the backup

---

_Last updated: November 2026_
