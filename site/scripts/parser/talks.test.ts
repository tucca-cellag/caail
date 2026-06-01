/**
 * talks.test.ts — tests for the OtherResources.md YouTube-talks parser.
 *
 * Suites:
 *   A. youtubeVideoId — id extraction across URL shapes.
 *   B. Unit (fixture): only ## YouTube Videos items become talks; titles/urls/ids.
 *   C. Integration (real corpus): verified count + all ids are 11 chars.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildTalksModel, youtubeVideoId } from './talks.js';
import { TalksSchema } from './types.js';

const FIXTURE = join(
  fileURLToPath(import.meta.url),
  '..',
  'fixtures',
  'counts-other-resources.fixture.md',
);

// ---------------------------------------------------------------------------
// A. youtubeVideoId
// ---------------------------------------------------------------------------

describe('youtubeVideoId', () => {
  it('extracts the id from a watch?v= URL', () => {
    expect(youtubeVideoId('https://www.youtube.com/watch?v=CcbDBXmAiuQ')).toBe('CcbDBXmAiuQ');
  });
  it('extracts the id from a youtu.be short URL', () => {
    expect(youtubeVideoId('https://youtu.be/CcbDBXmAiuQ')).toBe('CcbDBXmAiuQ');
  });
  it('returns null when no id is present', () => {
    expect(youtubeVideoId('https://example.com/video')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// B. Unit — fixture scoping
// ---------------------------------------------------------------------------

describe('buildTalksModel — scoping (fixture)', () => {
  let model: ReturnType<typeof buildTalksModel>;
  beforeAll(() => {
    model = buildTalksModel(FIXTURE);
  });

  it('includes only ## YouTube Videos list items, not other sections', () => {
    expect(model.talks).toHaveLength(3);
    expect(model.talks.map((t) => t.title)).toEqual(['Talk One', 'Talk Two', 'Talk Three']);
  });

  it('captures url and extracted videoId for each talk', () => {
    expect(model.talks[0]).toEqual({
      title: 'Talk One',
      url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
      videoId: 'aaaaaaaaaaa',
    });
  });
});

// ---------------------------------------------------------------------------
// C. Integration — real corpus
// ---------------------------------------------------------------------------

describe('buildTalksModel — real corpus', () => {
  let model: ReturnType<typeof buildTalksModel>;
  beforeAll(() => {
    model = buildTalksModel();
  });

  it('emits the verified ground-truth talk count', () => {
    // 5 = current ## YouTube Videos item count; bump when talks are added.
    // MUST equal counts.talks (asserted in generate-data).
    expect(model.talks).toHaveLength(5);
  });

  it('every talk has an 11-char videoId and passes TalksSchema', () => {
    expect(model.talks.every((t) => t.videoId.length === 11)).toBe(true);
    expect(TalksSchema.safeParse(model).success).toBe(true);
  });
});
