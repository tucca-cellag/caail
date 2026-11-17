/** `text` with every regular-expression metacharacter escaped, so a `RegExp` built from it matches it literally. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
