const TRUSTED_HOSTNAMES = ['coverartarchive.org', 'archive.org', 'mzstatic.com'];

function isTrustedHostname(hostname: string): boolean {
  return TRUSTED_HOSTNAMES.some(
    (trusted) => hostname === trusted || hostname.endsWith(`.${trusted}`),
  );
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

  if (!isTrustedHostname(parsedUrl.hostname)) {
    throw new Error(`Untrusted image hostname: ${parsedUrl.hostname}`);
  }

  const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Image fetch failed with status ${res.status}`);

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.startsWith('image/')) {
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

  const buffer = Buffer.concat(chunks);

  return { buffer, contentType };
}
