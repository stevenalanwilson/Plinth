import fs from 'fs';
import path from 'path';
import jpeg from 'jpeg-js';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

export const LIST_IMAGE_WIDTH = 1200;
export const LIST_IMAGE_HEIGHT = 630;
/** The size of a Story on Instagram and the like: 9 by 16. */
export const LIST_STORY_WIDTH = 1080;
export const LIST_STORY_HEIGHT = 1920;
export const LIST_IMAGE_CONTENT_TYPE = 'image/jpeg';
// A photographic cover makes a PNG of 700 KB, and WhatsApp drops previews much above 300 KB. A
// JPEG at this quality is about a fifth of that and shows no visible difference at card size.
const JPEG_QUALITY = 85;

const COVER_SIZE = 340;
const PADDING = 48;
const GAP = 32;
// A Story has the app's own controls over its top and bottom, so nothing important goes there.
const STORY_PADDING_TOP = 230;
const STORY_PADDING_BOTTOM = 250;
const STORY_PADDING_SIDE = 72;
const STORY_GAP = 36;
const STORY_TEXT_GAP = 40;
const SITE_NAME = 'plinth.rocks';
const MAX_ALBUM_TITLE = 80;
const MAX_ARTIST_NAME = 50;
const FONT_FAMILY = 'DM Serif Display';
// The site's own colours, so a shared card looks like the page it opens.
const COLORS = {
  background: '#0e0e0f',
  surface: '#1e1e21',
  deepSurface: '#161618',
  border: 'rgba(255, 255, 255, 0.14)',
  text: '#f0ede8',
  accent: '#c8a96e',
  muted: '#a29d94',
};

/** An album's cover as it was fetched: the bytes, and the content type they came with. */
export interface ListImageCover {
  readonly bytes: Buffer;
  readonly contentType: string;
}

/**
 * The card is the picture a shared link shows, wide, with the covers alone. The story is tall,
 * for posting where a link shows no preview, so it also says what each album is.
 */
export type ListImageShape = 'card' | 'story';

export interface ListImageContent {
  readonly title: string;
  /** In order, best first; null where an album has no cover, which gets a placeholder. */
  readonly covers: readonly (ListImageCover | null)[];
  /** Which picture to draw; the card if not said. */
  readonly shape?: ListImageShape;
  /** The albums in the same order as the covers, named on a story. */
  readonly albums?: readonly { readonly album: string; readonly artist: string }[];
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

function coverTile(cover: ListImageCover | null, size: number): Node {
  if (isDrawable(cover)) {
    const source = `data:${cover.contentType};base64,${cover.bytes.toString('base64')}`;
    return {
      type: 'img',
      props: {
        src: source,
        width: size,
        height: size,
        style: { width: size, height: size, borderRadius: 10, objectFit: 'cover' },
      },
    };
  }
  // A record on a dark sleeve, for an album with no cover: never a wrong picture.
  return box(
    {
      width: size,
      height: size,
      borderRadius: 10,
      background: COLORS.surface,
      border: `1px solid ${COLORS.border}`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    box(
      {
        width: size * 0.65,
        height: size * 0.65,
        borderRadius: size,
        background: COLORS.deepSurface,
        border: `2px solid ${COLORS.border}`,
        alignItems: 'center',
        justifyContent: 'center',
      },
      box({ width: 56, height: 56, borderRadius: 28, background: COLORS.accent }),
    ),
  );
}

function slot(cover: ListImageCover | null, rank: number, size: number): Node {
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
      width: size,
      height: size,
      borderRadius: 10,
      boxShadow: '0 12px 30px rgba(0, 0, 0, 0.6)',
    },
    [coverTile(cover, size), badge],
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
        covers.map((cover, index) => slot(cover, index + 1, COVER_SIZE)),
      ),
    ],
  );
}

function shorten(text: string, length: number): string {
  return text.length <= length ? text : `${text.slice(0, length - 1).trimEnd()}…`;
}

function storyRow(
  cover: ListImageCover | null,
  rank: number,
  named: { readonly album: string; readonly artist: string } | undefined,
): Node {
  const text = named
    ? [
        box({ fontSize: 46, lineHeight: 1.15 }, shorten(named.album, MAX_ALBUM_TITLE)),
        box(
          { fontSize: 34, lineHeight: 1.2, color: COLORS.muted, marginTop: 10 },
          shorten(named.artist, MAX_ARTIST_NAME),
        ),
      ]
    : [];
  return box({ alignItems: 'center', gap: STORY_TEXT_GAP }, [
    slot(cover, rank, COVER_SIZE),
    // flex-basis 0 with a minimum width of 0 lets a long title wrap instead of pushing the row wider.
    box({ flexDirection: 'column', flex: 1, minWidth: 0 }, text),
  ]);
}

function storyLayout({ title, covers, albums }: ListImageContent): Node {
  return box(
    {
      width: LIST_STORY_WIDTH,
      height: LIST_STORY_HEIGHT,
      flexDirection: 'column',
      boxSizing: 'border-box',
      paddingTop: STORY_PADDING_TOP,
      paddingBottom: STORY_PADDING_BOTTOM,
      paddingLeft: STORY_PADDING_SIDE,
      paddingRight: STORY_PADDING_SIDE,
      background: COLORS.background,
      color: COLORS.text,
      fontFamily: FONT_FAMILY,
    },
    [
      box({ flexDirection: 'column', height: 200 }, [
        box({ fontSize: 52, fontStyle: 'italic', color: COLORS.accent }, 'Plinth'),
        box({ fontSize: 64, lineHeight: 1.1, marginTop: 14 }, title),
      ]),
      box(
        { flexDirection: 'column', gap: STORY_GAP },
        covers.map((cover, index) => storyRow(cover, index + 1, albums?.[index])),
      ),
      box({ flex: 1, alignItems: 'flex-end', fontSize: 36, color: COLORS.muted }, SITE_NAME),
    ],
  );
}

function dimensionsOf(shape: ListImageShape): { width: number; height: number } {
  return shape === 'story'
    ? { width: LIST_STORY_WIDTH, height: LIST_STORY_HEIGHT }
    : { width: LIST_IMAGE_WIDTH, height: LIST_IMAGE_HEIGHT };
}

async function draw(content: ListImageContent): Promise<Buffer> {
  const { normal, italic } = loadFonts();
  const shape = content.shape ?? 'card';
  const { width, height } = dimensionsOf(shape);
  const tree = shape === 'story' ? storyLayout(content) : layout(content);
  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], {
    width,
    height,
    fonts: [
      { name: FONT_FAMILY, data: normal, weight: 400, style: 'normal' },
      { name: FONT_FAMILY, data: italic, weight: 400, style: 'italic' },
    ],
  });
  const drawn = new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render();
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
