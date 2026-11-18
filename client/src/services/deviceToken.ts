const STORAGE_KEY = 'plinth-device-token';
const PROBE_KEY = 'plinth-storage-probe';

function localStore(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    // Storage can be blocked outright (some privacy settings).
    return null;
  }
}

/** True when a value can really be kept, which not every browser that has storage allows. */
function canKeep(storage: Storage): boolean {
  try {
    storage.setItem(PROBE_KEY, '1');
    storage.removeItem(PROBE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function getStoredToken(storage: Storage | null = localStore()): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Forgets the token, for when the server says it no longer knows it. */
export function clearDeviceToken(storage: Storage | null = localStore()): void {
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing more can be done about storage that refuses to be written.
  }
}

// Shared, so a page that makes two requests at once asks the server for one token, not two.
let registration: Promise<string | null> | null = null;

async function register(
  askServer: () => Promise<string>,
  storage: Storage,
): Promise<string | null> {
  // A token that can't be kept would be asked for again on every request, filling the server's
  // table, so without storage this device stays anonymous.
  if (!canKeep(storage)) return null;
  try {
    const token = await askServer();
    storage.setItem(STORAGE_KEY, token);
    return token;
  } catch {
    // The server being busy or down mustn't stop a pick: carry on without a token.
    return null;
  }
}

/**
 * This device's token, asked for the first time it is needed. Null when there isn't one to be had
 * (storage unavailable, or the server said no), in which case the request goes ahead anonymously.
 */
export function ensureDeviceToken(
  askServer: () => Promise<string>,
  storage: Storage | null = localStore(),
): Promise<string | null> {
  if (!storage) return Promise.resolve(null);
  const stored = getStoredToken(storage);
  if (stored) return Promise.resolve(stored);

  registration ??= register(askServer, storage).finally(() => {
    registration = null;
  });
  return registration;
}
