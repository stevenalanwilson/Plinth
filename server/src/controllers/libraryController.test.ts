import { describe, it, expect, vi } from 'vitest';
import { Request, Response } from 'express';

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createLibrarySyncHandler } from './libraryController';
import { LibraryFullError, LibraryRepository } from '../repositories/libraryRepository';

function makeRes(): {
  res: Response;
  json: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
} {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const res = {
    json,
    status,
    set: vi.fn(),
    locals: { device: { id: 'device-a', accountId: 'account-1' } },
  } as unknown as Response;
  return { res, json, status };
}

describe('createLibrarySyncHandler', () => {
  it('says the crate is full, rather than that something broke, when the account is at its limit', async () => {
    const library: LibraryRepository = {
      sync: vi.fn().mockRejectedValue(new LibraryFullError(5000)),
      removeAll: vi.fn(),
    };
    const { res, status, json } = makeRes();

    await createLibrarySyncHandler(library)({ body: {} } as Request, res);

    expect(status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith({ error: expect.stringContaining('too big') });
  });
});
