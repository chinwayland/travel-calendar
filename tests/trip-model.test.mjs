import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

process.env.TZ = 'UTC';

// Exercise the same model used in the browser, without needing a TS test runtime.
const source = await readFile(
  new URL('../app/trip-model.ts', import.meta.url),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext },
}).outputText;
const { buildTrips, tripDates, localDay } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);
const event = (id, start, end, allDay = false) => ({
  id,
  title: id,
  start,
  end,
  allDay,
  location: '',
});

test('trip dates use exclusive ICS end dates, including DST and year boundaries', () => {
  assert.match(
    tripDates(event('trip', '2026-10-07', '2026-10-11', true)),
    /4 days$/,
  );
  assert.match(
    tripDates(event('trip', '2026-10-31', '2026-11-03', true)),
    /3 days$/,
  );
  assert.match(
    tripDates(event('trip', '2026-12-31', '2027-01-01', true)),
    /1 day$/,
  );
});

test('overlapping trips use explicit ownership instead of sharing plans by date', () => {
  const result = buildTrips([
    { ...event('a', '2026-10-07', '2026-10-11', true), tripId: 'trip-a' },
    { ...event('b', '2026-10-10', '2026-10-12', true), tripId: 'trip-b' },
    {
      ...event('plan', '2026-10-10T06:00:00Z', '2026-10-10T07:00:00Z'),
      tripId: 'trip-a',
    },
    {
      ...event('boundary', '2026-10-11T06:00:00Z', '2026-10-11T07:00:00Z'),
      tripId: 'trip-b',
    },
    event('other', '2026-10-20T06:00:00Z', '2026-10-20T07:00:00Z'),
  ]);
  assert.deepEqual(
    result.trips[0].plans.map((plan) => plan.id),
    ['plan'],
  );
  assert.deepEqual(
    result.trips[1].plans.map((plan) => plan.id),
    ['boundary'],
  );
  assert.deepEqual(
    result.otherPlans.map((plan) => plan.id),
    ['other'],
  );
});

test('Hangzhou Oct 23–25 keeps both hotel endpoints together and excludes adjacent Jinhua bookings', () => {
  const summary = (id, start, end) => ({
    ...event(id, start, end, true),
    tripId: id,
  });
  const plan = (id, day, tripId) => ({
    ...event(id, `${day}T07:00:00Z`, `${day}T08:00:00Z`),
    tripId,
  });
  const events = [
    summary('jinhua-before', '2026-10-18', '2026-10-24'),
    summary('hangzhou', '2026-10-23', '2026-10-26'),
    summary('jinhua-after', '2026-10-25', '2026-10-31'),
    plan('Wanda check-in', '2026-10-18', 'jinhua-before'),
    plan('Wanda check-out', '2026-10-23', 'jinhua-before'),
    plan('DC check-in', '2026-10-23', 'hangzhou'),
    plan('DC check-out', '2026-10-25', 'hangzhou'),
    plan('Atour check-in', '2026-10-25', 'jinhua-after'),
    plan('Atour check-out', '2026-10-30', 'jinhua-after'),
  ];
  const result = buildTrips(events);
  assert.deepEqual(
    result.trips.map((trip) => trip.plans.map((item) => item.id)),
    [
      ['Wanda check-in', 'Wanda check-out'],
      ['DC check-in', 'DC check-out'],
      ['Atour check-in', 'Atour check-out'],
    ],
  );
  assert.equal(result.otherPlans.length, 0);
  assert.equal(
    new Set(result.trips.flatMap((trip) => trip.plans.map((item) => item.id)))
      .size,
    6,
  );
  process.env.TZ = 'America/Los_Angeles';
  try {
    assert.deepEqual(buildTrips(events), result);
  } finally {
    process.env.TZ = 'UTC';
  }
});

test('ownership is respected outside trip dates; missing and orphaned owners remain unassigned', () => {
  const result = buildTrips([
    { ...event('trip', '2026-10-23', '2026-10-26', true), tripId: 'trip' },
    {
      ...event('late-checkout', '2026-10-26T07:00:00Z', '2026-10-26T08:00:00Z'),
      tripId: 'trip',
    },
    event('missing', '2026-10-24T07:00:00Z', '2026-10-24T08:00:00Z'),
    {
      ...event('orphan', '2026-10-24T09:00:00Z', '2026-10-24T10:00:00Z'),
      tripId: 'unavailable',
    },
  ]);
  assert.deepEqual(
    result.trips[0].plans.map((item) => item.id),
    ['late-checkout'],
  );
  assert.deepEqual(
    result.otherPlans.map((item) => item.id),
    ['missing', 'orphan'],
  );
});

test('duplicate summaries never duplicate a plan across trips', () => {
  const result = buildTrips([
    { ...event('a', '2026-10-23', '2026-10-26', true), tripId: 'same' },
    { ...event('b', '2026-10-23', '2026-10-26', true), tripId: 'same' },
    {
      ...event('plan', '2026-10-24T07:00:00Z', '2026-10-24T08:00:00Z'),
      tripId: 'same',
    },
  ]);
  assert.equal(result.trips.flatMap((trip) => trip.plans).length, 1);
});

test('date-only summaries never shift with timezone and empty feeds stay empty', () => {
  assert.equal(localDay('2026-10-07'), '2026-10-07');
  assert.deepEqual(buildTrips([]), { trips: [], otherPlans: [] });
});

test('timed plans use the visitor local date when crossing UTC midnight', () => {
  process.env.TZ = 'Asia/Shanghai';
  try {
    assert.equal(localDay('2026-10-06T20:00:00Z'), '2026-10-07');
    assert.equal(localDay('2026-10-07'), '2026-10-07');
  } finally {
    process.env.TZ = 'UTC';
  }
});
