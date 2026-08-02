import type { JsonObject } from "@epiton/protocol";
import { Button, Panel, StateBlock } from "@epiton/ui";
import {
  type BoardLayout,
  applyBoardOrder,
  parseBoardLayout,
  parseFieldsViewGet,
} from "@epiton/view-engine";
import { useQuery } from "@tanstack/react-query";
import { type DragEvent, useEffect, useMemo, useState } from "react";
import { backendRpcContextKey } from "../lib/backendTruth";
import { useAppStore } from "../lib/store";
import { type BoardActionsCtx, BoardPane, type BoardSelection } from "./BoardPane";

/** Interactive Tryton board: embedded screens + native DnD + selection cross-filter. */
export function BoardWorkspace(props: {
  model: string;
  onOpen: (actionOrModel: string, context: JsonObject) => void;
  onOpenRecord?: (model: string, id: number) => void;
}) {
  const client = useAppStore((s) => s.client);
  const sessionContext = useAppStore((s) => s.sessionContext);
  const sessionRpcScope = backendRpcContextKey(sessionContext);
  const [order, setOrder] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [activeSelection, setActiveSelection] = useState<BoardSelection | null>(null);
  const [actionsCtx, setActionsCtx] = useState<BoardActionsCtx>({});

  // biome-ignore lint/correctness/useExhaustiveDependencies: model changes define a new volatile board projection.
  useEffect(() => {
    setOrder([]);
    setActiveSelection(null);
    setActionsCtx({});
  }, [props.model]);

  const boardQuery = useQuery({
    queryKey: ["model", props.model, "board-view", sessionRpcScope],
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
          Embedded tree/graph/form panes. Selection feeds Sao `_actions` + `active_id` for sibling
          domains; relation-name heuristics remain as fallback. Drag handles rearrange layout.
        </p>
        <div className="epiton-board-toolbar-actions">
          {activeSelection ? (
            <Button
              variant="ghost"
              onClick={() => {
                setActiveSelection(null);
                setActionsCtx({});
              }}
            >
              Clear filter ({activeSelection.model}#{activeSelection.id})
            </Button>
          ) : null}
          <Button
            variant="ghost"
            onClick={() => {
              setOrder([]);
            }}
          >
            Reset layout
          </Button>
        </div>
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
                paneId={tile.id}
                actionName={tile.name}
                title={tile.string}
                onOpen={props.onOpen}
                onOpenRecord={props.onOpenRecord}
                dragging={dragId === tile.id}
                activeSelection={activeSelection}
                actionsCtx={actionsCtx}
                onSelectRecord={(selection) => {
                  setActiveSelection(selection);
                  if (!selection) {
                    setActionsCtx({});
                    return;
                  }
                  setActionsCtx({
                    [selection.actionKey]: {
                      active_id: selection.id,
                      active_ids: [selection.id],
                      active_model: selection.model,
                    },
                  });
                }}
              />
            </li>
          ))}
        </ul>
      </StateBlock>
    </Panel>
  );
}
