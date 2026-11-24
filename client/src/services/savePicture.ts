/** What happened to a picture: sent through the share sheet, saved as a file, or not sent. */
export type PictureOutcome = 'shared' | 'saved' | 'cancelled';

/**
 * The share sheet refused because the tap that asked was too long ago: a picture that took
 * seconds to arrive. The picture is still in hand, so asking again from a new tap works.
 */
export class NeedsAnotherTapError extends Error {
  constructor() {
    super('The share sheet needs a fresh tap');
    this.name = 'NeedsAnotherTapError';
  }
}

function isNamed(error: unknown, name: string): boolean {
  return error instanceof DOMException && error.name === name;
}

function download(file: File): void {
  const address = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = address;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // After the browser has started on the file.
  setTimeout(() => URL.revokeObjectURL(address), 10_000);
}

/**
 * Gets a picture to where the person can use it. A phone's share sheet takes the file straight
 * to Instagram or Photos; where a browser can't share files, it is saved to the device.
 */
export async function savePicture(file: File, title: string): Promise<PictureOutcome> {
  const canShareFiles =
    typeof navigator.canShare === 'function' &&
    typeof navigator.share === 'function' &&
    navigator.canShare({ files: [file] });

  if (canShareFiles) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (error) {
      if (isNamed(error, 'AbortError')) return 'cancelled';
      if (isNamed(error, 'NotAllowedError')) throw new NeedsAnotherTapError();
      // Anything else: the sheet couldn't take it, so save it instead.
    }
  }
  download(file);
  return 'saved';
}
