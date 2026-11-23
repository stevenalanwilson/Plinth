import { describe, it, expect } from 'vitest';
import { Resvg } from '@resvg/resvg-js';
import jpeg from 'jpeg-js';
import {
  LIST_IMAGE_CONTENT_TYPE,
  LIST_IMAGE_HEIGHT,
  LIST_IMAGE_WIDTH,
  ListImageCover,
  renderListImage,
} from './listImageService';

const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
// Link previews are known to be dropped much above this; WhatsApp is the strictest.
const PREVIEW_SIZE_LIMIT = 300 * 1024;

/** A square cover in one colour, made with the same renderer, as real cover bytes would arrive. */
function cover(color: string): ListImageCover {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="250" height="250"><rect width="250" height="250" fill="${color}"/></svg>`;
  return { bytes: Buffer.from(new Resvg(svg).render().asPng()), contentType: 'image/png' };
}

function sizeOf(picture: Buffer): { width: number; height: number } {
  const { width, height } = jpeg.decode(picture);
  return { width, height };
}

const TITLE = 'My top 3 albums of all time';
const THREE = [cover('#2a4d7a'), cover('#7a4d2a'), cover('#2a7a5d')];

describe('renderListImage', () => {
  it('draws a JPEG the size link previews want, 1200 by 630', async () => {
    const png = await renderListImage({ title: TITLE, covers: THREE });

    expect(LIST_IMAGE_CONTENT_TYPE).toBe('image/jpeg');
    expect(png.subarray(0, 3).equals(JPEG_SIGNATURE)).toBe(true);
    expect(sizeOf(png)).toEqual({ width: LIST_IMAGE_WIDTH, height: LIST_IMAGE_HEIGHT });
    expect(LIST_IMAGE_WIDTH).toBe(1200);
    expect(LIST_IMAGE_HEIGHT).toBe(630);
  });

  it('is small enough for the strictest link preview to show', async () => {
    const png = await renderListImage({ title: TITLE, covers: THREE });

    expect(png.length).toBeLessThan(PREVIEW_SIZE_LIMIT);
  });

  it('shows the covers it is given, so different covers make a different picture', async () => {
    const one = await renderListImage({ title: TITLE, covers: THREE });
    const other = await renderListImage({
      title: TITLE,
      covers: [cover('#aa0000'), cover('#00aa00'), cover('#0000aa')],
    });

    expect(one.equals(other)).toBe(false);
  });

  it('draws a placeholder in place of a cover that is missing', async () => {
    const png = await renderListImage({ title: TITLE, covers: [THREE[0], null, THREE[2]] });

    expect(sizeOf(png)).toEqual({ width: 1200, height: 630 });
    expect((await renderListImage({ title: TITLE, covers: THREE })).equals(png)).toBe(false);
  });

  it('still draws a picture when there are no covers at all', async () => {
    const png = await renderListImage({ title: TITLE, covers: [null, null, null] });

    expect(sizeOf(png)).toEqual({ width: 1200, height: 630 });
  });

  it('draws a placeholder for a cover that is not an image, and keeps the good ones', async () => {
    const broken: ListImageCover = { bytes: Buffer.from('not an image'), contentType: 'image/png' };

    const withBroken = await renderListImage({
      title: TITLE,
      covers: [THREE[0], broken, THREE[2]],
    });
    const withMissing = await renderListImage({ title: TITLE, covers: [THREE[0], null, THREE[2]] });

    expect(sizeOf(withBroken)).toEqual({ width: 1200, height: 630 });
    // The same as that one cover being missing: the other two are still drawn.
    expect(withBroken.equals(withMissing)).toBe(true);
  });

  it('draws a placeholder for a cover whose bytes do not match the type it came with', async () => {
    const mislabelled: ListImageCover = { bytes: THREE[1].bytes, contentType: 'image/jpeg' };

    const png = await renderListImage({ title: TITLE, covers: [THREE[0], mislabelled, THREE[2]] });
    const withMissing = await renderListImage({ title: TITLE, covers: [THREE[0], null, THREE[2]] });

    expect(png.equals(withMissing)).toBe(true);
  });

  it('draws a placeholder for an empty cover', async () => {
    const empty: ListImageCover = { bytes: Buffer.alloc(0), contentType: 'image/png' };

    const png = await renderListImage({ title: TITLE, covers: [THREE[0], empty, THREE[2]] });
    const withMissing = await renderListImage({ title: TITLE, covers: [THREE[0], null, THREE[2]] });

    expect(png.equals(withMissing)).toBe(true);
  });

  it('draws the same picture for the same covers', async () => {
    const first = await renderListImage({ title: TITLE, covers: THREE });
    const second = await renderListImage({ title: TITLE, covers: THREE });

    expect(first.equals(second)).toBe(true);
  });

  it('puts the title in the picture', async () => {
    const one = await renderListImage({ title: TITLE, covers: THREE });
    const other = await renderListImage({ title: 'A different title entirely', covers: THREE });

    expect(one.equals(other)).toBe(false);
  });

  it('copes with a title that has characters its font lacks', async () => {
    const png = await renderListImage({ title: 'My 上位3枚 albums', covers: THREE });

    expect(sizeOf(png)).toEqual({ width: 1200, height: 630 });
  });
});
