/**
 * license-classify.test.ts — the deterministic license-text classifier.
 *
 * The regression cases below are the real false positives this classifier was
 * built to avoid: GPLv3 §6b "noncommercially" boilerplate, a Commons Clause
 * rider, and a bare footer "all rights reserved" / "subscription".
 */

import { describe, it, expect } from 'vitest';

import { classifyLicenseText, isStandardSpdx } from './license-classify.js';

const lic = (s: string) => classifyLicenseText(s)?.license ?? null;

describe('classifyLicenseText', () => {
  it('identifies standard permissive and copyleft licenses', () => {
    expect(lic('The MIT License (MIT). Permission is hereby granted, free of charge')).toBe('MIT');
    expect(lic('Apache License, Version 2.0')).toBe('Apache-2.0');
    expect(lic('Redistribution and use in source and binary forms. Neither the name of the copyright holder')).toBe('BSD-3-Clause');
    expect(lic('GNU Affero General Public License')).toBe('AGPL-3.0');
    expect(lic('GNU Lesser General Public License version 3')).toBe('LGPL-3.0');
  });

  it('detects GPL version and does NOT trip on the §6b "noncommercially" boilerplate', () => {
    // Regression: the GPLv3 text literally contains "noncommercially".
    expect(lic('GNU GENERAL PUBLIC LICENSE Version 3. This alternative is allowed only occasionally and noncommercially')).toBe('GPL-3.0');
    expect(lic('GNU General Public License Version 2, June 1991')).toBe('GPL-2.0');
  });

  it('builds Creative Commons ids from NC / SA / ND + version, strongest restriction first', () => {
    expect(lic('licensed under Creative Commons Attribution 4.0')).toBe('CC-BY-4.0');
    expect(lic('Creative Commons Attribution-ShareAlike 3.0 Unported')).toBe('CC-BY-SA-3.0');
    expect(lic('Creative Commons Attribution-NonCommercial 4.0')).toBe('CC-BY-NC-4.0');
    expect(lic('Attribution-NonCommercial-ShareAlike 4.0 International')).toBe('CC-BY-NC-SA-4.0');
    expect(lic('dedicated to the public domain and licensed under the CC0 License')).toBe('CC0-1.0');
    // classifies a canonical CC URL by its path
    expect(lic('https://creativecommons.org/licenses/by-nc/4.0/')).toBe('CC-BY-NC-4.0');
  });

  it('treats a Commons Clause rider as restricted, not its permissive base', () => {
    expect(lic('Apache-2.0 with the Commons Clause License Condition')).toBe('Source-available (Commons Clause)');
  });

  it('captures explicit non-commercial / academic restrictions', () => {
    expect(lic('for academic research and education use only')).toBe('Academic (non-commercial)');
    expect(lic('BioCyc Individual Subscription License Terms')).toBe('Proprietary');
  });

  it('returns null for weak signals (footer boilerplate, bare subscription)', () => {
    expect(lic('© 2024 Some Lab. All rights reserved.')).toBeNull(); // no false Proprietary
    expect(lic('Help fund our Slack subscription fees and hackathons')).toBeNull(); // nf-core case
    expect(lic('Welcome to our database of enzymes and pathways')).toBeNull();
    expect(lic('')).toBeNull();
  });

  it('isStandardSpdx gates the auto-cache set correctly', () => {
    for (const s of ['MIT', 'Apache-2.0', 'BSD-3-Clause', 'GPL-3.0', 'CC0-1.0', 'CC-BY-NC-SA-4.0']) expect(isStandardSpdx(s)).toBe(true);
    for (const s of ['Proprietary', 'Academic (non-commercial)', 'Source-available (Commons Clause)']) expect(isStandardSpdx(s)).toBe(false);
  });
});
