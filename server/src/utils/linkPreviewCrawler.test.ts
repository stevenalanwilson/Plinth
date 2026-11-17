import { describe, it, expect } from 'vitest';
import { isLinkPreviewCrawler } from './linkPreviewCrawler';

describe('isLinkPreviewCrawler', () => {
  it.each([
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'WhatsApp/2.23.20.0 A',
    'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    'Slack-ImgProxy (+https://api.slack.com/robots)',
    'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
    'TelegramBot (like TwitterBot)',
    'Twitterbot/1.0',
    'Mozilla/5.0 (compatible; Bluesky Cardyb/1.1; +mailto:support@bsky.app)',
    'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Safari/605.1.15 (Applebot/0.1)',
    'iframely/1.3.1 (+https://iframely.com/docs/about)',
    'curl/8.4.0',
  ])('treats %s as a crawler', (userAgent) => {
    expect(isLinkPreviewCrawler(userAgent)).toBe(true);
  });

  it.each([
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
  ])('treats %s as a person', (userAgent) => {
    expect(isLinkPreviewCrawler(userAgent)).toBe(false);
  });

  it('treats a request with no user agent as a crawler', () => {
    expect(isLinkPreviewCrawler(undefined)).toBe(true);
    expect(isLinkPreviewCrawler('')).toBe(true);
  });
});
