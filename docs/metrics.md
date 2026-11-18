# Reading the "Done when" numbers from the logs

Plinth has no analytics service. The server writes a few log lines that carry counts and nothing about who a visitor is, and the roadmap's "Done when" checks for Phases 2 and 3 are read from those. This page says which lines, what each field means, and how to turn them into the numbers.

On Railway, open the service's logs and search for the message text (the `msg` field) of each line below.

## The log lines

| Message                         | Fields                                 | Written when                                                                                                                                                                   | Phase |
| ------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| `album page served`             | `slug`, `found`, `crawler`             | The server renders an album page. `crawler` is true for link-preview fetchers (WhatsApp, Slack, Bluesky and the like) and other bots.                                          | 2     |
| `pick requested after arriving` | `entry`                                | A pick is asked for as the first pick of a visit that began on a shared album link.                                                                                            | 2     |
| `pick requested`                | `pickNumber`, `ratedThisVisit`         | Every pick asked for, whether or not it succeeds.                                                                                                                              | 3     |
| `pick requested with taste`     | `avoid`, `liked`, `disliked`           | A pick is asked for by someone who has answered at least one album. These are counts of albums, never which ones.                                                              | 3     |
| `recommendation regenerated`    | `reason`, `attempt`, `artist`, `album` | Claude's pick was thrown away and asked for again. `reason` is `duplicate` (seen before), `rated` (the listener had answered it) or `not_found` (MusicBrainz doesn't have it). | 0, 3  |
| `repeat pick shown`             | `artist`, `album`                      | No fresh pick could be found, so the listener is shown an album they had been shown before, as a last resort.                                                                  | 3     |
| `no fresh recommendation`       | `rated`                                | Every attempt was an album the listener had answered, so the request failed.                                                                                                   | 3     |

### The visit fields

`pickNumber` and `ratedThisVisit` come from the browser and are kept for one tab session, so they start again each time the tab is opened fresh.

- **`pickNumber`** is 1 for the first pick of the visit, 2 for the second, and so on.
- **`ratedThisVisit`** is how many different albums have been given an answer so far in this visit. Changing an answer doesn't add to it, and taking an answer back doesn't remove it. It's counted when the pick is asked for, so an answer given after the last pick isn't in any line.
- **Both are `null`** when the browser can't keep them (storage blocked) or the client is older than this change. Leave those lines out of any share you work out.

## Phase 2: do people who arrive from a shared link try a pick?

> Done when: people who arrive from a shared link try at least one recommendation of their own.

```
share = count of "pick requested after arriving"
        ÷ count of "album page served" where crawler is false (and found is true)
```

Both counts over the same period. A reload of an album page counts again, a visitor with two tabs counts twice, and a browser that blocks session storage is never counted as having tried a pick, so treat this as an estimate, not a precise funnel.

## Phase 3: do people answer picks, and do repeats stop?

> Done when: returning users rate at least a few picks per session, and repeat picks drop to near zero.

### Answering picks

The logs don't identify a visit, so you can't add up one visit's lines. `pickNumber` gets round that: a visit writes exactly one `pick requested` line for each pick number it reaches, so comparing lines **at the same pick number** compares one line per visit.

```
share of visits reaching pick N that had answered at least K albums
  = count of "pick requested" where pickNumber is N and ratedThisVisit ≥ K
    ÷ count of "pick requested" where pickNumber is N
```

For example, with N = 3 and K = 2 the question is "of the visits that got as far as a third pick, what share had answered at least two albums by then". Try N = 2, 3 and 5. A figure taken over every line instead would be pulled towards the visits that asked for the most picks.

The pick number counts every request, including a second tap that cancelled the first, so it can run a little ahead of the picks a listener actually saw.

### Returning listeners

The logs can't tell a returning listener from a new one. `pick requested with taste` is the closest signal: it means the listener has answered at least one album, in this visit or an earlier one. Its share of all picks, week on week, shows whether more of the people picking are people with a crate.

```
share with a crate = count of "pick requested with taste" ÷ count of "pick requested"
```

### Repeats

```
repeat rate = count of "repeat pick shown" ÷ count of "pick requested"
```

"Near zero" means this should be very small. Two more lines show what is happening underneath:

- `recommendation regenerated` with `reason` `duplicate` shows how often Claude's first answer is something the listener has already been shown. Those are caught and replaced, so this is not a repeat reaching the listener.
- `recommendation regenerated` with `reason` `rated` shows the code catching an album the listener has answered. If it is common, the prompt isn't naming enough of their answered albums. `no fresh recommendation` is the case where it caught three in a row.

## What this can't tell you

- **Who is a person.** Nothing identifies a visitor, so a count of lines is a count of requests, not people.
- **Small numbers.** With a handful of visitors, one person can move any of these shares a lot. Wait for a few weeks of real use before reading much into them.
- **Answers given after the last pick** are in no line, because the count is sent with the next pick.

## Why only counts

The lines carry how many albums, never which. That keeps the logs useful for these questions without turning them into a record of anyone's taste. If a question ever needs a visit identifier, that is a separate decision to make deliberately, not something to add quietly.
