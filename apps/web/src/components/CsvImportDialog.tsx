import { parseCsv } from "@epiton/protocol";
import { Button } from "@epiton/ui";
import { useEffect, useMemo, useState } from "react";

/** Map CSV headers → model fields before import_data (Sao-style mapping step). */
export function CsvImportDialog(props: {
  open: boolean;
  fieldNames: string[];
  csvText: string;
  onCancel: () => void;
  onConfirm: (mapping: string[]) => void;
}) {
  const parsed = useMemo(() => {
    if (!props.open || !props.csvText) return { headers: [] as string[] };
    const rows = parseCsv(props.csvText);
    return { headers: (rows[0] ?? []).map((h) => h.trim()) };
  }, [props.open, props.csvText]);

  const [mapping, setMapping] = useState<string[]>([]);

  useEffect(() => {
    if (!props.open) return;
    setMapping(
      parsed.headers.map((h) => {
        const exact = props.fieldNames.find((f) => f === h);
        if (exact) return exact;
        const ci = props.fieldNames.find((f) => f.toLowerCase() === h.toLowerCase());
        return ci ?? "";
      }),
    );
  }, [props.open, parsed.headers, props.fieldNames]);

  if (!props.open) return null;

  const mappedCount = mapping.filter((m) => m.trim()).length;

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
        aria-labelledby="epiton-csv-import-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="epiton-csv-import-title" className="epiton-ui-confirm-title">
          Map CSV columns
        </h2>
        <p className="epiton-ui-confirm-desc">
          Match each CSV header to a model field. Unmapped columns are skipped.
        </p>
        <div className="epiton-csv-map">
          {parsed.headers.map((header, col) => (
            // Column order is the CSV identity; headers may duplicate.
            // biome-ignore lint/suspicious/noArrayIndexKey: stable CSV column slot
            <label key={col} className="epiton-csv-map-row">
              <span className="epiton-csv-map-header">{header || `(col ${col + 1})`}</span>
              <select
                aria-label={`Map ${header || col}`}
                value={mapping[col] ?? ""}
                onChange={(e) => {
                  const next = [...mapping];
                  next[col] = e.target.value;
                  setMapping(next);
                }}
              >
                <option value="">— skip —</option>
                {props.fieldNames.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="epiton-ui-confirm-actions">
          <Button variant="ghost" onClick={props.onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={mappedCount === 0}
            onClick={() => props.onConfirm(mapping)}
          >
            Import ({mappedCount} fields)
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Remap CSV to fields + data-only CSV for importModelCsv({ header: false }). */
export function applyCsvColumnMapping(
  csvText: string,
  mapping: string[],
): { fields: string[]; dataCsv: string } {
  const rows = parseCsv(csvText);
  if (!rows.length) return { fields: [], dataCsv: "" };
  const dataRows = rows.slice(1);
  const indexes = mapping
    .map((field, idx) => (field.trim() ? { field: field.trim(), idx } : null))
    .filter((x): x is { field: string; idx: number } => x != null);
  const fields = indexes.map((x) => x.field);
  const escaped = dataRows.map((row) =>
    indexes.map(({ idx }) => csvEscapeCell(row[idx] ?? "")).join(","),
  );
  return { fields, dataCsv: escaped.join("\n") };
}

function csvEscapeCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
