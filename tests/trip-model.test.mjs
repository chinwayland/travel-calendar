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

test('plans on overlapping dates remain visible, exclusive end and other plans are respected', () => {
  const result = buildTrips([
    event('a', '2026-10-07', '2026-10-11', true),
    event('b', '2026-10-10', '2026-10-12', true),
    event('plan', '2026-10-10T06:00:00Z', '2026-10-10T07:00:00Z'),
    event('boundary', '2026-10-11T06:00:00Z', '2026-10-11T07:00:00Z'),
    event('other', '2026-10-20T06:00:00Z', '2026-10-20T07:00:00Z'),
  ]);
  assert.deepEqual(
    result.trips[0].plans.map((plan) => plan.id),
    ['plan'],
  );
  assert.deepEqual(
    result.trips[1].plans.map((plan) => plan.id),
    ['plan', 'boundary'],
  );
  assert.deepEqual(
    result.otherPlans.map((plan) => plan.id),
    ['other'],
  );
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
