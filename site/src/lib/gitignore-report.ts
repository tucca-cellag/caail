/**
 * gitignore-report.ts — reading `git check-ignore -v` output.
 *
 * ONE home for this parse, after three hand-rolled copies of it disagreed, and
 * ONE field split inside it, after the first version of this module disagreed
 * with ITSELF: it handled a Windows drive letter in `isInRepoGitignore` and
 * broke on it in `patternOf`, fifteen lines apart.
 *
 * The output shape is `<source>:<line>:<pattern>\t<pathname>`, and the source
 * may itself contain a colon (`C:/Users/x/.gitignore`), so the fields cannot be
 * recovered by splitting on `:` and taking a fixed index.
 *
 * Two questions get asked of a line, and each has been answered wrongly here:
 *
 *   - WHAT PATTERN MATCHED. Needed because a NEGATION (`!.env.example`) matches
 *     and prints while leaving the path publishable, so the exit code alone is
 *     unusable. A fixed-index split returned `1:!internal-docs/probe` on Windows,
 *     which does not start with `!`, so the negation check silently passed a path
 *     a rule had un-ignored.
 *   - WHETHER THE SOURCE IS IN THIS REPO. Too narrow (`startsWith('.gitignore:')`)
 *     files a real in-repo regression in a NESTED gitignore under "your local git
 *     config is hiding published content from you". Too wide (matching anywhere in
 *     the line, written to fix that) puts a personal `core.excludesFile` back under
 *     "a rule in this repo has been widened", the misdirection the split prevents.
 *
 * No imports. Asserted by a test rather than only stated here, because a
 * constraint written in prose is documented and not mitigated.
 */

/** `<source>` and `<pattern>` for one line, or null if it is not that shape. */
function fields(line: string): { source: string; pattern: string } | null {
  const field = line.split('\t')[0];
  if (!field) return null;
  // LAZY source, so the FIRST `:<digits>:` wins. Greedy takes the LAST, which a
  // pattern containing `:12:` would hijack; lazy stops at the real line number.
  // Either way this is what lets the source carry its own colon.
  const m = /^(.*?):(\d+):(.*)$/.exec(field);
  return m ? { source: m[1], pattern: m[3] } : null;
}

/** The pattern from a `check-ignore -v` line, e.g. `/internal-docs/`. */
export function patternOf(line: string): string {
  return fields(line)?.pattern ?? '';
}

/**
 * Is the reporting source a `.gitignore` inside this repository?
 *
 * git prints an in-repo ignore file as a REPO-RELATIVE path and anything else
 * absolute, so ABSOLUTENESS is the discriminator rather than the filename. A
 * leading-slash test alone is not absoluteness: Git for Windows reports a
 * personal excludes file as `C:/Users/x/.gitignore`, which has no leading slash
 * and would land straight back in the in-repo bucket.
 *
 * `.git/info/exclude` is deliberately false: it is a per-clone exclude file, so
 * it guarantees nothing for anyone else, which is the property the caller asks.
 */
export function isInRepoGitignore(line: string): boolean {
  const f = fields(line);
  if (!f) return false;
  const { source } = f;
  if (!/(^|\/)\.gitignore$/.test(source)) return false;
  return !escapesRepo(source);
}

/**
 * Does this reported source path point outside the repository?
 *
 * THREE WAYS OUT, and each was a separate defect. POSIX absolute (`/Users/x/…`).
 * Windows absolute, which has no leading slash (`C:/Users/x/…`) and once landed
 * straight back in the in-repo bucket. And RELATIVE ESCAPE (`../shared/…`), which
 * a `core.excludesFile` set to a relative path produces: no leading separator, no
 * drive letter, and it ends in `.gitignore`, so a discriminator built only from
 * the first character calls it in-repo and blames this repository for a rule on
 * the developer's machine. That is the misdirection the whole split exists to
 * prevent, arriving from the one direction the pinned cases did not cover.
 *
 * Done with string arithmetic rather than `node:path` on purpose: this module is
 * asserted import-free by `pure-modules.test.ts`, because the guard that reads it
 * must not be takeable down by anything in a dependency chain.
 */
function escapesRepo(source: string): boolean {
  if (source.startsWith('/') || source.startsWith('\\')) return true;
  if (/^[A-Za-z]:[/\\]/.test(source)) return true;
  let depth = 0;
  for (const seg of source.split(/[/\\]/)) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (--depth < 0) return true;
    } else {
      depth++;
    }
  }
  return false;
}
