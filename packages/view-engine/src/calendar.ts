/** Map Tryton search_read rows to calendar events using calendar arch or common date fields. */

import { formatTrytonCalendarDate } from "./dates";
import type { ViewNode } from "./parse";

export interface CalendarEventRow {
  id: number;
  title: string;
  start: string;
  end?: string | null;
  color?: string | null;
}

export interface CalendarSpec {
  dtstart: string;
  dtend?: string;
  color?: string;
  titleField?: string;
  mode?: string;
}

function displayValue(value: unknown): string {
  if (Array.isArray(value)) return String(value[1] ?? value[0] ?? "");
  return String(value);
}

/**
 * Parse Tryton `<calendar dtstart=… dtend=… color=…>` arch.
 * Falls back to null when the arch is not a calendar.
 */
export function parseCalendarArch(root: ViewNode): CalendarSpec | null {
  const node =
    root.tag === "calendar" ? root : (root.children.find((c) => c.tag === "calendar") ?? null);
  if (node?.tag !== "calendar") return null;
  const dtstart = node.attrs.dtstart ?? node.attrs.start;
  if (!dtstart) return null;
  let titleField: string | undefined;
  for (const child of node.children) {
    if (child.tag === "field" && child.attrs.name) {
      titleField = child.attrs.name;
      break;
    }
  }
  return {
    dtstart,
    dtend: node.attrs.dtend ?? node.attrs.end,
    color: node.attrs.color,
    titleField,
    mode: node.attrs.mode,
  };
}

export function rowsToCalendarEvents(
  rows: Array<Record<string, unknown>>,
  opts?: {
    startField?: string;
    endField?: string;
    titleField?: string;
    colorField?: string;
  },
): CalendarEventRow[] {
  const startField = opts?.startField ?? "start";
  const endField = opts?.endField ?? "end";
  const titleField = opts?.titleField ?? "rec_name";
  const colorField = opts?.colorField;
  const out: CalendarEventRow[] = [];
  for (const row of rows) {
    const id = Number(row.id);
    if (!Number.isFinite(id)) continue;
    const start =
      row[startField] ?? row.appointment_date ?? row.date ?? row.dtstart ?? row.create_date;
    if (start == null) continue;
    const end = row[endField] ?? row.dtend ?? null;
    const formattedStart = formatTrytonCalendarDate(start);
    if (!formattedStart) continue;
    const title = displayValue(row[titleField] ?? row.name ?? `#${id}`);
    const colorRaw = colorField ? row[colorField] : null;
    const color = colorRaw == null ? null : displayValue(colorRaw);
    out.push({
      id,
      title,
      start: formattedStart,
      end: end == null ? null : formatTrytonCalendarDate(end) || null,
      color: color || null,
    });
  }
  return out;
}
