import { AlbumResponse, ListResponse } from '@shared/types';

const SITE_NAME = 'Plinth';
const DEFAULT_DESCRIPTION = 'Plinth recommends whole records, picked for you.';

export interface PageHead {
  /** The browser tab title. */
  readonly title: string;
  /** The title in a link preview, where the site name is shown separately. */
  readonly shareTitle: string;
  readonly description: string;
  /** Absolute, as link previews require. */
  readonly url: string;
  readonly imageUrl: string;
  readonly imageAlt: string;
  readonly card: 'summary' | 'summary_large_image';
  /** Asks search engines to leave the page out. Link previews are unaffected. */
  readonly noindex?: boolean;
}

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Album, artist and hook text comes from MusicBrainz and Claude, so it is never trusted as markup. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

function defaultImage(publicUrl: string): string {
  return `${publicUrl}/og-default.png`;
}

export function defaultPageHead(publicUrl: string): PageHead {
  return {
    title: SITE_NAME,
    shareTitle: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    url: publicUrl,
    imageUrl: defaultImage(publicUrl),
    imageAlt: `${SITE_NAME}: whole records, picked for you`,
    card: 'summary_large_image',
  };
}

export function albumPageHead(album: AlbumResponse, publicUrl: string): PageHead {
  const byline = `${album.album} by ${album.artist}`;
  const year = album.year ? ` (${album.year})` : '';

  return {
    title: `${byline} · ${SITE_NAME}`,
    shareTitle: byline,
    description: album.hook ?? `${byline}${year}, a record picked on ${SITE_NAME}.`,
    url: `${publicUrl}/album/${encodeURIComponent(album.slug)}`,
    // Through our own image proxy, so crawlers fetch from this site and not from archive.org's
    // redirects, which some of them handle badly. A cover is square, so it gets the small card.
    imageUrl: album.artworkUrl
      ? `${publicUrl}/api/v1/image?url=${encodeURIComponent(album.artworkUrl)}`
      : defaultImage(publicUrl),
    imageAlt: album.artworkUrl
      ? `${album.album} album cover`
      : `${SITE_NAME}: whole records, picked for you`,
    card: album.artworkUrl ? 'summary' : 'summary_large_image',
  };
}

/** "A", "A and B", "A, B and C". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * A shared list. It is open to anyone with the link but isn't listed anywhere, so search engines
 * are asked to leave it out. It uses the Plinth card until the list has a picture of its own.
 */
export function listPageHead(list: ListResponse, publicUrl: string): PageHead {
  return {
    title: `${list.title} · ${SITE_NAME}`,
    shareTitle: list.title,
    description: `${joinNames(list.albums.map((a) => `${a.album} by ${a.artist}`))}.`,
    url: `${publicUrl}/list/${encodeURIComponent(list.id)}`,
    imageUrl: defaultImage(publicUrl),
    imageAlt: `${SITE_NAME}: whole records, picked for you`,
    card: 'summary_large_image',
    noindex: true,
  };
}

/** The tags WhatsApp, Slack, Bluesky and the like read to build a link preview. */
export function renderHeadTags(head: PageHead): string {
  const title = escapeHtml(head.shareTitle);
  const description = escapeHtml(head.description);
  const url = escapeHtml(head.url);
  const image = escapeHtml(head.imageUrl);

  return [
    ...(head.noindex ? ['<meta name="robots" content="noindex" />'] : []),
    `<meta name="description" content="${description}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:alt" content="${escapeHtml(head.imageAlt)}" />`,
    `<meta name="twitter:card" content="${head.card}" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${image}" />`,
  ].join('\n    ');
}

/**
 * Puts the head's title and tags into the built index.html. Replacement functions are used so
 * "$" in an album title is never read as a replacement pattern.
 */
export function injectHead(template: string, head: PageHead): string {
  if (!/<\/head>/i.test(template)) return template;

  const title = `<title>${escapeHtml(head.title)}</title>`;
  const tags = `${/<title[\s>]/i.test(template) ? '' : `${title}\n    `}${renderHeadTags(head)}`;

  return template
    .replace(/<title[^>]*>[\s\S]*?<\/title>/i, () => title)
    .replace(/<\/head>/i, () => `${tags}\n  </head>`);
}
