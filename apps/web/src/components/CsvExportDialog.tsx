import { Button } from "@epiton/ui";
import { useEffect, useState } from "react";

/** Pick export fields before export_data (Sao-light field chooser). */
export function CsvExportDialog(props: {
  open: boolean;
  fieldNames: string[];
  initialSelected?: string[];
  onCancel: () => void;
  onConfirm: (fields: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (!props.open) return;
    const initial =
      props.initialSelected?.filter((f) => props.fieldNames.includes(f)) ??
      props.fieldNames.slice(0, Math.min(8, props.fieldNames.length));
    setSelected(
      initial.length ? initial : ["id", "rec_name"].filter((f) => props.fieldNames.includes(f)),
    );
  }, [props.open, props.fieldNames, props.initialSelected]);

  if (!props.open) return null;

  function toggle(name: string) {
    setSelected((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]));
  }

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
        className="epiton-ui-confirm epiton-csv-import"
        role="dialog"
        aria-modal
        aria-labelledby="epiton-csv-export-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="epiton-csv-export-title">Export CSV fields</h2>
        <p className="text-sm text-[var(--epiton-muted)]">
          Choose columns for <code>export_data</code> ({selected.length} selected)
        </p>
        <div
          className="epiton-toolbar"
          style={{ flexWrap: "wrap", maxHeight: "14rem", overflow: "auto" }}
        >
          {props.fieldNames.map((name) => (
            <label key={name} className="text-sm" style={{ marginRight: "0.75rem" }}>
              <input
                type="checkbox"
                checked={selected.includes(name)}
                onChange={() => toggle(name)}
              />{" "}
              {name}
            </label>
          ))}
        </div>
        <div className="epiton-toolbar">
          <Button
            onClick={() =>
              setSelected(
                props.fieldNames.includes("id") && props.fieldNames.includes("rec_name")
                  ? ["id", "rec_name"]
                  : props.fieldNames.slice(0, 2),
              )
            }
          >
            Minimal
          </Button>
          <Button onClick={() => setSelected([...props.fieldNames])}>All</Button>
          <Button onClick={props.onCancel}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!selected.length}
            onClick={() => props.onConfirm(selected)}
          >
            Export
          </Button>
        </div>
      </div>
    </div>
  );
}
