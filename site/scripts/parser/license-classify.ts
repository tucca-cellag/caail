/**
 * license-classify.ts — deterministic classifier that turns raw license / terms
 * TEXT into a short SPDX-ish tag. Shared by the maintenance scripts:
 *   - fetch-licenses.ts  (deep-read a GitHub LICENSE file when GitHub's own
 *                          matcher returns NOASSERTION)
 *   - scan-licenses.mjs  (read a project/database license or terms page)
 *
 * Design note — ORDER MATTERS: standard-license identity (CC / GPL / Apache /
 * MIT / BSD …) is detected BEFORE any "non-commercial / academic" restriction
 * phrase. This is deliberate: the GPLv3 text contains the word "noncommercially"
 * in its §6b boilerplate, so a naive restriction-first scan mislabels every GPL
 * project as non-commercial. Restriction phrases are only reached for genuinely
 * non-standard / custom terms.
 *
 * This is a heuristic over license TEXT, not a legal determination. Consumers
 * mark the result as a curated / "verify before commercial use" tag, and the
 * auto path (fetch-licenses) accepts only high-confidence STANDARD SPDX ids.
 */

export interface LicenseHit {
  /** Short SPDX-ish tag, e.g. "MIT", "GPL-3.0", "CC-BY-NC-4.0". */
  license: string;
  /** A short verbatim snippet from the source supporting the tag. */
  quote: string;
}

/** Classify raw license/terms text → a tag, or null when nothing is found. */
export function classifyLicenseText(raw: string | null | undefined): LicenseHit | null {
  if (!raw) return null;
  const t = raw.replace(/\s+/g, ' ').trim();
  const s = t.toLowerCase();
  const q = (re: RegExp): string | null => {
    const m = re.exec(t);
    return m ? m[0].slice(0, 180).trim() : null;
  };
  const hit = (license: string, re: RegExp): LicenseHit => ({ license, quote: q(re) || license });

  // Commons Clause rider overrides its base license → source-available (no resale)
  if (/commons clause/.test(s)) return hit('Source-available (Commons Clause)', /commons clause[^.]{0,80}/i);

  // Creative Commons family (build the id from NC / SA / ND + version)
  if (/creativecommons\.org\/publicdomain\/zero|creative commons zero|\bcc0\b|public domain dedication|dedicated to the public domain/.test(s))
    return hit('CC0-1.0', /(cc0|public domain)[^.]{0,80}/i);
  if (
    /creative commons attribution|creativecommons\.org\/licenses\/by|\bcc[\s-]?by\b|\battribution[-\s]?(non[\s-]?commercial|share[\s-]?alike|no[\s-]?deriv)|\battribution[\s-]?[1-4]\.0/.test(
      s,
    )
  ) {
    const nc = /non[\s-]?commercial|by[\s-]?nc\b|licenses\/by-nc/.test(s);
    const sa = /share[\s-]?alike|by[\s-]?nc?[\s-]?sa|licenses\/by(?:-nc)?-sa/.test(s);
    const nd = /no[\s-]?deriv|by[\s-]?nc?[\s-]?nd|licenses\/by(?:-nc)?-nd/.test(s);
    const ver =
      (s.match(/(?:attribution|cc[\s-]?by[\s-a-z]*?|licenses\/by[\s-a-z]*?)[^0-9]{0,12}([1-4](?:\.\d)?)/) || [])[1] ||
      (/unported|\b3\.0\b/.test(s) ? '3.0' : '4.0');
    const id = 'CC-BY' + (nc ? '-NC' : '') + (sa ? '-SA' : nd ? '-ND' : '') + '-' + ver;
    return hit(id, /creative commons[^.]{0,90}/i);
  }

  // GPL family (BEFORE restriction keywords — §6b contains "noncommercially")
  if (/gnu affero general public license|\bagpl\b/.test(s)) return hit('AGPL-3.0', /affero[^.]{0,40}/i);
  if (/gnu lesser general public license|\blgpl\b/.test(s)) return hit(/version 3|v3/.test(s) ? 'LGPL-3.0' : 'LGPL-2.1', /lesser general[^.]{0,40}/i);
  if (/gnu general public license|\bgpl\b/.test(s)) return hit(/version 3|gpl-?3|gplv3/.test(s) ? 'GPL-3.0' : 'GPL-2.0', /general public license[^.]{0,40}/i);
  if (/mozilla public license[^.]{0,20}2\.0|\bmpl-?2\.0\b/.test(s)) return hit('MPL-2.0', /mozilla public[^.]{0,30}/i);
  if (/eclipse public license/.test(s)) return hit('EPL-2.0', /eclipse public[^.]{0,30}/i);

  // Permissive families
  if (/apache license[^.]{0,20}version 2\.0|apache-2\.0|apache software license 2\.0/.test(s)) return hit('Apache-2.0', /apache[^.]{0,40}/i);
  if (/\bmit license\b|permission is hereby granted, free of charge/.test(s)) return hit('MIT', /mit license[^.]{0,40}/i);
  if (/redistribution and use in source and binary/.test(s)) return hit(/neither the name/.test(s) ? 'BSD-3-Clause' : 'BSD-2-Clause', /redistribution and use[^.]{0,50}/i);
  if (/\bisc license\b/.test(s)) return hit('ISC', /isc license[^.]{0,30}/i);
  if (/artistic license[^.]{0,10}2\.0/.test(s)) return hit('Artistic-2.0', /artistic license[^.]{0,30}/i);
  if (/this is free and unencumbered software released into the public domain/.test(s)) return hit('Unlicense', /unencumbered[^.]{0,40}/i);

  // Explicit restriction statements (non-standard / custom terms only)
  if (/for academic[^.]{0,30}(use|research)[^.]{0,30}only|academic use only|non[\s-]?commercial use only|for non[\s-]?commercial|not for commercial|research (and education )?use only|free for academic|academic\/non[\s-]?profit/.test(s))
    return hit('Academic (non-commercial)', /[^.]{0,20}(academic|non[\s-]?commercial)[^.]{0,80}/i);
  // Proprietary needs a SPECIFIC access-restriction phrase — bare "subscription"
  // over-matches (Slack subscription fees, journal subscriptions in a footer).
  if (/subscription (license|terms|required)|requires? (a )?(paid )?subscription|end user license agreement|behind a paywall|commercial license required|all rights reserved.{0,40}(wiley|elsevier|springer)/.test(s))
    return hit('Proprietary', /[^.]{0,30}(subscription (license|terms|required)|license agreement|paywall)[^.]{0,60}/i);

  return null;
}

/**
 * True for a recognised STANDARD SPDX id (the high-confidence set the auto cache
 * accepts from a GitHub LICENSE deep-read). Non-standard tags — "Academic
 * (non-commercial)", "Proprietary", "Source-available (Commons Clause)" — return
 * false and are left to the curated scan + human review.
 */
export function isStandardSpdx(license: string): boolean {
  return /^(MIT|Apache-2\.0|BSD-[23]-Clause|ISC|MPL-2\.0|EPL-2\.0|AGPL-3\.0|LGPL-(2\.1|3\.0)|GPL-[23]\.0|CC0-1\.0|Unlicense|Artistic-2\.0|CC-BY(-NC)?(-SA|-ND)?-[0-9.]+)$/.test(
    license,
  );
}
