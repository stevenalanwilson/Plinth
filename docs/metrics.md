# Reading the "Done when" numbers from the logs

Plinth has no analytics service. The server writes a few log lines that carry counts and nothing about who a visitor is, and the roadmap's "Done when" checks for Phases 2 and 3 are read from those. Phase 4's is a hands-on check, described below. This page says which lines, what each field means, and how to turn them into the numbers.

On Railway, open the service's logs and search for the message text (the `msg` field) of each line below.

## The log lines

| Message                         | Fields                                      | Written when                                                                                                                                                                                                                                               | Phase |
| ------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `album page served`             | `slug`, `found`, `crawler`                  | The server renders an album page. `crawler` is true for link-preview fetchers (WhatsApp, Slack, Bluesky and the like) and other bots.                                                                                                                      | 2     |
| `pick requested after arriving` | `entry`                                     | A pick is asked for as the first pick of a visit that began on a shared link. `entry` is `shared-link` for an album page and `shared-list` for a list page.                                                                                                | 2     |
| `list created`                  | `kind`, `qualifier`, `albumCount`, `isFull` | Someone saved a new list. `albumCount` is how many albums it has and `isFull` whether it has all of them (a list is only shared once it does).                                                                                                             | 8     |
| `list edited`                   | `kind`, `qualifier`, `albumCount`, `isFull` | Someone changed the albums, or their order, in a list they had saved.                                                                                                                                                                                      | 8     |
| `list deleted`                  | none                                        | Someone deleted a list.                                                                                                                                                                                                                                    | 8     |
| `list shared`                   | `isOwner`                                   | Someone tapped Share on a finished list. `isOwner` is true when it was the list's own owner, false when a visitor passed it on. This counts taps: closing the share sheet without sending still counts.                                                    | 8     |
| `list page served`              | `found`, `crawler`                          | The server renders a list page, as it does for album pages. `crawler` is true for link-preview fetchers. The list's code is never written.                                                                                                                 | 8     |
| `list image drawn`              | `covers`, `drawMs`                          | A list's preview picture was drawn, not served from memory. `covers` is how many covers it had, and `drawMs` how long it took, almost all of it fetching covers.                                                                                           | 8     |
| `pick requested`                | `pickNumber`, `ratedThisVisit`              | Every pick asked for, whether or not it succeeds.                                                                                                                                                                                                          | 3     |
| `pick replayed for a retry`     | none                                        | A pick was asked for again with the same key (the browser retrying after a dropped connection) and answered from the first result, so Claude wasn't called a second time.                                                                                  | 4     |
| `daily limit reached`           | `scope`                                     | A pick, or an artist's essentials (which count as a pick), was turned away because a daily limit was used up. `scope` is `visitor` (that device's own limit) or `global` (the day's total). The request is not a pick: it writes no `pick requested` line. | 4     |
| `sign-in link requested`        | none                                        | A sign-in link was emailed. The address is never logged.                                                                                                                                                                                                   | 4     |
| `signed in`                     | `newAccount`                                | Someone opened a link and signed in. `newAccount` is true the first time that address has been used.                                                                                                                                                       | 4     |
| `signed out`                    | none                                        | A signed-in device signed out.                                                                                                                                                                                                                             | 4     |
| `account deleted`               | none                                        | Someone deleted their account.                                                                                                                                                                                                                             | 4     |
| `library synced`                | `sent`, `removed`, `returned`               | A signed-in device saved its changes to the crate. Counts of albums and removals it sent, and of albums returned to it. Never what is in the crate.                                                                                                        | 4     |
| `library full`                  | none                                        | A save was refused because the account already holds the most it may (5,000 albums and removals together). Nothing was saved. If this ever shows up, the cap is worth a look.                                                                              | 4     |
| `pick requested with taste`     | `avoid`, `liked`, `disliked`                | A pick is asked for by someone who has answered at least one album. These are counts of albums, never which ones.                                                                                                                                          | 3     |
| `recommendation regenerated`    | `reason`, `attempt`, `artist`, `album`      | Claude's pick was thrown away and asked for again. `reason` is `duplicate` (seen before), `rated` (the listener had answered it) or `not_found` (MusicBrainz doesn't have it).                                                                             | 0, 3  |
| `repeat pick shown`             | `artist`, `album`                           | No fresh pick could be found, so the listener is shown an album they had been shown before, as a last resort.                                                                                                                                              | 3     |
| `no fresh recommendation`       | `rated`                                     | Every attempt was an album the listener had answered, so the request failed.                                                                                                                                                                               | 3     |

### Retries

A browser that loses its connection while waiting for a pick asks once more with the same key, and the server answers from the first result for ten minutes. Only the first request writes the `pick requested` lines, so a retried pick is counted once. Two things follow:

- **`pick replayed for a retry`** counts the Claude calls that weren't paid for twice. It isn't a pick: leave it out of every share below.
- **A retry after a failed first attempt counts again,** because a failure isn't kept and the retry is a real second try. That is a small overcount, only when a pick fails and the connection also drops.

The keys are kept in the server's memory, so a restart forgets them.

### Daily limits

Picks are limited per visitor and for everyone together, both reset at midnight UTC. The numbers are `DAILY_PICK_LIMIT` (default 25) and `GLOBAL_DAILY_PICK_LIMIT` (default 1000), set on the server without a deploy; zero pauses picks.

- **`daily limit reached` with `scope` `visitor`** shows how often people use up their picks. If it is common, the limit is too tight for how people use Plinth.
- **`scope` `global`** means the day's total ran out: everyone was turned away until midnight. Seeing it is the sign to look at the limit, or at who is using it.
- **Turned-away requests aren't picks.** They write no `pick requested` line, so they are in no share below.
- A visitor is a device, or, for a browser that couldn't keep a device token, an address. Neither is written down as it is: the counts hold a device id or a hash of the address, and are removed within two days.

### Accounts

Signing in is optional, and the logs say how it is going without saying who anyone is: addresses and tokens are never written to them.

- **`sign-in link requested`** against **`signed in`** shows how many links are opened. Many requests with few sign-ins means the email isn't arriving, or people give up on the extra step.
- **`signed in` with `newAccount` true** counts new accounts.
- **`account deleted`** counts people leaving.
- **`library synced`** is a signed-in device saving or checking its crate. It happens when the crate changes and when a page comes back into view, so its count follows how often signed-in people use Plinth, not how many there are.
- A signed-in account has its own daily limit (`DAILY_SIGNED_IN_PICK_LIMIT`, default 100), shared by all its devices. `daily limit reached` with `scope` `visitor` covers it too.

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

## Phase 4: does the crate follow someone to another device?

> Done when: a user can sign in on their phone and see the crate they built on desktop.

This one is a check you do, not a number from the logs, because the logs say nothing about which device is which. On the deployed site:

1. On a desktop browser, answer a few picks (Own it, Want on vinyl), then open the Crate page and use **Sign in** from the note or the header, with an address you can read.
2. Open the link from the email (on the desktop or on the phone) and tap Sign in. The menu should say "Your crate is saved to your account."
3. On the phone, sign in with the same address. The crate page should show the same albums with the same answers, after a moment.
4. Change an answer or remove an album on one device, and bring the other back into view. It should follow within about fifteen seconds, or at once when you click back into that window.
5. Sign out on the phone. Its crate should leave that device and come back when you sign in again.

The logs can show whether people are doing it. `sign-in link requested` against `signed in` says how many links are opened, `signed in` with `newAccount` true counts new accounts, and `library synced` counts saves and checks (see Accounts above). They can't say whether a crate arrived on a second device.

## Phase 8: do people share a top 3, and do those who open one try Plinth?

> Done when: a shared link shows a card with the three covers and opens a working page for someone who has never visited, and some of those visitors make a pick of their own.

The lines carry how many albums a list has, never which list or whose: a list's code is what lets someone in, so it is not written down.

### Do people share what they make?

```
list share rate = count of "list shared" where isOwner is true
                  ÷ count of "list created" where isFull is true
```

Both over the same period. It is an estimate, in two ways: a list that became full by being edited is in no `list created` line with `isFull` true, and Share taps count every tap, including a second tap on the same list. Read it as "shares per list made", and watch which way it moves rather than the exact figure.

`list shared` with `isOwner` false counts visitors passing a list on, which is the loop working: someone who saw a list liked it enough to send it.

### Do people who open a shared list try a pick?

```
list link conversion = count of "pick requested after arriving" where entry is "shared-list"
                       ÷ count of "list page served" where crawler is false (and found is true)
```

The same caveats as for album links apply (see Phase 2): a reload counts again, a visitor with two tabs counts twice, and a browser that blocks session storage is never counted as having tried a pick.

### Whether the preview card is working

`list page served` with `crawler` true is a link-preview fetcher reading the page. Each should be followed by the picture being asked for: `list image drawn` is written only the first time, since later requests are served from memory, so it will be fewer than the page lines. If previews look wrong in a chat app, `drawMs` shows whether drawing was slow, and the `list image cover failed` warnings show covers that couldn't be fetched (a placeholder is drawn for them).

### What the logs can't tell you

- **Lists made per new visitor.** The roadmap asks for it, but nothing identifies a visitor, so the logs can't say which `list created` lines came from people new to Plinth.
- **Outbound clicks on list pages.** Clicks on the listening links aren't logged, so this can't be read yet. It is needed to judge affiliate links (P6.1) before building them.

## What this can't tell you

- **Who is a person.** Nothing identifies a visitor, so a count of lines is a count of requests, not people.
- **Small numbers.** With a handful of visitors, one person can move any of these shares a lot. Wait for a few weeks of real use before reading much into them.
- **Answers given after the last pick** are in no line, because the count is sent with the next pick.

## Why only counts

The lines carry how many albums, never which. That keeps the logs useful for these questions without turning them into a record of anyone's taste. If a question ever needs a visit identifier, that is a separate decision to make deliberately, not something to add quietly.
