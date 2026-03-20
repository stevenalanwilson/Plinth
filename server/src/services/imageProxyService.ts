const TRUSTED_HOSTNAMES = ['coverartarchive.org', 'archive.org'];

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

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image fetch failed with status ${res.status}`);

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = res.headers.get('content-type') ?? 'image/jpeg';

  return { buffer, contentType };
}
