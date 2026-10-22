import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const run = promisify(execFile);

test('extracts consistent opaque TripIt ownership without publishing descriptions or raw IDs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'travel-calendar-membership-'));
  const input = join(dir, 'calendar.ics');
  const output = join(dir, 'calendar.json');
  const year = new Date().getUTCFullYear();
  const item = (uid, description, allDay = false) => `BEGIN:VEVENT
UID:${uid}
DTSTAMP:${year}0101T000000Z
${allDay ? `DTSTART;VALUE=DATE:${year}1023\nDTEND;VALUE=DATE:${year}1026` : `DTSTART:${year}1023T070000Z\nDTEND:${year}1023T080000Z`}
SUMMARY:${uid}
DESCRIPTION:${description}
END:VEVENT`;
  const rawId = 'private-trip-987654321';
  const source = `BEGIN:VCALENDAR
VERSION:2.0
${item('summary', `Private notes https://www.tripit.com/trip/show?id=${rawId}`, true)}
${item('checkin', `https://www.tripit.com/trip/show/id/${rawId}`)}
${item('checkout', `https://www.tripit.com/trip/show/id/${rawId}`)}
${item('different', 'https://tripit.com/trip/show?id=another-trip')}
${item('untrusted', `https://www.tripit.com.evil.example/trip/show?id=${rawId}`)}
${item('unknown', 'Private notes without a trip link')}
END:VCALENDAR`;
  try {
    await writeFile(input, source);
    await run(process.execPath, [
      resolve('scripts/build-calendar-data.mjs'),
      '--input',
      input,
      '--output',
      output,
    ]);
    const raw = await readFile(output, 'utf8');
    const { events } = JSON.parse(raw);
    const byTitle = new Map(events.map((event) => [event.title, event]));
    const owner = byTitle.get('summary').tripId;
    assert.match(owner, /^[a-f0-9]{18}$/);
    assert.equal(byTitle.get('checkin').tripId, owner);
    assert.equal(byTitle.get('checkout').tripId, owner);
    assert.notEqual(byTitle.get('different').tripId, owner);
    assert.equal(byTitle.get('untrusted').tripId, undefined);
    assert.equal(byTitle.get('unknown').tripId, undefined);
    assert(!raw.includes(rawId));
    assert(!raw.includes('https://'));
    assert(!raw.includes('Private notes'));
    assert(
      events.every((event) =>
        Object.keys(event).every((key) =>
          [
            'id',
            'title',
            'start',
            'end',
            'allDay',
            'location',
            'tripId',
          ].includes(key),
        ),
      ),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function icalTimestamp(date) {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

test('keeps recurrence timing and enforces the publication window', async () => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), 'travel-calendar-test-'),
  );
  const inputPath = join(temporaryDirectory, 'calendar.ics');
  const outputPath = join(temporaryDirectory, 'calendar.json');

  const now = new Date();
  const recurringStart = new Date(
    Date.UTC(now.getUTCFullYear() - 4, 0, 1, 10, 0, 0),
  );
  while (recurringStart.getUTCDay() !== 3) {
    recurringStart.setUTCDate(recurringStart.getUTCDate() + 1);
  }
  const recurringEnd = new Date(recurringStart.getTime() + 60 * 60 * 1000);
  const oldStart = new Date(
    Date.UTC(now.getUTCFullYear() - 10, 0, 1, 10, 0, 0),
  );
  const futureStart = new Date(
    Date.UTC(now.getUTCFullYear() + 10, 0, 1, 10, 0, 0),
  );
  const currentStart = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      10,
      0,
      0,
    ),
  );

  const oneHourLater = (date) => new Date(date.getTime() + 60 * 60 * 1000);
  const event = (uid, summary, start, end, recurrence = '') => `BEGIN:VEVENT
UID:${uid}
DTSTAMP:${icalTimestamp(now)}
DTSTART:${icalTimestamp(start)}
DTEND:${icalTimestamp(end)}
${recurrence}SUMMARY:${summary}
END:VEVENT`;

  const calendar = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Calendar parser regression test//EN
${event(
  'weekly-test',
  'Weekly test',
  recurringStart,
  recurringEnd,
  'RRULE:FREQ=WEEKLY;COUNT=700\n',
)}
${event('old-test', 'Old test', oldStart, oneHourLater(oldStart))}
${event('current-test', 'Current test', currentStart, oneHourLater(currentStart))}
${event('future-test', 'Future test', futureStart, oneHourLater(futureStart))}
END:VCALENDAR
`;

  try {
    await writeFile(inputPath, calendar, 'utf8');
    await run(
      process.execPath,
      [
        resolve('scripts/build-calendar-data.mjs'),
        '--input',
        inputPath,
        '--output',
        outputPath,
      ],
      { cwd: resolve('.') },
    );

    const payload = JSON.parse(await readFile(outputPath, 'utf8'));
    const titles = new Set(payload.events.map((item) => item.title));
    const weeklyEvents = payload.events.filter(
      (item) => item.title === 'Weekly test',
    );

    assert(titles.has('Current test'));
    assert(!titles.has('Old test'));
    assert(!titles.has('Future test'));
    assert(weeklyEvents.length > 0);
    assert(
      weeklyEvents.every((item) => {
        const date = new Date(item.start);
        return date.getUTCDay() === 3 && date.getUTCHours() === 10;
      }),
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('publishes a valid empty calendar so stale trips are cleared', async () => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), 'travel-calendar-empty-test-'),
  );
  const inputPath = join(temporaryDirectory, 'calendar.ics');
  const outputPath = join(temporaryDirectory, 'calendar.json');
  const calendar = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Empty calendar regression test//EN
END:VCALENDAR
`;

  try {
    await writeFile(inputPath, calendar, 'utf8');
    await run(
      process.execPath,
      [
        resolve('scripts/build-calendar-data.mjs'),
        '--input',
        inputPath,
        '--output',
        outputPath,
      ],
      { cwd: resolve('.') },
    );

    const payload = JSON.parse(await readFile(outputPath, 'utf8'));
    assert.equal(payload.eventCount, 0);
    assert.deepEqual(payload.events, []);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
