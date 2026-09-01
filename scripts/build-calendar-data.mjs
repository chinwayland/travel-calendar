import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

import ICAL from 'ical.js';

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function cleanText(value, maxLength = 240) {
  return String(value ?? '')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function dateOnly(time) {
  return [
    String(time.year).padStart(4, '0'),
    String(time.month).padStart(2, '0'),
    String(time.day).padStart(2, '0'),
  ].join('-');
}

function normalizedTime(time) {
  if (!time) return null;
  if (time.isDate) return dateOnly(time);
  const date = time.toJSDate();
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function eventId(uid, occurrence) {
  return createHash('sha256')
    .update(`${uid}\u0000${occurrence}`)
    .digest('hex')
    .slice(0, 18);
}

function normalizeOccurrence(item, startDate, endDate, uid) {
  const start = normalizedTime(startDate);
  const end = normalizedTime(endDate);
  if (!start || !end) return null;

  return {
    id: eventId(uid, start),
    title: cleanText(item.summary, 180) || 'Travel',
    start,
    end,
    allDay: Boolean(startDate.isDate),
    location: cleanText(item.location, 240),
  };
}

function occursWithin(startDate, endDate, lowerBound, upperBound) {
  const start = startDate.toJSDate();
  const end = endDate.toJSDate();
  return (
    !Number.isNaN(start.getTime()) &&
    !Number.isNaN(end.getTime()) &&
    end > lowerBound &&
    start <= upperBound
  );
}

function registerTimezones(calendar) {
  ICAL.TimezoneService.reset();
  for (const component of calendar.getAllSubcomponents('vtimezone')) {
    const tzid = component.getFirstPropertyValue('tzid');
    if (!tzid) continue;
    ICAL.TimezoneService.register(
      new ICAL.Timezone({ component, tzid: String(tzid) }),
    );
  }
}

function calendarEvents(calendar) {
  const groups = new Map();
  for (const component of calendar.getAllSubcomponents('vevent')) {
    const uid = cleanText(component.getFirstPropertyValue('uid'), 500);
    if (!uid) continue;
    const group = groups.get(uid) ?? [];
    group.push(component);
    groups.set(uid, group);
  }

  const now = new Date();
  const lowerBound = new Date(now);
  const upperBound = new Date(now);
  lowerBound.setUTCFullYear(lowerBound.getUTCFullYear() - 3);
  upperBound.setUTCFullYear(upperBound.getUTCFullYear() + 8);

  const results = [];

  for (const [uid, components] of groups) {
    const masterComponent =
      components.find((component) => !component.hasProperty('recurrence-id')) ??
      components[0];
    const master = new ICAL.Event(masterComponent);

    for (const component of components) {
      if (
        component === masterComponent ||
        !component.hasProperty('recurrence-id')
      )
        continue;
      master.relateException(new ICAL.Event(component));
    }

    const status = cleanText(
      masterComponent.getFirstPropertyValue('status'),
    ).toUpperCase();
    if (status === 'CANCELLED') continue;

    if (!master.isRecurring()) {
      if (
        !occursWithin(master.startDate, master.endDate, lowerBound, upperBound)
      ) {
        continue;
      }

      const event = normalizeOccurrence(
        master,
        master.startDate,
        master.endDate,
        uid,
      );
      if (event) results.push(event);
      continue;
    }

    const iterator = master.iterator();
    let occurrence;
    let expanded = 0;

    while ((occurrence = iterator.next())) {
      const occurrenceDate = occurrence.toJSDate();
      if (occurrenceDate > upperBound) break;
      if (++expanded > 5000) {
        throw new Error(
          `Recurrence expansion exceeded the safety limit for ${uid}`,
        );
      }

      const details = master.getOccurrenceDetails(occurrence);
      if (
        !occursWithin(
          details.startDate,
          details.endDate,
          lowerBound,
          upperBound,
        )
      ) {
        continue;
      }

      const detailStatus = cleanText(
        details.item.component.getFirstPropertyValue('status'),
      ).toUpperCase();
      if (detailStatus === 'CANCELLED') continue;

      const event = normalizeOccurrence(
        details.item,
        details.startDate,
        details.endDate,
        uid,
      );
      if (event) results.push(event);
    }
  }

  return results.sort(
    (a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title),
  );
}

const inputPath = resolve(argument('--input', 'tripit.ics'));
const outputPath = resolve(argument('--output', 'public/calendar-data.json'));
const source = await readFile(inputPath, 'utf8');

if (!source.includes('BEGIN:VCALENDAR')) {
  throw new Error('The downloaded file is not a valid calendar.');
}

const calendar = new ICAL.Component(ICAL.parse(source));
if (calendar.name !== 'vcalendar') {
  throw new Error('Expected a VCALENDAR root component.');
}

registerTimezones(calendar);
const events = calendarEvents(calendar);

const payload = {
  generatedAt: new Date().toISOString(),
  source: 'TripIt',
  isSample: false,
  eventCount: events.length,
  events,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`Prepared ${events.length} sanitized calendar events.`);
