import { format, isValid, parseISO } from "date-fns";

export type TrytonDateValue = {
  __class__: "date";
  year: number;
  month: number;
  day: number;
};

export type TrytonDateTimeValue = {
  __class__: "datetime";
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  microsecond: number;
};

export type TrytonTimeValue = {
  __class__: "time";
  hour: number;
  minute: number;
  second: number;
  microsecond: number;
};

type TrytonTemporalValue = TrytonDateValue | TrytonDateTimeValue;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isCalendarDate(year: number, month: number, day: number): boolean {
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

function isClockTime(hour: number, minute: number, second: number, microsecond: number): boolean {
  return (
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59 &&
    second >= 0 &&
    second <= 59 &&
    microsecond >= 0 &&
    microsecond <= 999_999
  );
}

function asTrytonTemporal(value: unknown): TrytonTemporalValue | null {
  if (!isRecord(value)) return null;
  const kind = value.__class__;
  if (kind !== "date" && kind !== "datetime") return null;

  const { year, month, day } = value;
  if (!isInteger(year) || !isInteger(month) || !isInteger(day)) return null;
  if (!isCalendarDate(year, month, day)) return null;

  if (kind === "date") return { __class__: kind, year, month, day };

  const { hour, minute, second, microsecond } = value;
  if (
    !isInteger(hour) ||
    !isInteger(minute) ||
    !isInteger(second) ||
    !isInteger(microsecond) ||
    !isClockTime(hour, minute, second, microsecond)
  ) {
    return null;
  }
  return { __class__: kind, year, month, day, hour, minute, second, microsecond };
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

/** Format Tryton's typed date/datetime wire values (and legacy strings) for HTML inputs. */
export function formatTrytonDate(value: unknown, withTime = false): string {
  if (value == null || value === "") return "";

  const temporal = asTrytonTemporal(value);
  if (temporal) {
    const date = `${pad(temporal.year, 4)}-${pad(temporal.month)}-${pad(temporal.day)}`;
    if (!withTime) return date;
    if (temporal.__class__ === "date") return `${date}T00:00`;
    return `${date}T${pad(temporal.hour)}:${pad(temporal.minute)}`;
  }
  if (typeof value === "object") return "";

  const raw = String(value);
  const parsed = parseISO(raw.includes("T") ? raw : raw.replace(" ", "T"));
  if (!isValid(parsed)) {
    // Already YYYY-MM-DD or datetime-local-ish
    if (!withTime) return raw.slice(0, 10);
    return raw.slice(0, 16).replace(" ", "T");
  }
  return withTime ? format(parsed, "yyyy-MM-dd'T'HH:mm") : format(parsed, "yyyy-MM-dd");
}

/** Encode an HTML date input with the exact typed JSON shape expected by Tryton 8. */
export function parseTrytonDateInput(
  value: string,
  withTime = false,
  previous?: unknown,
): TrytonDateValue | TrytonDateTimeValue | null {
  if (!value) return null;

  const match = value.match(
    withTime
      ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
      : /^(\d{4})-(\d{2})-(\d{2})$/,
  );
  if (!match) return null;

  const [, yearRaw, monthRaw, dayRaw] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!isCalendarDate(year, month, day)) return null;

  if (withTime) {
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6] ?? 0);
    if (hour > 23 || minute > 59 || second > 59) return null;
    return {
      __class__: "datetime",
      year,
      month,
      day,
      hour,
      minute,
      second,
      microsecond: 0,
    };
  }
  const temporal = asTrytonTemporal(previous);
  if (temporal?.__class__ === "datetime") {
    return { ...temporal, year, month, day };
  }
  return { __class__: "date", year, month, day };
}

/** Format Tryton's typed time/datetime wire values (and legacy strings) for HTML inputs. */
export function formatTrytonTime(value: unknown): string {
  if (value == null || value === "") return "";

  const temporal = asTrytonTemporal(value);
  if (temporal?.__class__ === "datetime") {
    return `${pad(temporal.hour)}:${pad(temporal.minute)}`;
  }

  if (isRecord(value) && value.__class__ === "time") {
    const { hour, minute, second, microsecond } = value;
    if (
      isInteger(hour) &&
      isInteger(minute) &&
      isInteger(second) &&
      isInteger(microsecond) &&
      isClockTime(hour, minute, second, microsecond)
    ) {
      return `${pad(hour)}:${pad(minute)}`;
    }
    return "";
  }

  if (typeof value !== "string") return "";
  const match = value.match(/(?:T|\s)?(\d{2}):(\d{2})(?::\d{2})?(?:\.\d+)?$/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return isClockTime(hour, minute, 0, 0) ? `${pad(hour)}:${pad(minute)}` : "";
}

/** Encode an HTML time input, preserving a split datetime field's date component. */
export function parseTrytonTimeInput(
  value: string,
  previous?: unknown,
): TrytonTimeValue | TrytonDateTimeValue | null {
  if (!value) return null;
  const match = value.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  if (!isClockTime(hour, minute, second, 0)) return null;

  const temporal = asTrytonTemporal(previous);
  if (temporal?.__class__ === "datetime") {
    return { ...temporal, hour, minute, second, microsecond: 0 };
  }
  return { __class__: "time", hour, minute, second, microsecond: 0 };
}
