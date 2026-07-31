import { Button, Panel, StateBlock } from "@epiton/ui";
import {
  type BoardLayout,
  applyBoardOrder,
  parseBoardLayout,
  parseFieldsViewGet,
} from "@epiton/view-engine";
import { useQuery } from "@tanstack/react-query";
import { type DragEvent, useEffect, useMemo, useState } from "react";
import { useAppStore } from "../lib/store";
import { BoardPane } from "./BoardPane";

function layoutStorageKey(model: string): string {
  return `epiton.board.order.${model}`;
}

function loadOrder(model: string): string[] {
  try {
    const raw = sessionStorage.getItem(layoutStorageKey(model));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveOrder(model: string, order: string[]) {
  try {
    sessionStorage.setItem(layoutStorageKey(model), JSON.stringify(order));
  } catch {
    /* ignore quota */
  }
}

/** Interactive Tryton board: embedded analytics panes + native HTML5 drag-and-drop. */
export function BoardWorkspace(props: {
  model: string;
  onOpen: (actionOrModel: string) => void;
}) {
  const client = useAppStore((s) => s.client);
  const sessionContext = useAppStore((s) => s.sessionContext);
  const [order, setOrder] = useState<string[]>(() => loadOrder(props.model));
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    setOrder(loadOrder(props.model));
  }, [props.model]);

  const boardQuery = useQuery({
    queryKey: ["model", props.model, "board-view"],
    enabled: Boolean(client),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!client) return { layout: null as BoardLayout | null, error: "No client" };
      try {
        const fv = parseFieldsViewGet(
          await client.fieldsViewGet(props.model, null, "board", sessionContext),
        );
        return { layout: parseBoardLayout(fv.arch), error: null as string | null };
      } catch (err) {
        return {
          layout: null,
          error: err instanceof Error ? err.message : "Board view unavailable",
        };
      }
    },
  });

  const layout = useMemo(() => {
    const base = boardQuery.data?.layout;
    if (!base) return null;
    return applyBoardOrder(base, order);
  }, [boardQuery.data?.layout, order]);

  const state = boardQuery.isLoading
    ? "loading"
    : boardQuery.data?.error
      ? "error"
      : layout?.tiles.length
        ? "data"
        : "empty";

  function reorder(fromId: string, toId: string) {
    if (!layout || fromId === toId) return;
    const ids = layout.tiles.map((t) => t.id);
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(toId);
    if (from < 0 || to < 0) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, fromId);
    setOrder(next);
    saveOrder(props.model, next);
  }

  function onDragStart(e: DragEvent, id: string) {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function onDrop(e: DragEvent, toId: string) {
    e.preventDefault();
    const fromId = e.dataTransfer.getData("text/plain") || dragId;
    setDragId(null);
    if (fromId) reorder(fromId, toId);
  }

  const col = layout?.col ?? 4;

  return (
    <Panel title={`Board · ${props.model}`}>
      <div className="epiton-board-toolbar">
        <p className="epiton-board-hint" role="note">
          Drag panes to rearrange. Charts use Tryton `search_read` / graph arch — trytond stays
          authoritative.
        </p>
        <Button
          variant="ghost"
          onClick={() => {
            setOrder([]);
            saveOrder(props.model, []);
          }}
        >
          Reset layout
        </Button>
      </div>
      <StateBlock state={state} message={boardQuery.data?.error ?? "No board actions in arch"}>
        <ul
          className="epiton-board-grid"
          style={{ gridTemplateColumns: `repeat(${col}, minmax(0, 1fr))` }}
        >
          {(layout?.tiles ?? []).map((tile) => (
            <li
              key={tile.id}
              className="epiton-board-cell"
              style={{ gridColumn: `span ${Math.min(tile.colspan, col)}` }}
              draggable
              onDragStart={(e) => onDragStart(e, tile.id)}
              onDragOver={onDragOver}
              onDrop={(e) => onDrop(e, tile.id)}
              onDragEnd={() => setDragId(null)}
              data-dragging={dragId === tile.id}
            >
              <div className="epiton-board-drag-handle" aria-hidden>
                ⋮⋮
              </div>
              <BoardPane
                actionName={tile.name}
                title={tile.string}
                onOpen={props.onOpen}
                dragging={dragId === tile.id}
              />
            </li>
          ))}
        </ul>
      </StateBlock>
    </Panel>
  );
}
