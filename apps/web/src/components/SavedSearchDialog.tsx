import { Button } from "@epiton/ui";
import { useEffect, useState } from "react";

export type SavedSearchRow = { id: number; name: string; user?: number | null };

/** Save named filter or pick one to delete (replaces window.prompt). */
export function SavedSearchDialog(props: {
  mode: "save" | "delete";
  open: boolean;
  rows?: SavedSearchRow[];
  onCancel: () => void;
  onSave?: (name: string) => void;
  onDelete?: (id: number) => void;
}) {
  const [name, setName] = useState("");
  const [pickId, setPickId] = useState<number | "">("");

  useEffect(() => {
    if (!props.open) return;
    setName("");
    setPickId(props.rows?.[0]?.id ?? "");
  }, [props.open, props.rows]);

  if (!props.open) return null;

  return (
    <div
      className="epiton-ui-confirm-root"
      role="presentation"
      onClick={props.onCancel}
      onKeyDown={(e) => {
        if (e.key === "Escape") props.onCancel();
      }}
    >
      <div
        className="epiton-ui-confirm"
        role="dialog"
        aria-modal
        aria-labelledby="epiton-saved-search-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="epiton-saved-search-title" className="epiton-ui-confirm-title">
          {props.mode === "save" ? "Save filter" : "Delete saved filter"}
        </h2>
        {props.mode === "save" ? (
          <label className="epiton-email-field">
            Name
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Saved search name"
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) props.onSave?.(name.trim());
              }}
            />
          </label>
        ) : (
          <label className="epiton-email-field">
            Filter
            <select
              value={pickId === "" ? "" : String(pickId)}
              onChange={(e) => setPickId(e.target.value ? Number(e.target.value) : "")}
              aria-label="Saved search to delete"
            >
              {(props.rows ?? []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                  {row.user == null ? " (shared)" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="epiton-ui-confirm-actions">
          <Button variant="ghost" onClick={props.onCancel}>
            Cancel
          </Button>
          {props.mode === "save" ? (
            <Button
              variant="primary"
              disabled={!name.trim()}
              onClick={() => props.onSave?.(name.trim())}
            >
              Save
            </Button>
          ) : (
            <Button
              variant="danger"
              disabled={pickId === "" || !Number.isFinite(pickId)}
              onClick={() => {
                if (typeof pickId === "number") props.onDelete?.(pickId);
              }}
            >
              Delete
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
