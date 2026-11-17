import { describe, it, expect } from 'vitest';
import { AlbumResponse } from '@shared/types';
import {
  albumPageHead,
  defaultPageHead,
  escapeHtml,
  injectHead,
  PageHead,
  renderHeadTags,
} from './albumPageService';

const SITE = 'https://plinth.example';

const ALBUM: AlbumResponse = {
  slug: 'the-sound-jeopardy',
  releaseGroupId: 'rg-1',
  artist: 'The Sound',
  album: 'Jeopardy',
  year: '1980',
  hook: 'A tightly coiled record that balances despair and drive.',
  genres: ['Post-punk'],
  country: 'United Kingdom',
  artworkUrl: 'http://coverartarchive.org/release/x/1-500.jpg',
  appleMusicUrl: null,
};

const TEMPLATE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Plinth</title>
  </head>
  <body><div id="root"></div></body>
</html>`;

describe('escapeHtml', () => {
  it('escapes the characters that could break out of an attribute or a tag', () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;',
    );
  });

  it('leaves ordinary text, including accents and other scripts, alone', () => {
    expect(escapeHtml('Sigur Rós – Ágætis byrjun 大瀧詠一')).toBe(
      'Sigur Rós – Ágætis byrjun 大瀧詠一',
    );
  });
});

describe('albumPageHead', () => {
  it('names the album and artist, and uses the hook as the description', () => {
    const head = albumPageHead(ALBUM, SITE);

    expect(head.title).toBe('Jeopardy by The Sound · Plinth');
    expect(head.shareTitle).toBe('Jeopardy by The Sound');
    expect(head.description).toBe('A tightly coiled record that balances despair and drive.');
  });

  it('describes an album that has no hook by its name, artist and year', () => {
    expect(albumPageHead({ ...ALBUM, hook: null }, SITE).description).toBe(
      'Jeopardy by The Sound (1980), a record picked on Plinth.',
    );
    expect(albumPageHead({ ...ALBUM, hook: null, year: null }, SITE).description).toBe(
      'Jeopardy by The Sound, a record picked on Plinth.',
    );
  });

  it('points the link at the album page, with an absolute URL', () => {
    expect(albumPageHead(ALBUM, SITE).url).toBe('https://plinth.example/album/the-sound-jeopardy');
  });

  it('encodes a slug in another script', () => {
    const head = albumPageHead({ ...ALBUM, slug: '大瀧詠一-a-long-vacation' }, SITE);

    expect(head.url).toBe(`${SITE}/album/${encodeURIComponent('大瀧詠一-a-long-vacation')}`);
  });

  it('serves the cover through the image proxy on this site, as a square card', () => {
    const head = albumPageHead(ALBUM, SITE);

    expect(head.imageUrl).toBe(
      `${SITE}/api/v1/image?url=${encodeURIComponent(ALBUM.artworkUrl as string)}`,
    );
    expect(head.imageAlt).toBe('Jeopardy album cover');
    expect(head.card).toBe('summary');
  });

  it('falls back to the Plinth card when the album has no cover', () => {
    const head = albumPageHead({ ...ALBUM, artworkUrl: null }, SITE);

    expect(head.imageUrl).toBe(`${SITE}/og-default.png`);
    expect(head.card).toBe('summary_large_image');
  });
});

describe('defaultPageHead', () => {
  it('describes Plinth itself, with the Plinth card', () => {
    const head = defaultPageHead(SITE);

    expect(head.title).toBe('Plinth');
    expect(head.url).toBe(SITE);
    expect(head.imageUrl).toBe(`${SITE}/og-default.png`);
    expect(head.card).toBe('summary_large_image');
  });
});

describe('renderHeadTags', () => {
  const head: PageHead = albumPageHead(ALBUM, SITE);

  it('includes the tags WhatsApp, Slack and Bluesky read', () => {
    const tags = renderHeadTags(head);

    expect(tags).toContain('<meta property="og:title" content="Jeopardy by The Sound" />');
    expect(tags).toContain(
      '<meta property="og:description" content="A tightly coiled record that balances despair and drive." />',
    );
    expect(tags).toContain(
      '<meta property="og:url" content="https://plinth.example/album/the-sound-jeopardy" />',
    );
    expect(tags).toContain('<meta property="og:image" content="');
    expect(tags).toContain('<meta property="og:site_name" content="Plinth" />');
    expect(tags).toContain('<meta name="twitter:card" content="summary" />');
    expect(tags).toContain(
      '<link rel="canonical" href="https://plinth.example/album/the-sound-jeopardy" />',
    );
    expect(tags).toContain('<meta name="description" content="');
  });

  it('escapes everything it prints, so text from MusicBrainz or Claude cannot inject markup', () => {
    const hostile = albumPageHead(
      {
        ...ALBUM,
        album: '"><script>alert(1)</script>',
        artist: "Tom & Jerry's <b>",
        hook: '"/><img src=x onerror=alert(1)>',
      },
      SITE,
    );

    const tags = renderHeadTags(hostile);

    expect(tags).not.toContain('<script>');
    expect(tags).not.toContain('<img');
    expect(tags).not.toContain('<b>');
    expect(tags).toContain('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(tags).toContain('Tom &amp; Jerry&#39;s &lt;b&gt;');
  });

  it('keeps every attribute value inside its quotes, even for an image URL with an ampersand', () => {
    const tags = renderHeadTags({
      ...head,
      imageUrl: 'https://plinth.example/api/v1/image?url=a&b="c"',
    });

    expect(tags).toContain(
      'content="https://plinth.example/api/v1/image?url=a&amp;b=&quot;c&quot;"',
    );
  });
});

describe('injectHead', () => {
  const head = albumPageHead(ALBUM, SITE);

  it('swaps the page title and adds the tags to the head, leaving the rest alone', () => {
    const html = injectHead(TEMPLATE, head);

    expect(html).toContain('<title>Jeopardy by The Sound · Plinth</title>');
    expect(html).not.toContain('<title>Plinth</title>');
    expect(html).toContain('<meta charset="UTF-8" />');
    expect(html).toContain('<div id="root"></div>');
    expect(html.indexOf('og:title')).toBeLessThan(html.indexOf('</head>'));
    expect(html.indexOf('og:title')).toBeGreaterThan(html.indexOf('<head>'));
  });

  it('escapes the title', () => {
    const html = injectHead(TEMPLATE, albumPageHead({ ...ALBUM, album: '<i>Jeopardy</i>' }, SITE));

    expect(html).toContain('<title>&lt;i&gt;Jeopardy&lt;/i&gt; by The Sound · Plinth</title>');
  });

  it('does not treat "$" in a title as a replacement pattern', () => {
    const html = injectHead(TEMPLATE, albumPageHead({ ...ALBUM, album: "$&' $1 $$" }, SITE));

    expect(html).toContain('$&amp;&#39; $1 $$ by The Sound');
    expect(html).toContain('</head>');
    expect(html.match(/<\/head>/g)).toHaveLength(1);
  });

  it('adds a title when the template has none', () => {
    const html = injectHead('<html><head></head><body></body></html>', head);

    expect(html).toContain('<title>Jeopardy by The Sound · Plinth</title>');
  });

  it('handles a title that spans lines', () => {
    const html = injectHead('<head><title>\n  Plinth\n</title></head>', head);

    expect(html).toContain('<title>Jeopardy by The Sound · Plinth</title>');
    expect(html).not.toContain('Plinth\n');
  });

  it('returns a page with no head unchanged', () => {
    expect(injectHead('<p>not a page</p>', head)).toBe('<p>not a page</p>');
  });
});
