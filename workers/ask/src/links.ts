/**
 * What a cited link names. One function, so the corpus build that checks no two
 * entries' links name the same thing and the answer reader that counts which
 * entries an answer cited apply the same rule.
 *
 * Pure: the Worker and the index build both import it.
 */

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
