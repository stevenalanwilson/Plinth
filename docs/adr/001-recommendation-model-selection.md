# ADR 001: Recommendation model selection

**Date:** 2026-03-29
**Status:** Accepted

---

## Context

The recommendation engine calls the Anthropic API to suggest albums based on user preferences. The initial implementation used **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`) for speed and low cost.

In practice, Haiku was observed to hallucinate albums — returning artist/album combinations that do not exist, particularly for obscure or niche preferences. Because the app's core value is a trustworthy, specific recommendation, accuracy outweighs cost at the current scale.

---

## Decision

Switch the recommendation model from **Claude Haiku 4.5** to **Claude Sonnet 4.6** (`claude-sonnet-4-6`).

Also strengthen the system prompt to explicitly discourage fabrication:

> "Only recommend albums you have complete certainty exist as real, released recordings. Never invent or fabricate an artist or album title. If you are not certain an album exists, choose a different one you are sure about."

---

## Consequences

**Positive**

- Significantly fewer hallucinated recommendations due to Sonnet's deeper factual recall
- More nuanced, contextually appropriate suggestions

**Negative / trade-offs**

- ~4–5× higher cost per request (see cost analysis below)
- ~1–2s additional latency per recommendation

### Cost analysis (approximate, as of 2026-03-29)

| Model      | Input        | Output        | Per request | Per 1,000 requests |
| ---------- | ------------ | ------------- | ----------- | ------------------ |
| Haiku 4.5  | $0.80 / MTok | $4.00 / MTok  | ~$0.0008    | ~$0.80             |
| Sonnet 4.6 | $3.00 / MTok | $15.00 / MTok | ~$0.003     | ~$3.00             |

Request size estimate: ~400 input tokens (system prompt + preferences + history), ~120 output tokens (JSON response).

At current personal-use scale (tens to low hundreds of requests per day) the absolute cost difference is negligible. **This decision should be revisited if the app is opened to a broader user base**, at which point options include:

- Reverting to Haiku with a verification/retry loop (ADR to be written)
- Routing by preference complexity (simple requests → Haiku, obscure/niche → Sonnet)
- Adding a server-side cache to avoid re-querying for identical preference sets

---

## Alternatives considered

**Keep Haiku + improve prompt only**
Prompt improvements help but do not fully address the root cause. Haiku's factual recall for niche music is fundamentally shallower than Sonnet's.

**Add a verification loop (check MusicBrainz/iTunes before returning)**
Most robust long-term approach. Deferred because it adds latency and complexity, and the model upgrade is likely sufficient for the current scale. Worth revisiting if hallucinations persist after this change.

**Use Claude Opus 4.6**
Better accuracy, but ~3× the cost of Sonnet with diminishing returns for a music recommendation task. Not justified.
