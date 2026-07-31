import type { CalendarEventRow } from "@epiton/view-engine";
import type { CalendarOptions, EventClickArg, EventInput } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";

export function CalendarView(props: {
  events: CalendarEventRow[];
  onSelect?: (id: number) => void;
  height?: number | string;
}) {
  const events: EventInput[] = props.events.map((e) => ({
    id: String(e.id),
    title: e.title,
    start: e.start,
    end: e.end ?? undefined,
  }));

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
    eventClick: (arg: EventClickArg) => {
      const id = Number(arg.event.id);
      if (Number.isFinite(id)) props.onSelect?.(id);
    },
  };

  return (
    <div className="epiton-calendar">
      <FullCalendar {...options} />
    </div>
  );
}
