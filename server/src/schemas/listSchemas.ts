import { z } from 'zod';
import { LIST_QUALIFIERS } from '@shared/types';
import { isListId } from '../utils/listIds';

// Zod schemas for the lists endpoints. Shapes only: how many albums a list may hold depends on
// its kind, so that is checked in listService.

// MusicBrainz IDs are UUIDs of more than one version, so any 8-4-4-4-12 hex id is accepted.
const releaseGroupIdSchema = z.guid();

// Far more than any list holds, so a long array is turned away before it is looked at.
const MAX_ALBUMS_IN_REQUEST = 10;

const releaseGroupIdsSchema = z.array(releaseGroupIdSchema).max(MAX_ALBUMS_IN_REQUEST);

export const listIdSchema = z.string().refine(isListId);

export const createListSchema = z.object({
  kind: z.enum(['top']),
  qualifier: z.enum(LIST_QUALIFIERS),
  releaseGroupIds: releaseGroupIdsSchema,
});

export const replaceListSchema = z.object({
  releaseGroupIds: releaseGroupIdsSchema,
});
