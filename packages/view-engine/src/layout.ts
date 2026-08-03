/** Neutral, clean-room normalization of Tryton form layout attributes. */
export interface ViewLayoutAttributes {
  /** Container column count. `null` means unconstrained/automatic. */
  columns: number | null;
  colspan: number;
  rowspan: number;
  xexpand: boolean;
  yexpand: boolean;
  xfill: boolean;
  yfill: boolean;
  xalign: number;
  yalign: number;
  /** Initial paned divider position in CSS pixels. */
  position: number | null;
}

function finiteNumber(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function positiveInteger(raw: string | undefined, fallback: number): number {
  const value = finiteNumber(raw);
  return value !== null && value > 0 ? Math.max(1, Math.trunc(value)) : fallback;
}

function booleanAttribute(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  return !["0", "false", "no", "off"].includes(raw.trim().toLowerCase());
}

function alignment(raw: string | undefined): number {
  const value = finiteNumber(raw);
  if (value === null) return 0.5;
  return Math.max(0, Math.min(1, value));
}

/**
 * Parse common form-layout attributes into bounded values safe for rendering.
 * Missing container `col` follows Tryton's four-column default; non-positive
 * `col` removes the fixed column constraint.
 */
export function parseViewLayoutAttributes(
  attrs: Readonly<Record<string, string>>,
): ViewLayoutAttributes {
  const rawColumns = finiteNumber(attrs.col);
  const columns =
    rawColumns === null ? 4 : rawColumns <= 0 ? null : Math.max(1, Math.trunc(rawColumns));
  const rawPosition = finiteNumber(attrs.position);

  return {
    columns,
    colspan: positiveInteger(attrs.colspan, 1),
    rowspan: positiveInteger(attrs.rowspan, 1),
    xexpand: booleanAttribute(attrs.xexpand, false),
    yexpand: booleanAttribute(attrs.yexpand, false),
    xfill: booleanAttribute(attrs.xfill, true),
    yfill: booleanAttribute(attrs.yfill, true),
    xalign: alignment(attrs.xalign),
    yalign: alignment(attrs.yalign),
    position: rawPosition !== null && rawPosition >= 0 ? rawPosition : null,
  };
}
