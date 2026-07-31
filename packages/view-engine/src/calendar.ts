/** Map Tryton search_read rows to calendar events using common date field names. */
export interface CalendarEventRow {
  id: number;
  title: string;
  start: string;
  end?: string | null;
}

export function rowsToCalendarEvents(
  rows: Array<Record<string, unknown>>,
  opts?: { startField?: string; endField?: string; titleField?: string },
): CalendarEventRow[] {
  const startField = opts?.startField ?? "start";
  const endField = opts?.endField ?? "end";
  const titleField = opts?.titleField ?? "rec_name";
  const out: CalendarEventRow[] = [];
  for (const row of rows) {
    const id = Number(row.id);
    if (!Number.isFinite(id)) continue;
    const start =
      row[startField] ?? row.appointment_date ?? row.date ?? row.dtstart ?? row.create_date;
    if (start == null) continue;
    const end = row[endField] ?? row.dtend ?? null;
    const title = String(row[titleField] ?? row.name ?? `#${id}`);
    out.push({
      id,
      title,
      start: String(start),
      end: end == null ? null : String(end),
    });
  }
  return out;
}
