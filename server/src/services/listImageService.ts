import fs from 'fs';
import path from 'path';
import jpeg from 'jpeg-js';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

export const LIST_IMAGE_WIDTH = 1200;
export const LIST_IMAGE_HEIGHT = 630;
export const LIST_IMAGE_CONTENT_TYPE = 'image/jpeg';
// A photographic cover makes a PNG of 700 KB, and WhatsApp drops previews much above 300 KB. A
// JPEG at this quality is about a fifth of that and shows no visible difference at card size.
const JPEG_QUALITY = 85;

const COVER_SIZE = 340;
const PADDING = 48;
const GAP = 32;
const FONT_FAMILY = 'DM Serif Display';
// The site's own colours, so a shared card looks like the page it opens.
const COLORS = {
  background: '#0e0e0f',
  surface: '#1e1e21',
  deepSurface: '#161618',
  border: 'rgba(255, 255, 255, 0.14)',
  text: '#f0ede8',
  accent: '#c8a96e',
};

/** An album's cover as it was fetched: the bytes, and the content type they came with. */
export interface ListImageCover {
  readonly bytes: Buffer;
  readonly contentType: string;
}

export interface ListImageContent {
  readonly title: string;
  /** In order, best first; null where an album has no cover, which gets a placeholder. */
  readonly covers: readonly (ListImageCover | null)[];
}

type Style = Record<string, string | number>;
interface Node {
  readonly type: string;
  readonly props: {
    readonly style?: Style;
    readonly children?: Child;
    readonly [key: string]: unknown;
  };
}
type Child = Node | string | readonly Node[];

function box(style: Style, children?: Child): Node {
  return { type: 'div', props: { style: { display: 'flex', ...style }, children } };
}

// The font files come with the dependency, so the picture never relies on fonts the server has.
interface LoadedFonts {
  readonly normal: Buffer;
  readonly italic: Buffer;
}
let fonts: LoadedFonts | null = null;

function loadFonts(): LoadedFonts {
  if (fonts) return fonts;
  const directory = path.join(
    path.dirname(require.resolve('@fontsource/dm-serif-display/package.json')),
    'files',
  );
  fonts = {
    normal: fs.readFileSync(path.join(directory, 'dm-serif-display-latin-400-normal.woff')),
    italic: fs.readFileSync(path.join(directory, 'dm-serif-display-latin-400-italic.woff')),
  };
  return fonts;
}

// What the first bytes of each kind of image the cover proxy lets through look like.
const SIGNATURES: Readonly<Record<string, readonly (readonly number[])[]>> = {
  'image/png': [[0x89, 0x50, 0x4e, 0x47]],
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/jpg': [[0xff, 0xd8, 0xff]],
  'image/gif': [[0x47, 0x49, 0x46, 0x38]],
  // RIFF....WEBP: the size in between is not checked.
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],
};

/** Whether the bytes start the way an image of the type they claim to be would. */
function isDrawable(cover: ListImageCover | null): cover is ListImageCover {
  if (!cover) return false;
  const type = cover.contentType.split(';')[0].trim().toLowerCase();
  const signatures = SIGNATURES[type] ?? [];
  return signatures.some((signature) => signature.every((byte, i) => cover.bytes[i] === byte));
}

function coverTile(cover: ListImageCover | null): Node {
  if (isDrawable(cover)) {
    const source = `data:${cover.contentType};base64,${cover.bytes.toString('base64')}`;
    return {
      type: 'img',
      props: {
        src: source,
        width: COVER_SIZE,
        height: COVER_SIZE,
        style: { width: COVER_SIZE, height: COVER_SIZE, borderRadius: 10, objectFit: 'cover' },
      },
    };
  }
  // A record on a dark sleeve, for an album with no cover: never a wrong picture.
  return box(
    {
      width: COVER_SIZE,
      height: COVER_SIZE,
      borderRadius: 10,
      background: COLORS.surface,
      border: `1px solid ${COLORS.border}`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    box(
      {
        width: 220,
        height: 220,
        borderRadius: 110,
        background: COLORS.deepSurface,
        border: `2px solid ${COLORS.border}`,
        alignItems: 'center',
        justifyContent: 'center',
      },
      box({ width: 56, height: 56, borderRadius: 28, background: COLORS.accent }),
    ),
  );
}

function slot(cover: ListImageCover | null, rank: number): Node {
  const badge = box(
    {
      position: 'absolute',
      top: 14,
      left: 14,
      width: 56,
      height: 56,
      borderRadius: 28,
      background: COLORS.accent,
      color: COLORS.background,
      fontSize: 38,
      alignItems: 'center',
      justifyContent: 'center',
    },
    String(rank),
  );
  return box(
    {
      position: 'relative',
      width: COVER_SIZE,
      height: COVER_SIZE,
      borderRadius: 10,
      boxShadow: '0 12px 30px rgba(0, 0, 0, 0.6)',
    },
    [coverTile(cover), badge],
  );
}

function layout({ title, covers }: ListImageContent): Node {
  return box(
    {
      width: LIST_IMAGE_WIDTH,
      height: LIST_IMAGE_HEIGHT,
      flexDirection: 'column',
      // Without this the padding is added to the width and the right-hand side is cut off.
      boxSizing: 'border-box',
      padding: PADDING,
      background: COLORS.background,
      color: COLORS.text,
      fontFamily: FONT_FAMILY,
    },
    [
      box({ justifyContent: 'space-between', alignItems: 'baseline', width: '100%' }, [
        box({ fontSize: 56 }, title),
        box({ fontSize: 48, fontStyle: 'italic', color: COLORS.accent }, 'Plinth'),
      ]),
      box(
        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: GAP },
        covers.map((cover, index) => slot(cover, index + 1)),
      ),
    ],
  );
}

async function draw(content: ListImageContent): Promise<Buffer> {
  const { normal, italic } = loadFonts();
  const svg = await satori(layout(content) as unknown as Parameters<typeof satori>[0], {
    width: LIST_IMAGE_WIDTH,
    height: LIST_IMAGE_HEIGHT,
    fonts: [
      { name: FONT_FAMILY, data: normal, weight: 400, style: 'normal' },
      { name: FONT_FAMILY, data: italic, weight: 400, style: 'italic' },
    ],
  });
  const drawn = new Resvg(svg, { fitTo: { mode: 'width', value: LIST_IMAGE_WIDTH } }).render();
  // The background is opaque all over, so there is no transparency for a JPEG to lose.
  const encoded = jpeg.encode(
    { data: drawn.pixels, width: drawn.width, height: drawn.height },
    JPEG_QUALITY,
  );
  return Buffer.from(encoded.data);
}

/**
 * The picture shown when a list is shared, as a JPEG: its title, the Plinth name, and its covers in order,
 * numbered, on the site's dark background. A cover that isn't an image of the type it claims is
 * drawn as a placeholder, and if the renderer still can't cope with one, every cover is, so a bad
 * cover never loses the picture. Rejects only if even a picture without covers can't be drawn.
 */
export async function renderListImage(content: ListImageContent): Promise<Buffer> {
  try {
    return await draw(content);
  } catch {
    return draw({ ...content, covers: content.covers.map(() => null) });
  }
}
