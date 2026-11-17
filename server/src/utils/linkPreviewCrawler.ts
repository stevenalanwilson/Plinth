// The fetchers that build link previews in chat apps and social sites, plus generic bots. Album
// pages count them apart from people, since a shared link is fetched once per app it's pasted
// into, whether or not anyone opens it.
const CRAWLER_PATTERN =
  /bot\b|bot\/|crawler|spider|facebookexternalhit|facebookcatalog|whatsapp|telegram|slack|discord|bluesky|cardyb|embedly|iframely|skypeuripreview|linkedin|pinterest|redditbot|vkshare|preview|curl\/|wget\//i;

/** True for a request from a link-preview fetcher or other bot, judged by its user agent. */
export function isLinkPreviewCrawler(userAgent: string | undefined): boolean {
  if (!userAgent) return true;
  return CRAWLER_PATTERN.test(userAgent);
}
