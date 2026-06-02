import type { Root } from 'mdast';

/** Remove a single leading depth-1 heading (Starlight renders the page title H1 itself). */
export function stripLeadingH1() {
  return (tree: Root) => {
    const first = tree.children[0];
    if (first && first.type === 'heading' && first.depth === 1) {
      tree.children.shift();
    }
  };
}
