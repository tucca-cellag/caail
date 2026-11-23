import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { LOCKUP_ASSET_HEIGHT, LOCKUP_T_CAP_HEIGHT, lockupClearSpace } from './tucca-lockup';

const ASSETS = ['cca-horiz-blkbl.png', 'cca-horiz-white.png'].map((f) =>
  fileURLToPath(new URL(`../assets/tucca/${f}`, import.meta.url)),
);

/** An image's alpha channel as rows of booleans: true where the artwork is. */
async function inkOf(input: string | { raw: Buffer; width: number; height: number }) {
  const img =
    typeof input === 'string'
      ? sharp(input)
      : sharp(input.raw, { raw: { width: input.width, height: input.height, channels: 4 } });
  const { data, info } = await img.ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, at: (x: number, y: number) => data[y * info.width + x] > 128 };
}

/**
 * The height of the first glyph's capital T. From the leftmost column of ink, its top row
 * is the crossbar's top; along the columns carrying ink on that row from there (the
 * crossbar), the longest run of ink straight down is the stem, crossbar included.
 *
 * Found from the left edge, not from the image's top row: the lockup's vertical rule
 * starts higher than the T and runs 153 rows, and an image-wide top row measured it.
 */
function tCapHeight(ink: Awaited<ReturnType<typeof inkOf>>): number {
  const column = (x: number) => [...Array(ink.height).keys()].filter((y) => ink.at(x, y));
  let x = 0;
  while (x < ink.width && column(x).length === 0) x++;
  if (x === ink.width) return 0;
  const top = column(x)[0];
  let longest = 0;
  for (; x < ink.width && ink.at(x, top); x++) {
    let y = top;
    while (y < ink.height && ink.at(x, y)) y++;
    longest = Math.max(longest, y - top);
  }
  return longest;
}

/** A transparent canvas with a T drawn in opaque pixels: crossbar `bar` rows, stem `cap` rows. */
function drawnT(cap: number, bar = 4) {
  const width = 40;
  const height = cap + 12;
  const raw = Buffer.alloc(width * height * 4);
  const paint = (x: number, y: number) => raw.fill(255, (y * width + x) * 4, (y * width + x) * 4 + 4);
  for (let y = 3; y < 3 + bar; y++) for (let x = 5; x < 35; x++) paint(x, y);
  for (let y = 3; y < 3 + cap; y++) for (let x = 18; x < 22; x++) paint(x, y);
  return { raw, width, height };
}

describe("the lockup's clear space", () => {
  it('measures a drawn T at its own height, and a different height differently', async () => {
    expect(tCapHeight(await inkOf(drawnT(30)))).toBe(30);
    expect(tCapHeight(await inkOf(drawnT(31)))).toBe(31);
  });

  it('measures the T, not a taller rule beside it that starts higher', async () => {
    const t = drawnT(30);
    // A one-pixel vertical rule to the right of the T, from row 0 to the bottom.
    for (let y = 0; y < t.height; y++) t.raw.fill(255, (y * t.width + 38) * 4, (y * t.width + 38) * 4 + 4);
    expect(tCapHeight(await inkOf(t))).toBe(30);
  });

  it.each(ASSETS)('matches the T measured in %s', async (file) => {
    const ink = await inkOf(file);
    expect(ink.height, 'the asset is not the size LOCKUP_ASSET_HEIGHT says').toBe(LOCKUP_ASSET_HEIGHT);
    expect(tCapHeight(ink), 'LOCKUP_T_CAP_HEIGHT no longer matches the artwork').toBe(LOCKUP_T_CAP_HEIGHT);
  });

  it('scales with the drawn height', () => {
    expect(lockupClearSpace(LOCKUP_ASSET_HEIGHT)).toBe(LOCKUP_T_CAP_HEIGHT);
    expect(lockupClearSpace(23)).toBeCloseTo((23 * 115) / 169, 6);
  });
});
