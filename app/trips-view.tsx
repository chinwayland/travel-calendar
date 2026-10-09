'use client';

/* oxlint-disable next/no-img-element -- Static GitHub Pages assets have no image optimization server. */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BedDouble,
  CalendarDays,
  Clock3,
  MapPin,
  Plane,
  Search,
  TrainFront,
  Utensils,
} from 'lucide-react';
import { buildTrips, localDay, tripDates } from './trip-model';
import type { TravelEvent } from './trip-model';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

function PlanIcon({ title }: { title: string }) {
  const Icon = /check.in|check.out|lodging|hotel/i.test(title)
    ? BedDouble
    : /rail|train/i.test(title)
      ? TrainFront
      : /flight|\b[A-Z]{3} to [A-Z]{3}\b/i.test(title)
        ? Plane
        : /dinner|lunch|restaurant/i.test(title)
          ? Utensils
          : CalendarDays;
  return <Icon aria-hidden="true" />;
}

function planTime(event: TravelEvent) {
  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  return `${formatter.format(new Date(event.start))} – ${formatter.format(new Date(event.end))}`;
}

export function TripsView({
  events,
  timezone,
  onShowEvent,
  onShowCalendar,
}: {
  events: TravelEvent[];
  timezone: string;
  onShowEvent: (id: string) => void;
  onShowCalendar: (date: Date) => void;
}) {
  const { trips, otherPlans } = useMemo(() => buildTrips(events), [events]);
  const [filter, setFilter] = useState<'upcoming' | 'past' | 'other'>(
    'upcoming',
  );
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const lastCardRef = useRef<HTMLButtonElement | null>(null);
  const lastTripIdRef = useRef<string | null>(null);
  const listScrollRef = useRef(0);
  const selected = trips.find((trip) => trip.id === selectedId);
  const today = localDay(new Date().toISOString());

  useEffect(() => {
    const restore = () =>
      setSelectedId(new URLSearchParams(window.location.search).get('trip'));
    restore();
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);

  useEffect(() => {
    if (selectedId) {
      panelRef.current?.scrollTo(0, 0);
      headingRef.current?.focus({ preventScroll: true });
    } else {
      panelRef.current?.scrollTo(0, listScrollRef.current);
      lastCardRef.current?.focus({ preventScroll: true });
    }
  }, [selectedId]);

  const selectTrip = (id: string | null) => {
    setSelectedId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('trip', id);
    else url.searchParams.delete('trip');
    window.history.pushState({}, '', url);
  };

  const visibleTrips = trips.filter(
    (trip) =>
      (filter === 'past' ? trip.end <= today : trip.end > today) &&
      `${trip.title} ${trip.location}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  if (filter === 'past') visibleTrips.reverse();
  const plans =
    selected?.plans ??
    otherPlans.filter((plan) =>
      `${plan.title} ${plan.location}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
  const days = [...new Set(plans.map((plan) => localDay(plan.start)))];

  const timeline = (
    <div className="trip-timeline">
      {days.map((day) => (
        <section key={day} className="trip-day" aria-label={day}>
          <h3>
            {new Intl.DateTimeFormat(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            }).format(new Date(`${day}T12:00:00`))}
          </h3>
          <div className="trip-day-plans">
            {plans
              .filter((plan) => localDay(plan.start) === day)
              .map((plan) => (
                <article key={plan.id} className="trip-plan">
                  <span className="trip-plan-icon">
                    <PlanIcon title={plan.title} />
                  </span>
                  <div>
                    <button
                      type="button"
                      className="trip-plan-title"
                      onClick={() => onShowEvent(plan.id)}
                    >
                      {plan.title}
                    </button>
                    <p className="trip-plan-time">
                      <Clock3 aria-hidden="true" />
                      {planTime(plan)}
                    </p>
                    {plan.location && (
                      <p className="trip-plan-location">{plan.location}</p>
                    )}
                  </div>
                </article>
              ))}
          </div>
        </section>
      ))}
      {!plans.length && (
        <p className="trips-empty">
          No plans are available for {selected ? 'this trip' : 'this search'}.
        </p>
      )}
    </div>
  );

  return (
    <div className="trips-view" ref={panelRef}>
      {selected ? (
        <>
          <button
            className="trips-back"
            type="button"
            onClick={() => selectTrip(null)}
          >
            <ArrowLeft aria-hidden="true" />
            Back to Trips
          </button>
          <section className="trip-detail-header">
            <div>
              <h2 ref={headingRef} tabIndex={-1}>
                {selected.title}
              </h2>
              {selected.location && <p>{selected.location}</p>}
              <p className="trip-dates">{tripDates(selected)}</p>
              <button
                type="button"
                className="trips-calendar-link"
                onClick={() =>
                  onShowCalendar(new Date(`${selected.start}T12:00:00`))
                }
              >
                <CalendarDays aria-hidden="true" />
                View in calendar
              </button>
            </div>
            <img
              src={`${basePath}/trip-suitcase.png`}
              alt=""
              className="trip-detail-image"
            />
          </section>
          <div className="trip-timeline-heading">
            <h2>Itinerary</h2>
            <span>
              {selected.plans.length} plans · {timezone}
            </span>
          </div>
          <p className="trip-grouping-note">
            Plans within these trip dates. Plans on overlapping trip dates may
            appear in more than one itinerary.
          </p>
          {timeline}
        </>
      ) : (
        <>
          <fieldset className="trips-tabs">
            <legend className="sr-only">Filter trips</legend>
            {(
              [
                { id: 'upcoming', label: 'Upcoming Trips' },
                { id: 'past', label: 'Past Trips' },
                { id: 'other', label: 'Other Plans' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                aria-pressed={filter === tab.id}
                onClick={() => setFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </fieldset>
          <div className="trips-list-toolbar">
            <p>
              {filter === 'other'
                ? `${plans.length} plans outside trip dates`
                : `${visibleTrips.length} ${filter === 'past' ? 'past' : 'current and upcoming'} trips`}
            </p>
            <label className="trips-search">
              <Search aria-hidden="true" />
              <input
                type="search"
                aria-label="Search trips and locations"
                placeholder="Search trips"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>
          {filter === 'other' ? (
            timeline
          ) : (
            <div className="trip-cards">
              {visibleTrips.map((trip) => (
                <button
                  type="button"
                  className="trip-card"
                  key={trip.id}
                  ref={(element) => {
                    if (trip.id === lastTripIdRef.current)
                      lastCardRef.current = element;
                  }}
                  onClick={() => {
                    lastTripIdRef.current = trip.id;
                    listScrollRef.current = panelRef.current?.scrollTop ?? 0;
                    selectTrip(trip.id);
                  }}
                >
                  <div className="trip-card-copy">
                    <h2>{trip.title}</h2>
                    {trip.location && (
                      <p className="trip-card-location">
                        <MapPin aria-hidden="true" />
                        {trip.location}
                      </p>
                    )}
                    <p className="trip-dates">{tripDates(trip)}</p>
                    <p className="trip-card-status">
                      {trip.start <= today && trip.end > today
                        ? 'In progress'
                        : trip.end <= today
                          ? 'Completed'
                          : 'Upcoming'}{' '}
                      · {trip.plans.length} plans
                    </p>
                    <span className="trip-card-action">
                      View itinerary
                      <ArrowRight aria-hidden="true" />
                    </span>
                  </div>
                  <img
                    src={`${basePath}/trip-suitcase.png`}
                    alt=""
                    loading="lazy"
                  />
                </button>
              ))}
              {!visibleTrips.length && (
                <p className="trips-empty">
                  {query
                    ? 'No trips match your search.'
                    : `No ${filter} trips in the shared calendar.`}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
