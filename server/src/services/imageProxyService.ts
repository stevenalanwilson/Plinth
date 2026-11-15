const TRUSTED_HOSTNAMES = ['coverartarchive.org', 'archive.org', 'mzstatic.com'];
// Raster formats only: SVG is excluded because it can carry script, and these bytes are
// served from our own origin.
const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 10_000;

function isTrustedHostname(hostname: string): boolean {
  return TRUSTED_HOSTNAMES.some(
    (trusted) => hostname === trusted || hostname.endsWith(`.${trusted}`),
  );
}

function assertAllowedUrl(url: URL): void {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Unsupported image URL protocol: ${url.protocol}`);
  }
  if (!isTrustedHostname(url.hostname)) {
    throw new Error(`Untrusted image hostname: ${url.hostname}`);
  }
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

// Redirects are followed by hand because fetch would otherwise follow them to any host,
// letting a trusted URL bounce the server to an arbitrary (possibly internal) address.
async function fetchFromTrustedHosts(startUrl: URL, signal: AbortSignal): Promise<Response> {
  let url = startUrl;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    assertAllowedUrl(url);
    const res = await fetch(url.toString(), { signal, redirect: 'manual' });
    if (!isRedirect(res.status)) return res;

    const location = res.headers.get('location');
    if (!location) throw new Error('Redirect without a location');
    url = new URL(location, url);
  }
  throw new Error('Too many redirects');
}

export interface ImageResult {
  buffer: Buffer;
  contentType: string;
}

export async function fetchImageBytes(url: string): Promise<ImageResult> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  const res = await fetchFromTrustedHosts(parsedUrl, AbortSignal.timeout(FETCH_TIMEOUT_MS));
  if (!res.ok) throw new Error(`Image fetch failed with status ${res.status}`);

  const contentType = res.headers.get('content-type') ?? '';
  const mediaType = contentType.split(';')[0].trim().toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.has(mediaType)) {
    throw new Error(`Unexpected content-type from image URL: ${contentType || '(none)'}`);
  }

  const contentLength = res.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_BYTES) {
    throw new Error('Image exceeds maximum allowed size');
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_BYTES) {
      await reader.cancel();
      throw new Error('Image exceeds maximum allowed size');
    }
    chunks.push(Buffer.from(value));
  }

  return { buffer: Buffer.concat(chunks), contentType };
}
