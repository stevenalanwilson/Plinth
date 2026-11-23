import { z } from 'zod';

// Zod schemas for new endpoints live here rather than in /shared, because the production build
// only compiles shared/types.ts. The API contract (roadmap P7.2) can be generated from them.

/** Words of letters or digits in any script, joined by single hyphens, as toSlug produces. */
export const slugSchema = z
  .string()
  .max(120)
  .regex(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u);

/** What is typed into an album search: a few letters at least, and not a paragraph. */
export const albumSearchQuerySchema = z.string().trim().min(2).max(80);
