import { format, isValid, parseISO } from "date-fns";

/** Format Tryton date/datetime strings for display inputs. */
export function formatTrytonDate(value: unknown, withTime = false): string {
  if (value == null || value === "") return "";
  const raw = String(value);
  const parsed = parseISO(raw.includes("T") ? raw : raw.replace(" ", "T"));
  if (!isValid(parsed)) {
    // Already YYYY-MM-DD or datetime-local-ish
    if (!withTime) return raw.slice(0, 10);
    return raw.slice(0, 16).replace(" ", "T");
  }
  return withTime ? format(parsed, "yyyy-MM-dd'T'HH:mm") : format(parsed, "yyyy-MM-dd");
}

export function parseTrytonDateInput(value: string, withTime = false): string | null {
  if (!value) return null;
  if (withTime) {
    const parsed = parseISO(value);
    return isValid(parsed) ? format(parsed, "yyyy-MM-dd HH:mm:ss") : value;
  }
  return value.slice(0, 10);
}
