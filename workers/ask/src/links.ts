/**
 * What a cited link names. One function, so the corpus build that checks no two
 * entries' links name the same thing and the answer reader that counts which
 * entries an answer cited apply the same rule.
 *
 * Pure: the Worker and the index build both import it.
 */

/**
 * The characters a corpus link may hold after its scheme, as the body of a
 * regular-expression character class. Every link is written into a Markdown
 * link by the model and found again in its answer, so it must survive both
 * untouched: no spaces, parentheses or brackets, which would end a Markdown link
 * early. The corpus build refuses a link with any other character (corpus.ts,
 * LINK_SAFE), and the answer reader takes a URL as a run of these and nothing
 * else (model.ts), so any other character, typographic punctuation included,
 * ends it.
 */
export const LINK_CHARS = 'A-Za-z0-9.:/?#=_~%-';

/**
 * What can follow a link in an answer without being part of it: sentence
 * punctuation, and Markdown emphasis (`*`, `_`) round a bare link. The answer
 * reader strips these from the end of every URL it finds (model.ts), so the
 * corpus build refuses a link that ends in one (corpus.ts): such a link could
 * never be counted as cited.
 */
export const LINK_TRAILING: ReadonlySet<string> = new Set('.,;:!?*_');

/**
 * What a link names, however it is written, so a citation that reaches the
 * right entry is counted, and one that does not, is not:
 *   - a link with an `item` value is its page and its item: the origin, the
 *     decoded path without a trailing slash, and the decoded item. Its fragment
 *     does not count, but its page does, since the right item on another page
 *     lands the reader on a page that ignores it;
 *   - any other link is its page and its anchor: the origin, the decoded path
 *     without a trailing slash, and the decoded fragment.
 * The origin is kept, so a look-alike host never names an entry. The URL parser
 * lowercases the scheme and host. Null for a link that does not parse or decode.
 */
export function linkKey(link: string): string | null {
  try {
    const url = new URL(link);
    const decoded = decodeURIComponent(url.pathname);
    const path = decoded.endsWith('/') ? decoded.slice(0, -1) : decoded;
    const item = url.searchParams.get('item');
    if (item !== null) return JSON.stringify([url.origin, path, 'item', item]);
    return JSON.stringify([url.origin, path, decodeURIComponent(url.hash)]);
  } catch {
    return null;
  }
}
