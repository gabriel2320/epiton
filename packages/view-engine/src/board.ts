import type { ViewNode } from "./parse";

/** Collect action name attrs from a board (or nested) arch. */
export function boardActionNames(root: ViewNode): string[] {
  const names: string[] = [];
  function walk(node: ViewNode) {
    if (node.tag === "action" && node.attrs.name) {
      names.push(node.attrs.name);
    }
    for (const child of node.children) walk(child);
  }
  walk(root);
  return [...new Set(names)];
}
