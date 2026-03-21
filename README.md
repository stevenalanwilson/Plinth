# Album Recommender

A fullstack web app that recommends albums based on your taste preferences. Powered by Claude AI, MusicBrainz, and the iTunes Search API.

## How it works

1. Set your preferences — genres, mood, tempo, energy, density, era, and discovery settings
2. Hit **Find me something to listen to** — the app calls Claude (server-side, your key stays private), fetches artwork and an Apple Music link, and displays the recommendation

History is persisted in `localStorage` so previous suggestions survive page reloads.

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
| Apple Music links | iTunes Search API                                 |

---

## Setup

### Prerequisites

- Node.js 20+
- Docker + Docker Compose (for the full stack)
- An [Anthropic API key](https://console.anthropic.com/)

### 1. Clone and install

```bash
git clone <repo-url>
cd album-recommender
npm install
cd server && npm install && cd ..
cd client && npm install && cd ..
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set your `ANTHROPIC_API_KEY`.

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
| `ANTHROPIC_API_KEY` | ✅       | —                       | Your Anthropic API key                              |
| `PORT`              |          | `3001`                  | Server port                                         |
| `CORS_ORIGIN`       |          | `http://localhost:5173` | Allowed client origin                               |
| `VITE_API_URL`      |          | `''` (same origin)      | Client → server base URL (local dev without Docker) |

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
│       ├── features/        # PreferencesPanel, RecommendationCard, HistoryGrid
│       ├── hooks/           # useRecommendation — all state lives here
│       ├── services/        # apiClient
│       └── types/
├── server/          # Express backend
│   └── src/
│       ├── controllers/     # Thin HTTP handlers
│       ├── services/        # recommendationService, artworkService
│       └── routes/
├── shared/          # Types shared between client and server
└── docker-compose.yml
```
