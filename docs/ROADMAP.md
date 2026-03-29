# Album Recommender — Product Roadmap

> A living document tracking planned features and improvements for the Album Recommender app.

---

## 🎯 Better Recommendations

- [ ] **Genre/mood filtering** — Filter recommendations by energy level, decade, or genre cluster rather than a random spread
- [x] **"More like this" refinement** — After a recommendation is shown, allow pivoting ("more like this" / "something different") to steer the next suggestion
- [ ] **Exclude already-owned albums** — Cross-reference against the user's library so recommendations don't surface albums already owned
- [x] **Similar artist discovery** — Use MusicBrainz relationships to surface connected artists (collaborators, side projects, former members)

---

## 📊 Library Insights

- [ ] **Library stats dashboard** — Breakdown of collection by decade, genre, and country of origin; surface interesting gaps
- [ ] **"What's missing"** — Based on library artists, flag acclaimed albums in those discographies not yet owned
- [ ] **Play count weighting** — If Apple Music play data is accessible, weight recommendations toward artists actually listened to, not just owned

---

## 🖼️ UX & Interface

- [ ] **Persistent want list** — Save recommended albums to a wishlist stored in localStorage, with links to buy or stream
- [ ] **Album detail expansion** — Clicking an album pulls a richer view with tracklist, release info, and related albums via MusicBrainz
- [ ] **Keyboard navigation** — Quick "next recommendation" via spacebar or arrow keys
- [ ] **Dark/light mode toggle** — Theme switching for different environments

---

## 🔗 Integrations

- [ ] **Discogs pricing** — Pull current marketplace prices for recommended albums (particularly useful for vinyl buying decisions)
- [ ] **Last.fm scrobble data** — Import listening history for richer recommendation signals
- [ ] **Share card** — Generate a shareable image of a recommendation for posting to music communities

---

## ⚙️ Technical & Quality

- [ ] **Caching layer** — Cache MusicBrainz lookups to improve load times and reduce API rate limit risk
- [ ] **Fallback cover art** — Graceful placeholder when Cover Art Archive has no artwork
- [ ] **Progressive loading** — Stream results in rather than waiting for the full library parse

---

## ✅ Completed

- **"More like this" refinement** — Pivot buttons after each recommendation steer the next suggestion via "more like this" or "something different", feeding the signal into the Claude prompt
- **Similar artist discovery** — Connected artists surface on the recommendation card via MusicBrainz relationships and recording co-credits; clicking a chip seeds Claude to recommend from that artist's catalogue

---

_Last updated: March 2026_
