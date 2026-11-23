# Plinth

_Whole records, picked for you._

Plinth recommends albums for people who still listen to whole records. Tell it what you're in the mood for — a genre, a feeling, a tempo, an era — and it picks one album worth your evening, with the cover, a short reason it fits, and links to listen or find a copy.

Powered by Claude, MusicBrainz and the iTunes Search API.

> **Where it's going:** shareable album pages, a crate that learns your taste, a vinyl layer for collectors, and apps for the phone. See the [roadmap](docs/ROADMAP.md).

---

## What it does

### Recommendations

- **One album at a time** — Set genres, moods, tempo, energy, density and era, or just describe a vibe in your own words. Claude picks a full album that fits and says why.
- **Steer the next pick** — After each recommendation, choose _More like this_ or _Something different_ without touching the controls.
- **Follow the connections** — Each pick shows related artists (collaborators, side projects, former members, recording co-credits) from MusicBrainz. Click one to get a pick from that artist's catalogue.

### Picks you can trust

Language models sometimes invent albums and mix up covers, so every pick is checked before you see it:

- **It has to exist.** Each recommendation is matched to a real album on MusicBrainz. If it isn't found, Plinth asks Claude for another.
- **The cover has to be right.** Artwork comes only from a confident match, and Plinth shows a styled placeholder sleeve instead of a wrong image.
- **No repeats.** Albums you've already been shown aren't suggested again.

### Album pages and sharing

Every pick MusicBrainz confirms gets its own page, such as `/album/the-sound-jeopardy`, with the cover, a one-line hook, the release details, the tracklist (numbered as on the record, so `A1` and `B3` on vinyl), the formats it has come out on and the artist's other albums. A **Share** button copies the link, or opens the share sheet on a phone, and the link shows a proper preview card in WhatsApp, Slack, Bluesky and the like.

### Artist Essentials

Name an artist and get the albums to start with, each with a reason. Every album is checked against that artist's real catalogue.

### Your history

- Recommendations are saved in your browser and survive page reloads.
- Click any earlier pick to bring it back, along with its connected artists.
- History keeps the latest 50 entries, and entries older than 90 days are removed.
- **Export** your history as a JSON file and **import** it on another browser or from a friend. Duplicates are skipped and existing entries win.

### Insights

A page that breaks down what you've been recommended: total albums, unique artists, decades spanned, countries explored, a monthly activity chart, decade, genre and country breakdowns, top artists, and gaps (genres or decades you haven't explored).

### Preferences

All of these are optional, and any combination works.

| Preference                   | What it does                                                                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Genres**                   | Multi-select genre pills (Electronic, Post-punk, Ambient, Indie, Krautrock, Drum & Bass, Art Rock, Jazz, Folk, Metal, Hip-hop, Classical) |
| **Mood**                     | Multi-select mood cards (Late night, High energy, Chill, Focus, Melancholic, Euphoric, Hopeful)                                           |
| **Tempo**                    | Slider 1–10 (Slow → Fast)                                                                                                                 |
| **Energy**                   | Slider 1–10 (Mellow → Intense)                                                                                                            |
| **Density**                  | Slider 1–10 (Sparse → Dense)                                                                                                              |
| **Era**                      | Segmented control: Pre-80s / 80s–90s / 00s–10s / Recent / Any                                                                             |
| **Include familiar artists** | Allow well-known artists in recommendations                                                                                               |
| **Prioritise obscure picks** | Favour underground and lesser-known releases                                                                                              |
| **Stay focused**             | Keep recommendations close to your stated preferences                                                                                     |

---

# For developers

## Stack

| Layer             | Tech                                                                       |
| ----------------- | -------------------------------------------------------------------------- |
| Frontend          | React 18, TypeScript, Vite                                                 |
| Backend           | Node.js, TypeScript, Express                                               |
| AI                | Anthropic Claude (Sonnet 4.6) — see [the model decision](docs/adr)         |
| Album matching    | MusicBrainz release-group search, restricted to primary type "Album"       |
| Artwork           | Cover Art Archive by release group; iTunes only for an exact match         |
| Music links       | iTunes Search API (Apple Music), Spotify, Discogs                          |
| Connected artists | MusicBrainz relationships + recording co-credits                           |
| Storage           | PostgreSQL (`pg`, plain SQL migrations in `server/migrations`)             |
| Tests             | Vitest, React Testing Library                                              |
| Tooling           | ESLint, Prettier, Husky + lint-staged, Conventional Commits                |
| Hosting           | Docker; the production image serves the API and the built client (Railway) |

## How a recommendation is made

1. The client sends your preferences and the albums already suggested to `POST /api/v1/recommend`.
2. The server asks Claude for a pick, then looks it up on MusicBrainz (one request per second, shared across all callers, with retries when MusicBrainz is busy).
3. A pick that isn't found, or is a duplicate, is regenerated, up to three attempts. If MusicBrainz is down, the pick is returned unchecked rather than failing.
4. A confirmed pick is saved to the `albums` table with a permanent slug (e.g. `the-sound-jeopardy`) and a one-line `hook` that doesn't depend on your preferences. These will power shareable album pages. Unchecked picks get no slug.
5. The client then fetches the cover (`GET /api/v1/artwork`, using the matched release group) and connected artists (`GET /api/v1/artist-rels`). Covers are served through `/api/v1/image`, which only fetches from trusted hosts.

Structured logs (pino) record matches, regenerations and artwork sources, so you can see how often each happens.

Slow, rate-limited or paid lookups are cached in the `cache_entries` table (in memory when there's no database), so a repeat costs nothing and skips the MusicBrainz queue:

| What                              | Kept for                                                              |
| --------------------------------- | --------------------------------------------------------------------- |
| MusicBrainz lookups by ID         | 30 days                                                               |
| MusicBrainz searches and browses  | 7 days (1 day when they found nothing, so a new artist is found soon) |
| iTunes searches                   | 1 day                                                                 |
| Artist Essentials, by artist name | 30 days, only when every album was matched in MusicBrainz             |

Album pages (`/album/:slug`) are served by the server with that album's title, description and cover in the page head, because link-preview crawlers don't run JavaScript. The cover is served through `/api/v1/image` on this site, and an album with no cover gets `og-default.png` (source: `docs/og-default.svg`). Set `PUBLIC_URL` in production, as previews need absolute URLs. This only applies to a production build; in development Vite serves the page, so there are no tags.

Failures are never cached, a cache error just means a miss, and expired rows are removed hourly. Each lookup logs `cache hit` or `cache miss` with a `namespace`, so hits ÷ (hits + misses) is the hit rate.

The API is versioned under `/api/v1`. Only add to it — released apps keep calling old versions for years. `/api/health` stays unversioned because the Railway and Docker health checks use it.

## Setup

### Prerequisites

- Node.js 20+
- Docker + Docker Compose (for the full stack)
- An [Anthropic API key](https://console.anthropic.com/)

### 1. Clone and install

```bash
git clone <repo-url>
cd plinth
npm install
cd server && npm install && cd ..
cd client && npm install && cd ..
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in your keys. See [Environment variables](#environment-variables) below.

### 3. Run

**With Docker (recommended):**

```bash
docker-compose up --build
```

**Locally (two terminals):**

```bash
# Terminal 1 — server (port 3001)
cd server && npm run dev

# Terminal 2 — client (port 5173)
cd client && npm run dev
```

Without `DATABASE_URL` the server keeps albums in memory, which is fine for most work. To use Postgres locally, run `docker compose up db` and set `DATABASE_URL` as shown in `.env.example`. Migrations run when the server starts.

Then open [http://localhost:5173](http://localhost:5173).

## Environment variables

| Variable              | Required | Default                     | Description                                                                                    |
| --------------------- | -------- | --------------------------- | ---------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`   | ✅       | —                           | Anthropic API key — powers album recommendations                                               |
| `PORT`                |          | `3001`                      | Server port                                                                                    |
| `CORS_ORIGIN`         |          | `http://localhost:5173`     | Allowed client origin                                                                          |
| `TRUST_PROXY`         |          | `1` in production, else `0` | Number of proxies in front of the server, so rate limits count each visitor, not the proxy     |
| `PUBLIC_URL`          | In prod  | the request's address       | Public address of the app, for shared-link preview cards                                       |
| `DATABASE_URL`        | In prod  | — (in memory)               | Postgres connection for stored albums; the server won't start without it in production         |
| `MUSICBRAINZ_CONTACT` |          | —                           | Email or URL sent in the MusicBrainz User-Agent, as their etiquette asks                       |
| `VITE_API_URL`        |          | `''` (same origin)          | Client → server base URL (local dev without Docker)                                            |
| `VITE_MONZO_URL`      |          | —                           | Monzo.me link shown in the footer. In production, set it on the service that serves the app    |
| `VITE_FEEDBACK_EMAIL` |          | —                           | Email for the footer's feedback link. In production, set it on the service that serves the app |

**Getting your Anthropic API key**

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Sign in or create an account
3. Navigate to **API Keys** and click **Create Key**
4. Copy the key into `ANTHROPIC_API_KEY`

## Development

```bash
# Run all tests
npm run test

# Run tests with coverage
npm run test:coverage

# Lint
npm run lint

# Type-check
npm run typecheck

# Format
npm run format
```

Database integration tests run only when `TEST_DATABASE_URL` is set; CI provides one. Each run uses a throwaway schema, so it can point at your local database:

```bash
docker compose up db
TEST_DATABASE_URL=postgres://plinth:plinth@localhost:5432/plinth npm run test --prefix server
```

Tests live alongside source files (`foo.ts` → `foo.test.ts`). A pre-commit hook runs Prettier, ESLint, a type check and the tests related to staged files, and CI runs lint, type check and the full test suite on pull requests.

Commits follow [Conventional Commits](https://www.conventionalcommits.org/), with the roadmap item where there is one, e.g. `feat(share): add OG tags (P1.2)`.

## Project structure

```
/
├── client/          # React frontend (Vite)
│   └── src/
│       ├── components/      # Shared UI: PlaceholderSleeve, ServiceLinks
│       ├── features/        # preferences, recommendation, history, essentials, stats
│       ├── hooks/           # useRecommendation — all state and history logic
│       ├── services/        # apiClient, libraryExport
│       └── types/
├── server/          # Express backend
│   └── src/
│       ├── controllers/     # Thin HTTP handlers
│       ├── services/        # recommendation, albumMatch, artwork, artistEssentials, artistRelations
│       ├── repositories/    # Claude and MusicBrainz clients, album storage, lookup cache
│       ├── db/              # Connection pool and migrations runner
│       ├── utils/           # Name matching, timeouts
│       └── routes/
│   └── migrations/  # Plain SQL, applied in filename order at startup
├── shared/          # Types shared between client and server
├── docs/            # ROADMAP.md, decision records, tuning notes, and how to read the metrics
└── docker-compose.yml
```
