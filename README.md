# Plinth

_Music to work to._

Plinth is a fullstack web app that recommends albums based on your taste preferences. Describe what you want to hear — by genre, mood, tempo, era, or energy — and Claude finds something worth listening to. Each recommendation comes with album artwork, streaming links, and a network of connected artists to explore further.

Powered by Claude AI, MusicBrainz, and the iTunes Search API.

---

## Features

### Recommendations

- **Preference-driven suggestions** — Set genres, moods, tempo, energy, density, and era. Claude uses these signals to recommend albums that fit.
- **Pivot controls** — After each recommendation, choose _More like this_ or _Something different_ to steer the next suggestion without adjusting preferences manually.
- **Seed by artist** — Click any connected artist chip to ask Claude to recommend from that artist's catalogue specifically.

### Connected Artists

Each recommendation surfaces a network of related artists via MusicBrainz — collaborators, side projects, former members, and recording co-credits. Clicking a chip seeds the next recommendation.

### History

- Recommendations are saved in `localStorage` and survive page reloads.
- Click any previously suggested album in the history grid to restore it as the current recommendation.
- History is capped at 50 entries and entries older than 90 days are pruned automatically.

### Library Export & Import

- **Export** — Download your recommendation history as a versioned JSON file (`plinth-library-YYYY-MM-DD.json`).
- **Import** — Load a library file from another session or a friend. Duplicate albums are deduplicated automatically; existing entries take precedence.

### Insights

A dedicated page breaking down your recommendation history:

- Summary stats — total albums, unique artists, decades spanned, countries explored
- Monthly activity chart
- Decade, genre, and country breakdowns
- Top artists by recommendation count
- Gap observations (e.g. genres or decades underrepresented in your history)

---

## Preferences

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

All preferences are optional — the app works with any combination.

---

## Stack

| Layer             | Tech                                              |
| ----------------- | ------------------------------------------------- |
| Frontend          | React 18, TypeScript, Vite                        |
| Backend           | Node.js, TypeScript, Express                      |
| AI                | Anthropic Claude (Haiku 4.5)                      |
| Artwork           | MusicBrainz + Cover Art Archive (iTunes fallback) |
| Music links       | iTunes Search API (Apple Music), Spotify, Discogs |
| Connected artists | MusicBrainz relationships + recording co-credits  |

---

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

Then open [http://localhost:5173](http://localhost:5173).

---

## Environment variables

| Variable            | Required | Default                 | Description                                         |
| ------------------- | -------- | ----------------------- | --------------------------------------------------- |
| `ANTHROPIC_API_KEY` | ✅       | —                       | Anthropic API key — powers album recommendations    |
| `PORT`              |          | `3001`                  | Server port                                         |
| `CORS_ORIGIN`       |          | `http://localhost:5173` | Allowed client origin                               |
| `VITE_API_URL`      |          | `''` (same origin)      | Client → server base URL (local dev without Docker) |

**Getting your Anthropic API key**

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Sign in or create an account
3. Navigate to **API Keys** and click **Create Key**
4. Copy the key into `ANTHROPIC_API_KEY`

---

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

Tests live alongside source files (`foo.ts` → `foo.test.ts`).

---

## Project structure

```
/
├── client/          # React frontend (Vite)
│   └── src/
│       ├── features/        # PreferencesPanel, RecommendationCard, HistoryGrid, InsightsPage
│       ├── hooks/           # useRecommendation — all state and history logic
│       ├── services/        # apiClient, libraryExport
│       └── types/
├── server/          # Express backend
│   └── src/
│       ├── controllers/     # Thin HTTP handlers
│       ├── services/        # recommendationService, artworkService, artistRelationsService
│       └── routes/
├── shared/          # Types shared between client and server
└── docker-compose.yml
```
