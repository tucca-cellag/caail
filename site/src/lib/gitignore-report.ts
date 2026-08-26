/**
 * gitignore-report.ts — reading `git check-ignore -v` output.
 *
 * ONE home for this parse, after three hand-rolled copies of it disagreed. The
 * output shape is `<source>:<line>:<pattern>\t<pathname>`, and two questions get
 * asked of it: what the pattern was, and whether the source is a file in THIS
 * repo rather than something on the developer's machine.
 *
 * Each of the copies got the second question wrong in a different direction, and
 * each wrong answer sends the reader somewhere useless:
 *
 *   - Too narrow (`startsWith('.gitignore:')`) files a real in-repo regression
 *     in a NESTED gitignore under "your local git config is hiding published
 *     content from you".
 *   - Too wide (`/(^|\/)\.gitignore:\d+:/`, written to fix that) puts a personal
 *     `core.excludesFile` back under "a rule in this repo has been widened",
 *     which is the misdirection the split existed to prevent.
 *
 * No imports, and the closure must stay clear of anything framework-shaped: the
 * caller is the guard that proves `.env` and the private trees are gitignored,
 * and it should not be takeable down by an unrelated module.
 */

/** The pattern from a `check-ignore -v` line, e.g. `/internal-docs/`. */
export function patternOf(line: string): string {
  if (!line) return '';
  return line.split('\t')[0].split(':').slice(2).join(':');
}

/**
 * Is the reporting source a `.gitignore` inside this repository?
 *
 * git prints an in-repo ignore file as a REPO-RELATIVE path and anything else
 * absolute, so absoluteness is the discriminator rather than the filename.
 *
 * `.git/info/exclude` is deliberately false: it is a per-clone exclude file, so
 * it guarantees nothing for anyone else, which is the property the caller is
 * actually asking about.
 */
export function isInRepoGitignore(line: string): boolean {
  const source = line.split('\t')[0] ?? '';
  // POSIX absolute, plus the Windows shapes `C:/Users/...` and `\\server\share`.
  // Git for Windows reports a personal excludes file with a drive letter, which
  // has no leading slash, so a leading-slash test alone silently reclassifies it
  // as in-repo and reintroduces the exact misattribution this function prevents.
  if (source.startsWith('/') || source.startsWith('\\')) return false;
  if (/^[A-Za-z]:[/\\]/.test(source)) return false;
  return /(^|\/)\.gitignore:\d+:/.test(line);
}
