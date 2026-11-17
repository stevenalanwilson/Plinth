import { readFile } from 'fs/promises';
import path from 'path';

/**
 * The built client's index.html, or null when there isn't one: in development Vite serves the
 * client itself, so there is no build to read.
 */
export async function loadIndexTemplate(clientDist: string): Promise<string | null> {
  try {
    return await readFile(path.join(clientDist, 'index.html'), 'utf8');
  } catch {
    return null;
  }
}
