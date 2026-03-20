# Album Recommender

A fullstack web app that recommends albums you don't own yet, based on your Apple Music library. Powered by Claude AI, MusicBrainz, and the iTunes Search API.

## How it works

1. Export your Apple Music library: **File → Library → Export Library…**
2. Upload the `.xml` file
3. Optionally pick a genre filter
4. Hit **Find me something to listen to** — the app calls Claude (server-side, your key stays private), fetches artwork and an Apple Music link, and displays the recommendation

History is persisted in `localStorage` so previous suggestions survive page reloads.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Backend | Node.js, TypeScript, Express |
| AI | Anthropic Claude (Haiku 3.5) |
| Artwork | MusicBrainz + Cover Art Archive |
| Apple Music links | iTunes Search API |

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

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | — | Your Anthropic API key |
| `PORT` | | `3001` | Server port |
| `CORS_ORIGIN` | | `http://localhost:5173` | Allowed client origin |
| `VITE_API_URL` | | `''` (same origin) | Client → server base URL |

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
│       ├── features/        # Library upload, recommendation card, history grid
│       ├── hooks/           # useRecommendation — all state lives here
│       ├── services/        # apiClient, libraryParser
│       └── types/
├── server/          # Express backend
│   └── src/
│       ├── controllers/     # Thin HTTP handlers
│       ├── services/        # recommendationService, artworkService
│       └── routes/
├── shared/          # Types shared between client and server
└── docker-compose.yml
```
