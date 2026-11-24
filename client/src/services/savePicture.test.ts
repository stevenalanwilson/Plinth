import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NeedsAnotherTapError, savePicture } from './savePicture';

const file = new File(['picture'], 'my-list.jpg', { type: 'image/jpeg' });
const share = vi.fn();
const canShare = vi.fn();
const createObjectURL = vi.fn();
const revokeObjectURL = vi.fn();
const click = vi.fn();

function setShareSupport(supported: boolean): void {
  Object.defineProperty(navigator, 'share', {
    value: supported ? share : undefined,
    configurable: true,
  });
  Object.defineProperty(navigator, 'canShare', {
    value: supported ? canShare : undefined,
    configurable: true,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  share.mockResolvedValue(undefined);
  canShare.mockReturnValue(true);
  createObjectURL.mockReturnValue('blob:picture');
  Object.assign(URL, { createObjectURL, revokeObjectURL });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(click);
  setShareSupport(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('savePicture', () => {
  it('sends the file through the share sheet where the browser can share files', async () => {
    expect(await savePicture(file, 'My list')).toBe('shared');

    expect(share).toHaveBeenCalledWith({ files: [file], title: 'My list' });
    expect(click).not.toHaveBeenCalled();
  });

  it('saves it as a download where the browser cannot share files', async () => {
    canShare.mockReturnValue(false);

    expect(await savePicture(file, 'My list')).toBe('saved');

    expect(share).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('saves it as a download where there is no share sheet at all', async () => {
    setShareSupport(false);

    expect(await savePicture(file, 'My list')).toBe('saved');
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('names the download as the file is named, and lets the address go afterwards', async () => {
    setShareSupport(false);
    let downloadName = '';
    click.mockImplementation(function (this: HTMLAnchorElement) {
      downloadName = this.download;
    });

    await savePicture(file, 'My list');
    expect(downloadName).toBe('my-list.jpg');
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:picture');
  });

  it('does not save anything when the person closes the share sheet', async () => {
    share.mockRejectedValue(new DOMException('closed', 'AbortError'));

    expect(await savePicture(file, 'My list')).toBe('cancelled');
    expect(click).not.toHaveBeenCalled();
  });

  it('says it needs a fresh tap when the sheet refuses for want of one', async () => {
    share.mockRejectedValue(new DOMException('too late', 'NotAllowedError'));

    await expect(savePicture(file, 'My list')).rejects.toBeInstanceOf(NeedsAnotherTapError);
    expect(click).not.toHaveBeenCalled();
  });

  it('saves it as a download when the sheet fails some other way', async () => {
    share.mockRejectedValue(new Error('the sheet broke'));

    expect(await savePicture(file, 'My list')).toBe('saved');
    expect(click).toHaveBeenCalledTimes(1);
  });
});
