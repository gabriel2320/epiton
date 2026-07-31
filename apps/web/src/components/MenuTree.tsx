import type { MenuItem } from "@epiton/intelligence";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

interface TreeNode extends MenuItem {
  children: TreeNode[];
}

function buildTree(items: MenuItem[]): TreeNode[] {
  const map = new Map<string | number, TreeNode>();
  for (const item of items) {
    map.set(item.id, { ...item, children: [] });
  }
  const roots: TreeNode[] = [];
  for (const node of map.values()) {
    const parentId = node.parent;
    if (parentId != null && map.has(parentId)) {
      map.get(parentId)?.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function MenuNode(props: {
  node: TreeNode;
  depth: number;
  onOpen: (action: string) => void;
  onPrefetch?: (action: string) => void;
  onToggleFavorite?: (id: number, next: boolean) => void;
}) {
  const [open, setOpen] = useState(props.depth < 1);
  const hasChildren = props.node.children.length > 0;
  const menuId = Number(props.node.id);
  const { t } = useTranslation();

  return (
    <li>
      <div className="epiton-menu-row" style={{ paddingLeft: `${props.depth * 0.65}rem` }}>
        {hasChildren ? (
          <button
            type="button"
            className="epiton-menu-toggle"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "▾" : "▸"}
          </button>
        ) : (
          <span className="epiton-menu-toggle-spacer" />
        )}
        {props.onToggleFavorite && Number.isFinite(menuId) ? (
          <button
            type="button"
            className="epiton-menu-fav"
            aria-label={props.node.favorite ? t("shell.unfavorite") : t("shell.favorite")}
            aria-pressed={Boolean(props.node.favorite)}
            onClick={(e) => {
              e.stopPropagation();
              props.onToggleFavorite?.(menuId, !props.node.favorite);
            }}
          >
            {props.node.favorite ? "★" : "☆"}
          </button>
        ) : null}
        <button
          type="button"
          onMouseEnter={() => {
            if (props.node.action) props.onPrefetch?.(props.node.action);
          }}
          onClick={() => {
            if (props.node.action) props.onOpen(props.node.action);
            else if (hasChildren) setOpen((v) => !v);
          }}
        >
          {props.node.name}
        </button>
      </div>
      {hasChildren && open ? (
        <ul className="epiton-menu-list">
          {props.node.children.map((child) => (
            <MenuNode
              key={child.id}
              node={child}
              depth={props.depth + 1}
              onOpen={props.onOpen}
              onPrefetch={props.onPrefetch}
              onToggleFavorite={props.onToggleFavorite}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function MenuTree(props: {
  items: MenuItem[];
  onOpen: (action: string) => void;
  onPrefetch?: (action: string) => void;
  onToggleFavorite?: (id: number, next: boolean) => void;
  limit?: number;
}) {
  const roots = useMemo(() => {
    const tree = buildTree(props.items);
    const limit = props.limit ?? 80;
    return tree.slice(0, limit);
  }, [props.items, props.limit]);

  return (
    <ul className="epiton-menu-list">
      {roots.map((node) => (
        <MenuNode
          key={node.id}
          node={node}
          depth={0}
          onOpen={props.onOpen}
          onPrefetch={props.onPrefetch}
          onToggleFavorite={props.onToggleFavorite}
        />
      ))}
    </ul>
  );
}
