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
- [x] **P2.2 Real example result** — show an example in the empty result panel instead of placeholder text (first a real stored pick, now an animated demo of how Plinth works)
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
- [ ] **P6.2 Weekly "dig" email** — three picks based on your crate; free at first, to build the list. When it is built, offer it as an unticked opt-in, apart from the sign-in email, in the invite shown after someone shares a top 3 (P8.6), since a sign-in email is not marketing consent
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

## Phase 8 — Shareable lists (~2–3 weeks for the MVP)

**Goal:** people post their taste, and every post brings in a new visitor.

**MVP:** one list per person, "My top 3 albums of all time", that anyone can make and share without an account.

**Order:** P8.1 → P8.2 → P8.3 and P8.4 → P8.5 → P8.6. It doesn't depend on Phases 5–7 and can be interleaved with them. Themed lists (P8.7) wait until the top 3 shows people share it.

- [x] **P8.1 Album search** — `GET /api/v1/albums/search?q=` searches MusicBrainz release groups of primary type Album that have an official release, so albums that only ever came out as bootlegs or promos are left out, and returns the MusicBrainz id, title, artist and year of up to eight albums. The cover isn't in the answer: the builder looks it up from the artist and title, as it does for any pick. Validated with Zod and rate-limited like the other routes. MusicBrainz ranks by text match alone, so a bare title such as "thriller" has many equally good hits; the builder (P8.3) should ask for the artist too
- [x] **P8.2 Lists in the database and API** — `lists` and `list_items` tables and `/api/v1/lists` (`GET` your own, `POST` to make one, `GET`/`PUT`/`DELETE` `/lists/:id`; reading is open to anyone with the code). A list has an owner (the device token, moving to the account on sign-in as the crate does), a `kind` (`top`), a `qualifier` (`all-time`) and a `size` (3), so genre, month and year lists later need no migration; there is one list per owner, kind and qualifier. A request names albums by MusicBrainz id only: the server asks MusicBrainz what each is and stores it as a real Plinth album, so it has a permalink and a cover and nobody can save a made-up one. The id is a 10-character code that can't be guessed. Deleting a list, an account, or a device not seen for a year removes it. If a device's list and the account's collide on sign-in, the one changed most recently is kept
- [x] **P8.3 Top 3 builder** — **My top 3** sits under Crate, next to My crate and Insights. It has three ordered slots; you search for any album or artist (the crate's albums are offered first, at once, and the rest come from MusicBrainz as you type); move albums with buttons, or drag them with a mouse; remove them; and press Save. The same album can't be in two slots, and a part-filled list can be saved. It works by keyboard (focus follows an album as it moves) and on a phone. Nothing is saved until you press Save, so a list can be built over several visits. Sharing it, and only once it has three, comes with P8.4 and P8.6
- [x] **P8.4 Public list page with preview tags** — `/list/:id` shows the three covers large, with title, artist, year and the same icon links as an album page, plus **Make your own top 3** (opens the builder) and **Find me something like these**, which starts a Discover pick from a vibe that names the three albums in order (the owner sees **Edit my top 3** in place of the first). The server adds the preview tags as it does for album pages; they use the Plinth card until the list has its own picture (P8.5). The page is open to anyone with the link but isn't listed: it says `noindex` in its head and in `X-Robots-Tag`. A list is only shared once it has all three albums, so one still being made shows to its owner alone and is a 404 for everyone else, previews included. Editing a list changes the same link. Each view is logged as found or not and crawler or person, without the list's code
- [x] **P8.5 Generated preview image** — a 1200×630 picture of the three covers in order, numbered, with the list's title and the Plinth name in the site's own gold and serif, at `/api/v1/lists/:id/image?v=<hash>`; the list page's preview tags point at it, so a shared link shows a card worth posting on WhatsApp, Bluesky and Slack. It is drawn with satori and resvg, with the font (DM Serif Display, from `@fontsource`) bundled, so it doesn't depend on the server having any fonts; checked in the production Alpine image. It is a JPEG, not a PNG: real covers made a 700 KB PNG and WhatsApp drops previews much above 300 KB, while the JPEG is about 130 KB. Covers come through the same trusted-host fetch as the cover proxy; an album with no cover, or one that can't be drawn, gets a placeholder (a record on a dark sleeve) and the rest are kept. The hash in the address covers the albums, their order and their covers, so a platform fetches a fresh picture after an edit; an old or missing hash is redirected to the current address, so a card shared long ago still shows the list as it is. Pictures are kept in memory by hash (the most recent 40) and a picture asked for many times at once is drawn once. If it can't be drawn the answer is the Plinth card, and the next request tries again. The first drawing takes 2–4 seconds, almost all of it fetching covers
- [x] **P8.6 Share, sign-in invite, logging and privacy page** — **Share my top 3** sits beside Save once the list is saved and has all three albums (with unsaved changes it says to save first, since the link shows what is saved), and a **View your page** link shows how it looks to others; the list page has a Share icon for anyone, so a list can be passed on. It copies the link, or opens the share sheet on a phone. A tap tells the server (so shares can be counted) and asks for the list's picture, so it is drawn before a platform comes for it; neither is waited for and neither can stop the sharing. The first time someone who isn't signed in shares, they're invited to sign in so the list is kept, after sharing and never before (**Sign in** or **Not now**, which is remembered). The weekly dig email isn't offered yet: there is no email to opt in to until P6.2, which now carries that opt-in. Logged, as counts only and never which list or whose: lists created, edited, deleted and shared, plus views and pictures from earlier steps; a visit that began on a list page is counted as `shared-list`, so list link conversion can be read (see `docs/metrics.md`). `/privacy` now covers lists. **Not built:** the standing note on the builder, like the crate one, for someone who said Not now and still has a list kept only with their browser
- [ ] **P8.7 Themed lists (explore)** — **Built so far: top 3s of a genre, free.** **Your lists** (a main menu item beside **Your Crate**; it began as **My top 3** under Crate) shows the top 3 of all time and one for each genre someone has started, with how far along each is, and a row of the genres that have no list yet. A genre is one of the twelve already used for preferences (that list moved to `shared/types.ts`, since the server now checks qualifiers against it), and a person can have the one list of all time plus one per genre, each with its own link, page, picture, Share button and title ("My top 3 hip-hop albums"). The builder is the same one, with **← My lists** to go back, and **Make your own top 3** on a genre's page opens the builder for that genre. No migration was needed (`qualifier` is `genre:hip-hop`, `genre:drum-and-bass` and so on, validated in `shared/types.ts`). There is no limit and no payment: Plinth+ (P6.3) doesn't exist yet. **Not built:** albums of the month or year (a reason to return each month; needs a time qualifier and a prompt to come back), lists longer than 3 (the page and picture are drawn for three), and anything that gates a list behind Plinth+. Wait for the numbers on how many genre lists people make and share (see `docs/metrics.md`) before choosing between those
- [x] **P8.8 Image for Stories** — **Save for Stories** sits beside Share in the builder (once the list is saved and full) and on a finished list's page for its owner. It saves a 1080×1920 JPEG at `/api/v1/lists/:id/story?v=<hash>`, drawn like the preview card (same fonts, colours, covers and placeholder, kept in memory by hash, redirected to the current address if the hash is old) but tall: the title under the Plinth name, the three covers stacked and numbered with each album's title and artist beside them (the picture has to say what the albums are, since a Story can't preview a link), and `plinth.rocks` at the foot. Instagram's own controls cover the top and bottom of a Story, so nothing important is drawn there. On a phone it goes through the share sheet as a file, straight to Instagram or Photos; elsewhere it downloads. If the share sheet refuses because the picture took longer than the tap allows, the button asks for one more tap and shares the picture it already fetched (not tried on a real iPhone here). If it can't be drawn the answer is a 502 and the person is told to try again, never the landscape Plinth card. Logged without which list or whose: `list story drawn` and `list story served`, so Stories use can be read against shares (see `docs/metrics.md`). The privacy page mentions it. **Not built:** a link sticker or QR code on the picture (a Story can't carry a clickable link from a saved file, so the foot says the address), other sizes, and a Story for a list that isn't yours

**Done when:** a shared link shows a card with the three covers and opens a working page for someone who has never visited, and some of those visitors make a pick of their own.

---

## Metrics to track throughout

- **Cost per recommendation** (API plus lookups), compared with the cache hit rate
- **Share rate** — links shared ÷ recommendations generated
- **Return rate** — users back within 7 days
- **Crate activity** — feedback taps per session
- **Platform mix** — sessions on the web, the installed PWA and iOS
- **List share rate** — lists shared ÷ lists made (from Phase 8)
- **Lists per new visitor** — new visitors who go on to make a top 3
- **List link conversion** — visits from a list link that go on to make a pick
- **Outbound clicks on list pages** — listening-link clicks per page view, once clicks are logged, to judge affiliate links (P6.1) before building them

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
- **First-run demo and vibe presets (P2.1, P2.2)** — A first-time visitor sees a short animated demo in the empty result panel: a vibe is typed, a genre and a mood are picked, the button is pressed and a record turns up with its real cover, then a "Find your vibe" page closes it. The rest of the site is dimmed while it plays; it ends on its own, on Skip demo, or at the first click or key press, and it never replays on a later visit (people who ask for reduced motion get a still version). It replaced the first version, a real stored pick, and the server's `/example-album` endpoint went with it. Start from a vibe is always shown and offers a random six of 18 presets, a different six on each load, that fill in the vibe box and every control; on a phone the demo comes before the controls on a first visit
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
- **The crate follows the account (P4.4)** — A signed-in browser saves its crate to the account when it changes, when the page comes back into view, and every 15 seconds, and takes what other devices changed. The newer answer to an album wins, and a removal is remembered for 60 days so other devices drop the album. Signing out saves first, warns before losing anything unsaved, then takes the crate off that device; deleting the account removes the saved crate but leaves the device's alone. Known edges: a removed album stays removed if an old backup is re-imported, one album under two spellings can be two rows, and clocks on devices are trusted. A new device is sent a big crate 500 albums at a time, and an account holds at most 5,000 albums and removals together, after which it is told the crate is full until some are removed
- **Keeping the crate (P4.2)** — Signing in adds the browser's crate to the account at once. Someone who isn't signed in and has an answered album sees a note on the Crate page saying it only lives in this browser, with Sign in and Not now; Import and Export stay as the backup
- **One title row on every page, and a Crate submenu** — Discover, Your Crate, Insights and Artist Essentials each open with the same title row and a dotted line under it, below a line under the header, so the pages line up. Crate and Insights share one row, with My crate, Insights, Import, Export and Clear crate in the main menu's style, so the menu stays when switching between the two. Sign in is styled like the other menu items
- **One action bar on a pick** — The result card had two unrelated menus, three tall service buttons and the answers as round pills. It now has one bar: the five answers as a joined row, then square icon buttons for Apple Music, Spotify, Discogs and Share. The album page and the history cards' hover panel use the same icons; on a phone the history panel is a 2×2 grid of 44px buttons. Each icon has a tooltip and a screen-reader name, and Apple Music is gold when it links straight to the album
- **The result card no longer spins in Safari** — The loading panel's spinner was being reused as the card's artwork row, and Safari kept it rotating once a pick arrived. Loading, error and result now each get their own element
- **Album search (P8.1)** — `GET /api/v1/albums/search?q=` finds albums by title or artist as you type, leaving out ones that only ever came out as bootlegs or promos, and says plainly when the search is unavailable rather than answering with no results. It is the first piece of the shareable top 3 (Phase 8)
- **Lists in the database and API (P8.2)** — A person can make, change and delete a list of albums (the top 3 to start with) and anyone with its code can read it. It belongs to the device until they sign in, then moves to their account. The builder and the list page come next (P8.3, P8.4)
- **Top 3 builder (P8.3)** — Under Crate, **My top 3** lets someone search for albums (their crate first), put three in order, and save the list to the server. It's the first thing in Phase 8 a person can see; the public page and sharing come next (P8.4, P8.6)
- **Public list page (P8.4)** — A finished top 3 has a page at `/list/:id` that anyone with the link can open: three large covers in order, listening links, and ways to make their own top 3 or get a pick like these albums. Its link previews with the list's title and albums. Sharing it from the app comes next (P8.6)
- **Preview picture for a list (P8.5)** — A shared top 3 now previews with a picture of its three covers, numbered, with its title and the Plinth name. It is made on demand and kept, and changes by itself when the list does
- **Sharing a top 3 (P8.6)** — A finished top 3 has a Share button in the builder and on its page, which copies the link (or opens the share sheet) and gets its preview picture ready. Someone who isn't signed in is invited to sign in after sharing, so the list is kept. Shares, and visits that began on a shared list, can now be counted from the logs, and the privacy page covers lists. That completes the top 3 MVP
- **Top 3s of a genre (P8.7, part)** — **Your lists** shows a person's top 3 of all time and a top 3 for each genre they start (hip-hop, jazz and the other ten), each with its own link, page, picture and Share button. Free for now; months, years and longer lists are still to come
- **Menu wording (after P8.8)** — The main menu now reads Discover, **Your Crate**, **Your lists** and Artist Essentials: the lists left the Crate submenu, which is back to My crate and Insights, and have a page of their own
- **Pictures for Stories (P8.8)** — A finished top 3 can be saved as a tall 1080×1920 picture, with each album named beside its cover, to post on Instagram Stories and the like, where a link shows no preview. On a phone it goes straight to the share sheet; elsewhere it downloads

---

_Last updated: November 2026_
