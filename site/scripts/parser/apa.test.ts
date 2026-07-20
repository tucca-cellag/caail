/**
 * apa.test.ts — unit tests for parseApa().
 *
 * Test order:
 *   1. Six must-pass real-corpus references from Papers.md.
 *   2. Graceful / edge-case coverage.
 */

import { describe, it, expect } from 'vitest';
import { parseApa } from './apa.js';

// ---------------------------------------------------------------------------
// 1. Real-corpus must-pass tests
// ---------------------------------------------------------------------------

describe('parseApa — real corpus references', () => {
  it('ref 6: normal reference with en-dash pages (DNABERT)', () => {
    const input =
      '<a id="6">6</a> Ji, Y., Zhou, Z., Liu, H., & Davuluri, R. V. (2021). DNABERT: pre-trained Bidirectional Encoder Representations from Transformers model for DNA-language in genome. *Bioinformatics, 37*(15), 2112–2120. https://doi.org/10.1093/bioinformatics/btab083';

    const result = parseApa(input);

    expect(result.authors).toEqual(['Ji, Y.', 'Zhou, Z.', 'Liu, H.', 'Davuluri, R. V.']);
    expect(result.authorsText).toBe('Ji, Y., Zhou, Z., Liu, H., & Davuluri, R. V.');
    expect(result.year).toBe(2021);
    expect(result.title).toBe(
      'DNABERT: pre-trained Bidirectional Encoder Representations from Transformers model for DNA-language in genome'
    );
    expect(result.journal).toBe('Bioinformatics');
    expect(result.doi).toBe('10.1093/bioinformatics/btab083');
  });

  it('ref 1: volume with trailing comma, article number (Nikkhah)', () => {
    const input =
      '<a id="1">1</a> Nikkhah, A., Rohani, A., Zarei, M., Kulkarni, A., Batarseh, F. A., Blackstone, N. T., & Ovissipour, R. (2023). Toward sustainable culture media: Using artificial intelligence to optimize reduced-serum formulations for cultivated meat. *Science of The Total Environment, 894,* 164988. https://doi.org/10.1016/j.scitotenv.2023.164988';

    const result = parseApa(input);

    expect(result.year).toBe(2023);
    expect(result.title).toBe(
      'Toward sustainable culture media: Using artificial intelligence to optimize reduced-serum formulations for cultivated meat'
    );
    expect(result.journal).toBe('Science of The Total Environment');
    expect(result.doi).toBe('10.1016/j.scitotenv.2023.164988');
    expect(result.authors).toHaveLength(7);
    expect(result.authors![6]).toBe('Ovissipour, R.');
    expect(result.authorsText).toBe(
      'Nikkhah, A., Rohani, A., Zarei, M., Kulkarni, A., Batarseh, F. A., Blackstone, N. T., & Ovissipour, R.'
    );
  });

  it('ref 37: issue, no pages (Kuhl, npj Science of Food)', () => {
    const input =
      '<a id="37">37</a> Kuhl, E. (2025). AI for food: accelerating and democratizing discovery and innovation. *npj Science of Food, 9*(1). https://doi.org/10.1038/s41538-025-00441-8';

    const result = parseApa(input);

    expect(result.journal).toBe('npj Science of Food');
    expect(result.authors).toEqual(['Kuhl, E.']);
    expect(result.year).toBe(2025);
    expect(result.title).toBe(
      'AI for food: accelerating and democratizing discovery and innovation'
    );
    expect(result.doi).toBe('10.1038/s41538-025-00441-8');
  });

  it('ref 92: journal with no volume (TranscriptFormer, Science)', () => {
    const input =
      '<a id="92">92</a> Pearce, J., Simmonds, S., Mahmoudabadi, G., Krishnan, L., Palla, G., Istrate, A., Tarashansky, A., Nelson, B., Valenzuela, O., Li, D., Quake, S., & Karaletsos, T. (2026). TranscriptFormer: A generative cell atlas across 1.5 billion years of evolution. *Science*. https://doi.org/10.1126/science.aec8514';

    const result = parseApa(input);

    expect(result.journal).toBe('Science');
    expect(result.year).toBe(2026);
    expect(result.title).toBe(
      'TranscriptFormer: A generative cell atlas across 1.5 billion years of evolution'
    );
    expect(result.doi).toBe('10.1126/science.aec8514');
    expect(result.authors).toHaveLength(12);
    expect(result.authors![0]).toBe('Pearce, J.');
    expect(result.authors![11]).toBe('Karaletsos, T.');
  });

  it('ref 39: preprint with PLAIN title then italic venue (Datta et al., arXiv)', () => {
    const input =
      '<a id="39">39</a> Datta, B., Buehler, M. J., Chow, Y., Gligoric, K., Jurafsky, D., Kaplan, D. L., Ledesma-Amaro, R., Del Missier, G., Neidhardt, L., Pichara, K., Sanchez-Lengeling, B., Schlangen, M., St. Pierre, S. R., Tagkopoulos, I., Thomas, A., Watson, N. J., & Kuhl, E. (2026). Artificial Intelligence for Food Innovation. *arXiv.* https://doi.org/10.48550/arXiv.2509.21556';

    const result = parseApa(input);

    expect(result.title).toBe('Artificial Intelligence for Food Innovation');
    expect(result.journal).toBe('arXiv');
    expect(result.year).toBe(2026);
    expect(result.doi).toBe('10.48550/arXiv.2509.21556');
    // Verify a few tricky authors
    expect(result.authors).not.toBeNull();
    const authorList = result.authors!;
    expect(authorList).toContain('Del Missier, G.');
    expect(authorList).toContain('St. Pierre, S. R.');
    expect(authorList).toContain('Kuhl, E.');
  });

  it('ref 160: preprint with ITALIC title then plain venue (Narayanan et al., Aviary)', () => {
    const input =
      '<a id="160">160</a> Narayanan, S., Braza, J. D., Griffiths, R.-R., Ponnapati, M., Bou, A., Laurent, J., Kabeli, O., Wellawatte, G., Cox, S., Rodriques, S. G., & White, A. D. (2024). *Aviary: Training Language Agents on Challenging Scientific Tasks.* arXiv. https://doi.org/10.48550/arXiv.2412.21154';

    const result = parseApa(input);

    expect(result.title).toBe('Aviary: Training Language Agents on Challenging Scientific Tasks');
    expect(result.journal).toBe('arXiv');
    expect(result.year).toBe(2024);
    expect(result.doi).toBe('10.48550/arXiv.2412.21154');
    expect(result.authors).not.toBeNull();
    expect(result.authors).toContain('Griffiths, R.-R.');
    expect(result.authors).toContain('White, A. D.');
    expect(result.authors![0]).toBe('Narayanan, S.');
  });
});

// ---------------------------------------------------------------------------
// 1b. Particles, consortium authors, non-ASCII initials, and ellipses (#72)
// ---------------------------------------------------------------------------

describe('parseApa — particles, consortia, non-ASCII initials, ellipses (#72)', () => {
  it('ref 54: surname particles trailing the initials ("De", "de L.")', () => {
    const input =
      '<a id="54">54</a> Ying, K., Magalhães, C. G. De, Camillo, L. P. de L., Van Raamsdonk, J. M., & Gladyshev, V. N. (2025). *Autonomous AI Agents Discover Aging Interventions from Millions of Molecular Profiles.* bioRxiv. https://doi.org/10.1101/2023.02.28.530532';

    const result = parseApa(input);

    expect(result.authors).not.toBeNull();
    expect(result.authors).toContain('Magalhães, C. G. De');
    expect(result.authors).toContain('Camillo, L. P. de L.');
    expect(result.authors).toContain('Van Raamsdonk, J. M.');
    expect(result.authors![0]).toBe('Ying, K.');
    expect(result.authors![result.authors!.length - 1]).toBe('Gladyshev, V. N.');
  });

  it('ref 42/180: non-ASCII initials (Ł., Ø.)', () => {
    const ref42 = parseApa(
      '<a id="42">42</a> Sypetkowski, M., Smoliński, Ł., & Powalski, R. (2026). *OmicsLM.* arXiv. https://doi.org/10.48550/arXiv.2605.06728',
    );
    expect(ref42.authors).toEqual(['Sypetkowski, M.', 'Smoliński, Ł.', 'Powalski, R.']);

    const ref180 = parseApa(
      '<a id="180">180</a> Orth, J. D., Thiele, I., & Palsson, B. Ø. (2010). What is flux balance analysis? *Nature Biotechnology, 28*(3), 245–248. https://doi.org/10.1038/nbt.1614',
    );
    expect(ref180.authors).toEqual(['Orth, J. D.', 'Thiele, I.', 'Palsson, B. Ø.']);
  });

  it('ref 80: a consortium author mid-list is kept, neighbours still pair', () => {
    const input =
      '<a id="80">80</a> Schietgat, L., De Grave, K., Norel, R., DREAM Olfaction Prediction Consortium, Stolovitzky, G., & Meyer, P. (2017). Predicting human olfactory perception from chemical features of odor molecules. *Science, 355*(6327), 820–826. https://doi.org/10.1126/science.aal2014';

    const result = parseApa(input);

    expect(result.authors).toContain('DREAM Olfaction Prediction Consortium');
    // A particle-prefixed surname still pairs with its initials.
    expect(result.authors).toContain('De Grave, K.');
    expect(result.authors).toContain('Stolovitzky, G.');
    expect(result.authors).toContain('Meyer, P.');
  });

  it('ref 158: leading org author, mid-list org, and an APA ellipsis', () => {
    const input =
      '<a id="158">158</a> Center for AI Safety, Phan, L., Hendrycks, D., Scale AI, Han, Z., Shi, S., ... Scaramuzza, D. (2026). A benchmark of expert-level academic questions to assess AI capabilities [Humanity\'s Last Exam]. *Nature, 649*(8099), 1139–1146. https://doi.org/10.1038/s41586-025-09962-4';

    const result = parseApa(input);

    expect(result.authors).toContain('Center for AI Safety');
    expect(result.authors).toContain('Scale AI');
    expect(result.authors).toContain('Phan, L.');
    // The "..." ellipsis is stripped from the following surname.
    expect(result.authors).toContain('Scaramuzza, D.');
    expect(result.authors).not.toContain('... Scaramuzza, D.');
  });

  it('ref 119: consortium at an even position with trailing paired authors', () => {
    const input =
      '<a id="119">119</a> Rosen, Y., Samotorčan, L., Tabula Sapiens Consortium, Quake, S. R., & Leskovec, J. (2026). *Universal Cell Embeddings: A Foundation Model for Cell Biology.* bioRxiv. https://doi.org/10.1101/2023.11.28.568918';

    const result = parseApa(input);

    expect(result.authors).toEqual([
      'Rosen, Y.',
      'Samotorčan, L.',
      'Tabula Sapiens Consortium',
      'Quake, S. R.',
      'Leskovec, J.',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 1c. Bare-token recovery: a no-initials piece no longer nulls the whole run (#96)
// ---------------------------------------------------------------------------

describe('parseApa — bare no-initials token keeps its neighbours (#96)', () => {
  it('internal-comma org suffix ("…, Davis") does not discard the following paired author', () => {
    // "University of California, Davis" splits into two pieces on ", "; the
    // orphaned bare "Davis" used to null the entire list, taking the valid
    // "Smith, J." with it. Now: the org is kept, the bare suffix is dropped
    // (and counted), and the trailing personal author survives.
    const input =
      '<a id="300">300</a> University of California, Davis, Smith, J. (2024). A title. *Nature, 600*. https://doi.org/10.1234/uc';

    const result = parseApa(input);

    expect(result.authors).toEqual(['University of California', 'Smith, J.']);
    // "Davis" was dropped → flagged as information loss, not silent.
    expect(result.authorsDropped).toBe(1);
  });

  it('a mononym mid-list is skipped but its neighbours are preserved', () => {
    // "Plato" alone has no initials; skipping it must not discard "Smith, J.".
    const input =
      '<a id="301">301</a> Plato, Smith, J. (2024). A title. *Nature, 600*. https://doi.org/10.1234/mono';

    const result = parseApa(input);

    expect(result.authors).toEqual(['Smith, J.']);
    expect(result.authorsDropped).toBe(1);
  });

  it('a mid-list malformed personal author (missing-period typo) is dropped AND counted', () => {
    // The regression the cross-model review caught: "Davis, M" (a missing period
    // on the middle author's initial) is a realistic single-typo bibliography
    // error. Both "Davis" and the broken "M" are unpairable → dropped; the valid
    // neighbours survive, and authorsDropped > 0 lets the lint flag the loss that
    // the old whole-list-null behaviour surfaced.
    const input =
      '<a id="304">304</a> Smith, J., Davis, M, Jones, K. (2024). A title. *Nature, 600*. https://doi.org/10.1234/typo';

    const result = parseApa(input);

    expect(result.authors).toEqual(['Smith, J.', 'Jones, K.']);
    expect(result.authorsDropped).toBe(2);
  });

  it('a run that is ONLY bare words still nulls (malformed-flag contract preserved)', () => {
    // No token parses → authors null, so the lint's unparsed-fields warning
    // still fires for a genuinely malformed run (cf. the lone-"Smith" case).
    const input =
      '<a id="302">302</a> Plato, Aristotle (2024). A title. *Nature, 600*. https://doi.org/10.1234/none';

    const result = parseApa(input);

    expect(result.authors).toBeNull();
    expect(result.authorsText).toBe('Plato, Aristotle');
    expect(result.authorsDropped).toBe(2);
  });

  it('a cleanly-paired run reports zero dropped tokens', () => {
    const input =
      '<a id="305">305</a> Smith, J., & Jones, K. (2024). A title. *Nature, 600*. https://doi.org/10.1234/clean';

    const result = parseApa(input);

    expect(result.authors).toEqual(['Smith, J.', 'Jones, K.']);
    expect(result.authorsDropped).toBe(0);
  });

  it('KNOWN LIMITATION (#96 §2): an org name + spaced acronym is read as a person', () => {
    // "World Health Organization, U. N." — "U. N." is byte-identical to real
    // initials ("A. B."), so it is structurally indistinguishable from a
    // personal "Surname, Initials" pair. We deliberately do NOT add a heuristic
    // to catch this, because keying on "multi-word surname" would misparse
    // genuine multi-word surnames ("Lloyd Webber, A. J."). Pinned so the
    // accepted behaviour is intentional, not an accident. Nothing is dropped —
    // the token is (mis)paired, not skipped.
    const input =
      '<a id="303">303</a> World Health Organization, U. N. (2024). A title. *Nature, 600*. https://doi.org/10.1234/who';

    const result = parseApa(input);

    expect(result.authors).toEqual(['World Health Organization, U. N.']);
    expect(result.authorsDropped).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Graceful / edge-case tests
// ---------------------------------------------------------------------------

describe('parseApa — graceful degradation and edge cases', () => {
  it('no year: authorsText = whole anchor-stripped string, other fields null (doi still extracted)', () => {
    const input =
      '<a id="99">99</a> Some Author, A. No year in this string. Some journal. https://doi.org/10.9999/abc';

    const result = parseApa(input);

    expect(result.year).toBeNull();
    expect(result.title).toBeNull();
    expect(result.journal).toBeNull();
    expect(result.authors).toBeNull();
    expect(result.doi).toBe('10.9999/abc');
    // authorsText is always the full anchor-stripped string when no year found
    expect(result.authorsText).toBe(
      'Some Author, A. No year in this string. Some journal. https://doi.org/10.9999/abc'
    );
  });

  it('no DOI: doi is null', () => {
    const input =
      '<a id="5">5</a> Smith, J. (2020). A title. *Nature, 500*. No DOI here.';

    const result = parseApa(input);

    expect(result.doi).toBeNull();
    expect(result.year).toBe(2020);
    expect(result.title).toBe('A title');
  });

  it('dx.doi.org prefix also matches', () => {
    const input =
      '<a id="7">7</a> Smith, J. (2020). A title. *Nature, 500*. http://dx.doi.org/10.1234/xyz';

    const result = parseApa(input);

    expect(result.doi).toBe('10.1234/xyz');
  });

  it('single-author reference (distinct fixture: LeCun 2022, Nature)', () => {
    // Deliberately different author, journal, and year from the ref 37 real-corpus test.
    const input =
      '<a id="200">200</a> LeCun, Y. (2022). A path towards autonomous machine intelligence. *Nature, 605*, 32–38. https://doi.org/10.1038/s41586-022-00001-0';

    const result = parseApa(input);

    expect(result.authors).toHaveLength(1);
    expect(result.authors![0]).toBe('LeCun, Y.');
    expect(result.year).toBe(2022);
    expect(result.journal).toBe('Nature');
    expect(result.title).toBe('A path towards autonomous machine intelligence');
  });

  it('malformed author run: authors null, authorsText preserved', () => {
    // "Smith" alone has no initials pair — can't pair up cleanly
    const input =
      '<a id="50">50</a> Smith (2021). Some title. *Some Journal, 5*. https://doi.org/10.1234/bad';

    const result = parseApa(input);

    expect(result.authors).toBeNull();
    expect(result.authorsText).toBe('Smith');
    expect(result.year).toBe(2021);
    // authorsText is always a string
    expect(typeof result.authorsText).toBe('string');
  });

  it('DOI-only extraction from messy input', () => {
    const input =
      'Broken reference with no anchor https://doi.org/10.5555/messy.entry and no year';

    const result = parseApa(input);

    expect(result.doi).toBe('10.5555/messy.entry');
    expect(result.year).toBeNull();
    expect(result.authorsText).toBe(
      'Broken reference with no anchor https://doi.org/10.5555/messy.entry and no year'
    );
  });

  it('year with letter suffix (2025a)', () => {
    const input =
      '<a id="55">55</a> Brown, C. B. (2025a). Some interesting study. *Journal of Things, 10*(2). https://doi.org/10.9876/test';

    const result = parseApa(input);

    expect(result.year).toBe(2025);
    expect(result.authors).toEqual(['Brown, C. B.']);
    expect(result.authorsText).toBe('Brown, C. B.');
  });

  it('no italic in tail: title and journal gracefully null or extracted', () => {
    const input =
      '<a id="99">99</a> Jones, A. B. (2022). No italics here at all. Some plain text.';

    const result = parseApa(input);

    expect(result.year).toBe(2022);
    expect(result.doi).toBeNull();
    expect(result.title).toBeNull();
    expect(result.journal).toBeNull();
    expect(typeof result.authorsText).toBe('string');
  });

  it('authorsText is always a non-null string even on minimal input', () => {
    const result = parseApa('');
    expect(typeof result.authorsText).toBe('string');
  });

  it('anchor is stripped before all parsing', () => {
    const input1 = '<a id="1">1</a> Smith, J. (2020). Title. *Journal, 1*. https://doi.org/10.0/x';
    const input2 = 'Smith, J. (2020). Title. *Journal, 1*. https://doi.org/10.0/x';

    const r1 = parseApa(input1);
    const r2 = parseApa(input2);

    expect(r1.authorsText).toBe(r2.authorsText);
    expect(r1.authors).toEqual(r2.authors);
    expect(r1.year).toBe(r2.year);
    expect(r1.doi).toBe(r2.doi);
  });

  it('ref 39 and ref 160 are DISTINCT branches (normal vs italic-title)', () => {
    // ref 39: title is PLAIN text before the italic run (normal pattern for preprint)
    const ref39 = parseApa(
      '<a id="39">39</a> Datta, B., & Kuhl, E. (2026). Artificial Intelligence for Food Innovation. *arXiv.* https://doi.org/10.48550/arXiv.2509.21556'
    );
    // ref 160: tail STARTS with italic (preprint italic-title pattern)
    const ref160 = parseApa(
      '<a id="160">160</a> White, A. D. (2024). *Aviary: A Title.* arXiv. https://doi.org/10.48550/arXiv.2412.21154'
    );

    // ref 39: title is the plain part before *…*, journal is italic content
    expect(ref39.title).toBe('Artificial Intelligence for Food Innovation');
    expect(ref39.journal).toBe('arXiv');

    // ref 160: title is the italic content, journal is the plain part after *…*
    expect(ref160.title).toBe('Aviary: A Title');
    expect(ref160.journal).toBe('arXiv');
  });
});
