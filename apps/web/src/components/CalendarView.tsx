import type { CalendarEventRow } from "@epiton/view-engine";
import type {
  CalendarOptions,
  DateSelectArg,
  EventClickArg,
  EventDropArg,
  EventInput,
} from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";

export function CalendarView(props: {
  events: CalendarEventRow[];
  onSelect?: (id: number) => void;
  /** Create event at clicked/selected date (Sao-light write-back). */
  onCreateAt?: (startIso: string, endIso: string | null) => void;
  /** Persist drag resize/move. Soft-fail upstream. */
  onEventDrop?: (id: number, startIso: string, endIso: string | null) => void;
  height?: number | string;
  editable?: boolean;
}) {
  const events: EventInput[] = props.events.map((e) => ({
    id: String(e.id),
    title: e.title,
    start: e.start,
    end: e.end ?? undefined,
    backgroundColor: e.color ?? undefined,
    borderColor: e.color ?? undefined,
  }));

  const editable = Boolean(props.editable && (props.onCreateAt || props.onEventDrop));

  const options: CalendarOptions = {
    plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
    initialView: "dayGridMonth",
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,timeGridWeek",
    },
    height: props.height ?? 480,
    events,
    editable,
    selectable: Boolean(props.onCreateAt),
    selectMirror: Boolean(props.onCreateAt),
    eventClick: (arg: EventClickArg) => {
      const id = Number(arg.event.id);
      if (Number.isFinite(id)) props.onSelect?.(id);
    },
    dateClick: props.onCreateAt
      ? (arg) => {
          props.onCreateAt?.(arg.dateStr, null);
        }
      : undefined,
    select: props.onCreateAt
      ? (arg: DateSelectArg) => {
          props.onCreateAt?.(arg.startStr, arg.endStr || null);
        }
      : undefined,
    eventDrop: props.onEventDrop
      ? (arg: EventDropArg) => {
          const id = Number(arg.event.id);
          if (!Number.isFinite(id)) return;
          const start = arg.event.startStr;
          const end = arg.event.endStr || null;
          props.onEventDrop?.(id, start, end);
        }
      : undefined,
  };

  return (
    <div className="epiton-calendar">
      <FullCalendar {...options} />
    </div>
  );
}
