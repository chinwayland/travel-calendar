export type TravelEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
};

export type Trip = TravelEvent & { plans: TravelEvent[] };

export function localDay(value: string) {
  if (value.length === 10) return value;
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function buildTrips(events: TravelEvent[]): {
  trips: Trip[];
  otherPlans: TravelEvent[];
} {
  const summaries = events.filter((event) => event.allDay);
  const timed = events.filter((event) => !event.allDay);
  const assigned = new Set<string>();
  const trips = summaries
    .map((summary) => {
      const plans = timed
        .filter((plan) => {
          const day = localDay(plan.start);
          const included = day >= summary.start && day < summary.end;
          if (included) assigned.add(plan.id);
          return included;
        })
        .sort(
          (a, b) =>
            a.start.localeCompare(b.start) || a.title.localeCompare(b.title),
        );
      return { ...summary, plans };
    })
    .sort(
      (a, b) =>
        a.start.localeCompare(b.start) || a.title.localeCompare(b.title),
    );
  return { trips, otherPlans: timed.filter((plan) => !assigned.has(plan.id)) };
}

export function tripDates(trip: TravelEvent) {
  const start = new Date(`${trip.start}T12:00:00`);
  const end = new Date(`${trip.end}T12:00:00`);
  end.setDate(end.getDate() - 1);
  const days = Math.round(
    (Date.parse(trip.end) - Date.parse(trip.start)) / 86400000,
  );
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${formatter.format(start)}${days > 1 ? ` – ${formatter.format(end)}` : ''} · ${days} ${days === 1 ? 'day' : 'days'}`;
}
