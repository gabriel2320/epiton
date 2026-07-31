import type { ViewNode } from "./parse";

/** Collect action name attrs from a board (or nested) arch. */
export function boardActionNames(root: ViewNode): string[] {
  return parseBoardLayout(root).tiles.map((t) => t.name);
}

export interface BoardTile {
  /** Stable key: action name (+ index if duplicated). */
  id: string;
  name: string;
  string?: string;
  colspan: number;
}

export interface BoardLayout {
  /** Board `col` attribute (Tryton form-like width units). */
  col: number;
  tiles: BoardTile[];
}

/**
 * Parse Tryton board arch into a grid layout.
 * Walks `action` nodes (including nested groups); honors `col` / `colspan`.
 */
export function parseBoardLayout(root: ViewNode): BoardLayout {
  const col = Math.max(1, Number(root.attrs.col ?? "4") || 4);
  const tiles: BoardTile[] = [];
  const seen = new Map<string, number>();

  function walk(node: ViewNode) {
    if (node.tag === "action" && node.attrs.name) {
      const name = node.attrs.name;
      const n = (seen.get(name) ?? 0) + 1;
      seen.set(name, n);
      const colspan = Math.min(col, Math.max(1, Number(node.attrs.colspan ?? "1") || 1));
      tiles.push({
        id: n > 1 ? `${name}#${n}` : name,
        name,
        string: node.attrs.string || undefined,
        colspan,
      });
    }
    for (const child of node.children) walk(child);
  }

  walk(root);
  return { col, tiles };
}

/** Reorder tiles by id list (unknown ids appended). */
export function applyBoardOrder(layout: BoardLayout, order: string[]): BoardLayout {
  if (!order.length) return layout;
  const byId = new Map(layout.tiles.map((t) => [t.id, t]));
  const next: BoardTile[] = [];
  for (const id of order) {
    const tile = byId.get(id);
    if (tile) {
      next.push(tile);
      byId.delete(id);
    }
  }
  for (const tile of byId.values()) next.push(tile);
  return { ...layout, tiles: next };
}
