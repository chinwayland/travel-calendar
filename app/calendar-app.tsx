'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type {
  DatesSetArg,
  EventClickArg,
  EventContentArg,
  EventMountArg,
} from '@fullcalendar/core';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { DateClickArg } from '@fullcalendar/interaction';
import multiMonthPlugin from '@fullcalendar/multimonth';
import timeGridPlugin from '@fullcalendar/timegrid';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  PanelLeft,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

type CalendarView = 'day' | 'week' | 'month' | 'year';

type TravelEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
};

type CalendarData = {
  generatedAt: string;
  source: string;
  isSample: boolean;
  eventCount: number;
  events: TravelEvent[];
};

const viewNames: Record<CalendarView, string> = {
  day: 'timeGridDay',
  week: 'timeGridWeek',
  month: 'dayGridMonth',
  year: 'multiMonthYear',
};

const reverseViewNames: Record<string, CalendarView> = {
  timeGridDay: 'day',
  timeGridWeek: 'week',
  dayGridMonth: 'month',
  multiMonthYear: 'year',
};

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const mobileSidebarQuery = '(max-width: 880px)';

function isCalendarView(value: string | null): value is CalendarView {
  return (
    value === 'day' || value === 'week' || value === 'month' || value === 'year'
  );
}

function validDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
    ? value
    : null;
}

function subscribeToTimezone() {
  return () => {};
}

function clientTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time';
}

function serverTimezone() {
  return 'local time';
}

function clientHydrated() {
  return true;
}

function serverHydrated() {
  return false;
}

function subscribeToMobileSidebar(onChange: () => void) {
  const mediaQuery = window.matchMedia(mobileSidebarQuery);
  mediaQuery.addEventListener('change', onChange);
  return () => mediaQuery.removeEventListener('change', onChange);
}

function clientMobileSidebar() {
  return window.matchMedia(mobileSidebarQuery).matches;
}

function serverMobileSidebar() {
  return false;
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return [year, month, day].join('-');
}

function dateFromDateOnly(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function formatDateOnlyRange(start: string, end: string) {
  const startDate = dateFromDateOnly(start);
  const endDate = dateFromDateOnly(end);
  endDate.setDate(endDate.getDate() - 1);

  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  if (dateKey(startDate) === dateKey(endDate)) {
    return dateFormatter.format(startDate) + ' · All day';
  }

  const shortFormatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year:
      startDate.getFullYear() === endDate.getFullYear() ? undefined : 'numeric',
  });

  return (
    shortFormatter.format(startDate) +
    ' – ' +
    dateFormatter.format(endDate) +
    ' · All day'
  );
}

function formatEventSchedule(event: TravelEvent) {
  if (event.allDay) return formatDateOnlyRange(event.start, event.end);

  const start = new Date(event.start);
  const end = new Date(event.end);
  const sameDay = dateKey(start) === dateKey(end);

  const startFormatter = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const endFormatter = new Intl.DateTimeFormat(undefined, {
    weekday: sameDay ? undefined : 'short',
    month: sameDay ? undefined : 'short',
    day: sameDay ? undefined : 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  return startFormatter.format(start) + ' – ' + endFormatter.format(end);
}

function formatUpdated(data: CalendarData | null) {
  if (!data) return 'Loading calendar…';
  if (data.isSample) return 'Preview schedule';
  const date = new Date(data.generatedAt);
  if (Number.isNaN(date.getTime())) return 'Recently updated';
  return (
    'Updated ' +
    new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date)
  );
}

function validateData(value: unknown): CalendarData {
  if (!value || typeof value !== 'object')
    throw new Error('Invalid calendar data');
  const candidate = value as CalendarData;
  if (!Array.isArray(candidate.events))
    throw new Error('Invalid calendar events');
  return candidate;
}

function SidebarContents({
  currentDate,
  data,
  timezone,
  onSelectDate,
}: {
  currentDate: Date;
  data: CalendarData | null;
  timezone: string;
  onSelectDate: (date: Date) => void;
}) {
  return (
    <div className="sidebar-contents">
      <Calendar
        mode="single"
        month={currentDate}
        selected={currentDate}
        onMonthChange={onSelectDate}
        onSelect={(date) => date && onSelectDate(date)}
        fixedWeeks
        weekStartsOn={1}
        className="sidebar-date-picker"
      />

      <section
        className="sidebar-section"
        aria-labelledby="calendar-list-heading"
      >
        <h2 id="calendar-list-heading" className="sidebar-label">
          CALENDARS
        </h2>
        <div className="calendar-source">
          <span className="source-dot" aria-hidden="true" />
          <span>Trips</span>
          <span className="source-count">{data?.eventCount ?? '—'}</span>
        </div>
      </section>

      <div className="sidebar-meta">
        <span>{formatUpdated(data)}</span>
        <span>Times shown in {timezone}</span>
        <span className="privacy-note">
          Only titles, times, and locations are shared.
        </span>
      </div>
    </div>
  );
}

export default function CalendarApp() {
  const calendarRef = useRef<FullCalendar>(null);
  const initializedRef = useRef(false);
  const historyModeRef = useRef<'push' | 'replace' | 'none'>('replace');
  const [data, setData] = useState<CalendarData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [title, setTitle] = useState('');
  const [view, setView] = useState<CalendarView>('month');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedEvent, setSelectedEvent] = useState<TravelEvent | null>(null);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const hydrated = useSyncExternalStore(
    subscribeToTimezone,
    clientHydrated,
    serverHydrated,
  );
  const isMobileSidebar = useSyncExternalStore(
    subscribeToMobileSidebar,
    clientMobileSidebar,
    serverMobileSidebar,
  );
  const timezone = useSyncExternalStore(
    subscribeToTimezone,
    clientTimezone,
    serverTimezone,
  );

  useEffect(() => {
    let active = true;
    fetch(basePath + '/calendar-data.json', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('Calendar data is unavailable');
        return response.json();
      })
      .then((value) => {
        if (active) setData(validateData(value));
      })
      .catch(() => {
        if (active) setLoadError('The latest itinerary could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, []);

  const eventMap = useMemo(
    () => new Map((data?.events ?? []).map((event) => [event.id, event])),
    [data],
  );

  const syncUrl = useCallback((nextView: CalendarView, date: Date) => {
    if (!initializedRef.current || historyModeRef.current === 'none') {
      historyModeRef.current = 'replace';
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.set('view', nextView);
    url.searchParams.set('date', dateKey(date));
    if (url.href !== window.location.href) {
      if (historyModeRef.current === 'push') {
        window.history.pushState({}, '', url);
      } else {
        window.history.replaceState({}, '', url);
      }
    }
    historyModeRef.current = 'replace';
  }, []);

  const applyUrlState = useCallback(() => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    const params = new URLSearchParams(window.location.search);
    const requestedView = params.get('view');
    const requestedDate = validDate(params.get('date'));
    const nextView = isCalendarView(requestedView) ? requestedView : 'month';

    historyModeRef.current = 'none';
    if (requestedDate) api.gotoDate(requestedDate);
    api.changeView(viewNames[nextView]);
    historyModeRef.current = 'replace';
  }, []);

  useEffect(() => {
    applyUrlState();
    initializedRef.current = true;
    const api = calendarRef.current?.getApi();
    if (api) {
      const activeView = reverseViewNames[api.view.type] ?? 'month';
      syncUrl(activeView, api.getDate());
    }

    const onPopState = () => applyUrlState();
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [applyUrlState, syncUrl]);

  const handleDatesSet = (info: DatesSetArg) => {
    const nextView = reverseViewNames[info.view.type] ?? 'month';
    const date = info.view.calendar.getDate();
    setTitle(info.view.title);
    setView(nextView);
    setCurrentDate(date);
    syncUrl(nextView, date);
  };

  const move = (direction: 'prev' | 'next' | 'today') => {
    historyModeRef.current = 'push';
    calendarRef.current?.getApi()[direction]();
  };

  const changeView = (nextView: CalendarView, date?: Date) => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    historyModeRef.current = 'push';
    api.changeView(viewNames[nextView], date);
  };

  const selectDate = (date: Date) => {
    historyModeRef.current = 'push';
    calendarRef.current?.getApi().gotoDate(date);
    setMobileSidebarOpen(false);
  };

  const showEvent = (id: string) => {
    const event = eventMap.get(id);
    if (event) setSelectedEvent(event);
  };

  const handleEventClick = (info: EventClickArg) => {
    info.jsEvent.preventDefault();
    showEvent(info.event.id);
  };

  const handleEventMount = (info: EventMountArg) => {
    const event = eventMap.get(info.event.id);
    if (!event) return;
    info.el.setAttribute('role', 'button');
    info.el.setAttribute('tabindex', '0');
    info.el.setAttribute(
      'aria-label',
      event.title + ', ' + formatEventSchedule(event),
    );
    info.el.addEventListener('keydown', (keyboardEvent) => {
      if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
        keyboardEvent.preventDefault();
        showEvent(info.event.id);
      }
    });
  };

  const handleDateClick = (info: DateClickArg) => {
    if (view === 'year' || (view === 'month' && window.innerWidth < 620)) {
      changeView('day', info.date);
    }
  };

  const eventContent = (info: EventContentArg) => {
    const location = info.event.extendedProps.location as string | undefined;
    const isTimeline =
      info.view.type === 'timeGridDay' || info.view.type === 'timeGridWeek';
    return (
      <div className="event-content">
        {info.timeText && <span className="event-time">{info.timeText}</span>}
        <span className="event-title">{info.event.title}</span>
        {isTimeline && location && (
          <span className="event-location">{location}</span>
        )}
      </div>
    );
  };

  const toggleSidebar = () => {
    if (isMobileSidebar) {
      setMobileSidebarOpen(true);
    } else {
      setSidebarVisible((visible) => !visible);
    }
  };

  return (
    <>
      <div
        className={
          'calendar-shell' + (sidebarVisible ? '' : ' sidebar-collapsed')
        }
      >
        <header className="app-toolbar">
          <div className="toolbar-group toolbar-leading">
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label={
                isMobileSidebar
                  ? 'Open calendar sidebar'
                  : sidebarVisible
                    ? 'Hide calendar sidebar'
                    : 'Show calendar sidebar'
              }
              aria-controls={
                isMobileSidebar
                  ? 'mobile-calendar-sidebar'
                  : 'desktop-calendar-sidebar'
              }
              aria-expanded={
                isMobileSidebar ? mobileSidebarOpen : sidebarVisible
              }
              onClick={toggleSidebar}
            >
              <PanelLeft aria-hidden="true" />
            </Button>
            <nav className="period-nav" aria-label="Calendar navigation">
              <Button
                variant="outline"
                size="icon-lg"
                aria-label="Previous period"
                onClick={() => move('prev')}
              >
                <ChevronLeft aria-hidden="true" />
              </Button>
              <Button variant="outline" size="lg" onClick={() => move('today')}>
                Today
              </Button>
              <Button
                variant="outline"
                size="icon-lg"
                aria-label="Next period"
                onClick={() => move('next')}
              >
                <ChevronRight aria-hidden="true" />
              </Button>
            </nav>
          </div>

          <h1 className="period-title" aria-live="polite">
            {title || 'Travel Calendar'}
          </h1>

          <fieldset className="view-switcher">
            <legend className="sr-only">Calendar view</legend>
            {(['day', 'week', 'month', 'year'] as CalendarView[]).map(
              (item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={view === item}
                  onClick={() => changeView(item)}
                >
                  {item[0].toUpperCase() + item.slice(1)}
                </button>
              ),
            )}
          </fieldset>
        </header>

        <aside
          id="desktop-calendar-sidebar"
          className="calendar-sidebar"
          aria-label="Calendar controls"
        >
          {hydrated ? (
            <SidebarContents
              currentDate={currentDate}
              data={data}
              timezone={timezone}
              onSelectDate={selectDate}
            />
          ) : (
            <output className="sidebar-loading">Preparing calendar…</output>
          )}
        </aside>

        <main className="calendar-main" aria-label="Wayland’s travel calendar">
          {data?.isSample && (
            <output className="preview-banner">
              <CalendarDays aria-hidden="true" />
              Preview itinerary — the private TripIt feed is connected during
              publishing.
            </output>
          )}
          {data && !data.isSample && data.eventCount === 0 && (
            <output className="empty-banner">
              <CalendarDays aria-hidden="true" />
              No trips are currently scheduled in the shared calendar window.
            </output>
          )}
          {loadError && (
            <div className="error-banner" role="alert">
              {loadError}
            </div>
          )}
          {!data && !loadError && (
            <output className="calendar-loading">Loading itinerary…</output>
          )}
          <FullCalendar
            ref={calendarRef}
            plugins={[
              dayGridPlugin,
              timeGridPlugin,
              multiMonthPlugin,
              interactionPlugin,
            ]}
            initialView="dayGridMonth"
            headerToolbar={false}
            height="100%"
            firstDay={1}
            nowIndicator
            stickyHeaderDates
            allDaySlot
            dayMaxEvents={3}
            moreLinkClick="popover"
            navLinks={false}
            multiMonthMaxColumns={4}
            multiMonthMinWidth={210}
            dayMinWidth={110}
            slotMinTime="00:00:00"
            slotMaxTime="24:00:00"
            slotDuration="01:00:00"
            slotLabelInterval="01:00"
            scrollTime="07:00:00"
            events={data?.events ?? []}
            datesSet={handleDatesSet}
            dateClick={handleDateClick}
            eventClick={handleEventClick}
            eventDidMount={handleEventMount}
            eventContent={eventContent}
            eventTimeFormat={{
              hour: 'numeric',
              minute: '2-digit',
              meridiem: 'short',
            }}
          />
        </main>
      </div>

      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent
          id="mobile-calendar-sidebar"
          side="left"
          className="mobile-calendar-sheet"
        >
          <SheetHeader>
            <SheetTitle>Travel Calendar</SheetTitle>
            <SheetDescription>
              Choose a date and check calendar freshness.
            </SheetDescription>
          </SheetHeader>
          {hydrated && (
            <SidebarContents
              currentDate={currentDate}
              data={data}
              timezone={timezone}
              onSelectDate={selectDate}
            />
          )}
        </SheetContent>
      </Sheet>

      <Dialog
        open={Boolean(selectedEvent)}
        onOpenChange={(open) => !open && setSelectedEvent(null)}
      >
        <DialogContent className="event-dialog">
          {selectedEvent && (
            <>
              <div className="event-dialog-accent" aria-hidden="true" />
              <DialogHeader>
                <span className="event-dialog-label">TRIP</span>
                <DialogTitle>{selectedEvent.title}</DialogTitle>
                <DialogDescription>
                  Schedule details from the shared travel calendar.
                </DialogDescription>
              </DialogHeader>
              <div className="event-detail-row">
                <Clock3 aria-hidden="true" />
                <span>{formatEventSchedule(selectedEvent)}</span>
              </div>
              {selectedEvent.location && (
                <div className="event-detail-row">
                  <MapPin aria-hidden="true" />
                  <span>{selectedEvent.location}</span>
                </div>
              )}
              <p className="event-privacy-copy">
                Only the event title, timing, and location are shared here.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
