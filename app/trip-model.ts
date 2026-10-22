export type TravelEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  tripId?: string;
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
  const trips = summaries
    .map((summary): Trip => ({ ...summary, plans: [] }))
    .sort(
      (a, b) =>
        a.start.localeCompare(b.start) || a.title.localeCompare(b.title),
    );
  const owners = new Map<string, Trip>();
  for (const trip of trips) {
    if (trip.tripId && !owners.has(trip.tripId)) owners.set(trip.tripId, trip);
  }
  const otherPlans: TravelEvent[] = [];
  for (const plan of timed) {
    const owner = plan.tripId ? owners.get(plan.tripId) : undefined;
    // Missing or orphaned membership stays accessible without inventing an
    // owner from overlapping dates (or splitting the ends of a booking).
    if (owner) owner.plans.push(plan);
    else otherPlans.push(plan);
  }
  const byStart = (a: TravelEvent, b: TravelEvent) =>
    a.start.localeCompare(b.start) || a.title.localeCompare(b.title);
  for (const trip of trips) trip.plans.sort(byStart);
  return { trips, otherPlans: otherPlans.sort(byStart) };
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
