# The taste summary: numbers you can tune

The paragraph at the top of Insights ("You lean towards Post-punk and Krautrock, mostly from the 1970s and the United Kingdom. You tend to pass on Metal.") is worked out in the browser from the albums in the library. It makes no Claude call and sends nothing anywhere.

Every number that decides what it says is a constant at the top of one file:

**`client/src/features/stats/describeTaste.ts`**

The starting values were my first guesses, chosen before there was a real crate to look at. Expect to change some of them once you've seen it on yours.

## How it decides

1. **Each album gets a weight** from the answer given on it (see `WEIGHTS`).
2. **For each kind of label** (genre, decade, country) the weight behind each label is added up. An album that has two genres adds its full weight to both.
3. **A label's share** is its weight divided by the total weight of the albums that have that kind of label. An album with no genre data doesn't count towards the genre shares, and one with no usable year doesn't count towards the decade shares.
4. **A label is named** when its share reaches the threshold for its kind.
5. **The sentences are put together** from whatever was named: the lean, and sometimes what the listener passes on.

Nothing is named until there are enough albums, so a small library says nothing rather than something that is only chance.

## The constants

| Constant       | Starts at                                                                                              | What it controls                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `WEIGHTS`      | own 3, want-vinyl 3, save 2, heard 1, unanswered 1, not-for-me 0                                       | How much each kind of album says about the listener's taste. "Unanswered" also covers an answer that was taken back.             |
| `MIN_ALBUMS`   | 5                                                                                                      | How many albums with a weight above zero it needs before saying anything. Albums marked Not for me don't count towards it.       |
| `GENRE_SHARE`  | 0.25                                                                                                   | The share of the weight a genre needs to be named in "You lean towards …".                                                       |
| `MAX_GENRES`   | 2                                                                                                      | The most genres it will name.                                                                                                    |
| `PLACE_SHARE`  | 0.4                                                                                                    | The share a decade or a country needs to be named in "mostly from …". Only the single top decade and top country are ever named. |
| `MIN_PASSES`   | 3                                                                                                      | How many albums marked Not for me it needs before it will say what the listener passes on.                                       |
| `PASS_SHARE`   | 0.5                                                                                                    | The share of those passes that must be in one genre for "You tend to pass on …".                                                 |
| `WITH_ARTICLE` | UK, USA, United Kingdom, United States, Netherlands, Philippines, Czech Republic, United Arab Emirates | Countries written with "the" ("from the UK", but "from Germany"). Add a country here if one reads wrongly.                       |

### Which way to turn each one

- **Raise `GENRE_SHARE` or `PLACE_SHARE`:** it names fewer things, and only the strongest. Too high and most libraries read as "wide-ranging".
- **Lower them:** it names more, and gets more chatty and less true. Only the top decade and the top country are ever named, so lowering `PLACE_SHARE` makes that claim easier to make, not longer.
- **`MAX_GENRES`:** two keeps the sentence short. Three is possible, but the sentence starts to read like a list.
- **`MIN_ALBUMS`:** lower to show something sooner, raise to wait for a more trustworthy picture. Anyone below it sees the "Keep going" message.
- **`WEIGHTS`:** the gaps between values matter more than the values. At 3 against 1, three owned albums outweigh eight that were never answered. Making unanswered 0 would mean the paragraph only ever reflects albums the listener has actually answered.
- **`MIN_PASSES` and `PASS_SHARE`:** raise them if the "pass on" sentence appears on thin evidence, lower them if it never shows up.

## A worked example

This is the library used to check the feature in the browser: 11 albums, 8 of which count (the 3 marked Not for me are ignored). The total weight is 19.

| Kind    | Label          | Weight | Share |
| ------- | -------------- | ------ | ----- |
| Genre   | Post-punk      | 12     | 63%   |
| Genre   | Krautrock      | 7      | 37%   |
| Genre   | Punk           | 3      | 16%   |
| Genre   | Electronic     | 1      | 5%    |
| Decade  | 1970s          | 12     | 63%   |
| Decade  | 1980s          | 7      | 37%   |
| Country | United Kingdom | 12     | 63%   |
| Country | Germany        | 7      | 37%   |

With the starting values that gives: _"You lean towards Post-punk and Krautrock, mostly from the 1970s and the United Kingdom. You tend to pass on Metal."_

What changing a number would do to it:

| Change                    | Result                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `GENRE_SHARE` to 0.4      | Krautrock (37%) drops out: "You lean towards Post-punk, …".                                                                    |
| `GENRE_SHARE` to 0.15     | Punk (16%) now qualifies, but `MAX_GENRES` still stops it at two.                                                              |
| `PLACE_SHARE` to 0.7      | Neither the decade nor the country (63%) qualifies: "You lean towards Post-punk and Krautrock. You tend to pass on Metal."     |
| `WEIGHTS` unanswered to 0 | The two unanswered albums stop counting. The shares move a little (Post-punk to about 65%), but the sentence is the same here. |
| `MIN_PASSES` to 4         | There are only three passes, so the last sentence disappears.                                                                  |

## Changing one safely

1. Edit the constant in `describeTaste.ts`.
2. Run the tests for it:

   ```bash
   npm run test --prefix client -- describeTaste
   ```

3. Some tests will fail on purpose: they pin the starting values, so they tell you exactly which behaviour moved. Update their expectations deliberately, in the same change. They are in `client/src/features/stats/describeTaste.test.ts`:

   | If you change               | Tests that will notice                                                                                                                                                                                    |
   | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `MIN_ALBUMS`                | "says nothing for fewer than five albums", "speaks from five albums", "does not count albums marked Not for me towards the five", and the Keep going and Insights page tests that use three or six albums |
   | `GENRE_SHARE`, `MAX_GENRES` | "names two styles …", "names no more than two styles", "leaves out a style that is only a sliver of the library"                                                                                          |
   | `PLACE_SHARE`               | "leaves out a decade or country that does not stand out", "names a decade but no country when only the decade stands out"                                                                                 |
   | `WEIGHTS`                   | everything under "weighing what the listener answered"                                                                                                                                                    |
   | `MIN_PASSES`, `PASS_SHARE`  | everything under "what the listener passes on"                                                                                                                                                            |
   | `WITH_ARTICLE`              | the "countries" test                                                                                                                                                                                      |

## Trying it on a library of your own

Open the app in development, run this in the browser console, then reload and open Crate, then Insights. It stores the 11-album library from the example above:

```js
const iso = (days) => new Date(Date.now() - days * 864e5).toISOString();
let n = 0;
const album = (artist, title, year, genres, country, status) => {
  n += 1;
  return {
    id: `seed-${n}`,
    createdAt: iso(n),
    recommendation: { artist, album: title, year, reason: 'Seeded.', genres, country },
    artworkResponse: { artworkUrl: null, year, appleMusicUrl: null },
    ...(status ? { feedback: { status, at: iso(n) } } : {}),
  };
};
localStorage.setItem(
  'album-recommender-history',
  JSON.stringify([
    album('The Sound', 'Jeopardy', '1980', ['Post-punk'], 'United Kingdom', 'own'),
    album('Joy Division', 'Closer', '1980', ['Post-punk'], 'United Kingdom', 'own'),
    album('Wire', 'Pink Flag', '1977', ['Punk', 'Post-punk'], 'United Kingdom', 'want-vinyl'),
    album('Gang of Four', 'Entertainment!', '1979', ['Post-punk'], 'United Kingdom', 'save'),
    album('Echo & the Bunnymen', 'Heaven Up Here', '1981', ['Post-punk'], 'United Kingdom'),
    album('Can', 'Tago Mago', '1971', ['Krautrock'], 'Germany', 'own'),
    album('Neu!', 'Neu! 75', '1975', ['Krautrock'], 'Germany', 'want-vinyl'),
    album('Cluster', 'Zuckerzeit', '1974', ['Krautrock', 'Electronic'], 'Germany'),
    album('Sunn O)))', 'Monoliths & Dimensions', '2009', ['Metal'], 'USA', 'not-for-me'),
    album('Mastodon', 'Leviathan', '2004', ['Metal'], 'USA', 'not-for-me'),
    album('Slayer', 'Reign in Blood', '1986', ['Metal'], 'USA', 'not-for-me'),
  ]),
);
```

To clear it afterwards: `localStorage.removeItem('album-recommender-history')`. This is test data in your own browser only. Your real library lives under the same key, so use a private window, or export your crate first.

## Other numbers from Phase 3 you may want to revisit

These are separate from the summary, but they are guesses of the same kind.

| Number                                              | Where                                                               | What it does                                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `UNRATED_MAX_ENTRIES` 50, `UNRATED_MAX_AGE_DAYS` 90 | `client/src/services/libraryRetention.ts`                           | How many picks nobody answered are kept, and for how long. Answered albums are always kept. |
| `MAX_TASTE_SAMPLE` 12                               | `shared/types.ts`                                                   | How many liked and disliked albums are sent to steer a pick.                                |
| `MAX_TASTE_AVOID` 500                               | `shared/types.ts`                                                   | How many answered albums are checked in code so they are never picked again.                |
| The prompt's 120 names                              | `formatAlbumList` in `server/src/services/recommendationService.ts` | How many albums to avoid the prompt can name; answered ones come first.                     |
| `MAX_ATTEMPTS` 3                                    | `server/src/services/recommendationService.ts`                      | How many times Claude is asked before giving up on finding a fresh pick.                    |
