/**
 * talks.test.ts — tests for the Talks.md parser (structured, grouped model).
 *
 * Suites:
 *   A. youtubeVideoId — id extraction across URL shapes.
 *   B. Unit (fixture): section grouping, intro capture, item kind/videoId/note.
 *   C. Integration (real corpus): verified section + item tallies.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildTalksModel, talkItemCount, youtubeVideoId } from './talks.js';
import { TalksSchema } from './types.js';

const FIXTURE = join(fileURLToPath(import.meta.url), '..', 'fixtures', 'talks.fixture.md');

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
  it('returns null for a playlist or non-video URL', () => {
    expect(youtubeVideoId('https://www.youtube.com/playlist?list=PLxyz')).toBeNull();
    expect(youtubeVideoId('https://example.com/video')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// B. Unit — fixture
// ---------------------------------------------------------------------------

describe('buildTalksModel — structure (fixture)', () => {
  let model: ReturnType<typeof buildTalksModel>;
  beforeAll(() => {
    model = buildTalksModel(FIXTURE);
  });

  it('groups items under their `##` section headings (top prose ignored)', () => {
    expect(model.sections.map((s) => s.heading)).toEqual(['YouTube Videos', 'AI Fundamentals']);
  });

  it('captures a section intro when present, else empty string', () => {
    expect(model.sections[0].intro).toBe('');
    expect(model.sections[1].intro).toBe('Educational playlists for the curious.');
  });

  it('classifies items by kind with video ids and trailing notes', () => {
    const [yt, fund] = model.sections;
    expect(yt.items[0]).toEqual({
      title: 'Talk One',
      url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
      kind: 'video',
      videoId: 'aaaaaaaaaaa',
      note: '',
    });
    expect(yt.items[1]).toMatchObject({ kind: 'video', videoId: 'bbbbbbbbbbb', note: 'a short note about talk two' });
    expect(fund.items[0]).toMatchObject({ kind: 'playlist', videoId: null, note: 'intro playlist' });
    expect(fund.items[1]).toMatchObject({ kind: 'link', videoId: null, note: 'not a video' });
  });

  it('counts all items across sections and validates', () => {
    expect(talkItemCount(model)).toBe(4);
    expect(TalksSchema.safeParse(model).success).toBe(true);
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

  it('has the three moved sections', () => {
    expect(model.sections.map((s) => s.heading)).toEqual([
      'YouTube Videos',
      'AI Agents & Foundation Models for Biology',
      'AI Fundamentals',
    ]);
  });

  it('emits the verified item tallies (bump when talks are added)', () => {
    expect(talkItemCount(model)).toBe(19);
    const items = model.sections.flatMap((s) => s.items);
    expect(items.filter((i) => i.kind === 'video')).toHaveLength(14);
    expect(items.filter((i) => i.kind === 'playlist')).toHaveLength(5);
  });

  it('every video item has an 11-char id; passes TalksSchema', () => {
    const videos = model.sections.flatMap((s) => s.items).filter((i) => i.kind === 'video');
    expect(videos.every((v) => (v.videoId ?? '').length === 11)).toBe(true);
    expect(TalksSchema.safeParse(model).success).toBe(true);
  });
});
