import assert from 'node:assert/strict';
import { test } from 'node:test';
import { refresh } from '../scheduler/worker.mjs';

const env = { GITHUB_ACTIONS_TOKEN: 'synthetic-test-token' };
const response = (data) => Response.json(data);

function api(replies) {
  const calls = [];
  return {
    calls,
    request: async (url, options) => {
      calls.push({ url, ...options });
      assert(
        url.startsWith(
          'https://api.github.com/repos/chinwayland/waylandchin.com/actions/workflows/deploy-pages.yml',
        ),
      );
      assert.equal(options.redirect, 'error');
      assert.equal(
        options.headers.Authorization,
        `Bearer ${env.GITHUB_ACTIONS_TOKEN}`,
      );
      assert(replies.length, 'unexpected API request');
      return replies.shift();
    },
  };
}

test('external scheduler dispatches only the existing main-branch release', async () => {
  const fake = api([
    response({ state: 'active' }),
    response({ workflow_runs: [{ status: 'completed' }] }),
    new Response(null, { status: 204 }),
  ]);
  assert.deepEqual(await refresh(env, fake.request), { status: 'dispatched' });
  assert.equal(fake.calls.length, 3);
  assert.equal(fake.calls[2].method, 'POST');
  assert.equal(fake.calls[2].body, JSON.stringify({ ref: 'main' }));
});

test('automatically re-enables inactivity-disabled workflows before dispatching', async () => {
  const fake = api([
    response({ state: 'disabled_inactivity' }),
    new Response(null, { status: 204 }),
    response({ workflow_runs: [] }),
    new Response(null, { status: 204 }),
  ]);
  assert.deepEqual(await refresh(env, fake.request), { status: 'dispatched' });
  assert(fake.calls[1].url.endsWith('/enable'));
  assert.equal(fake.calls[1].method, 'PUT');
});

test('respects manual disabling and avoids overlapping refreshes', async () => {
  const disabled = api([response({ state: 'disabled_manually' })]);
  assert.deepEqual(await refresh(env, disabled.request), {
    status: 'disabled-by-owner',
  });
  assert.equal(disabled.calls.length, 1);
  for (const status of [
    'requested',
    'queued',
    'pending',
    'waiting',
    'in_progress',
  ]) {
    const busy = api([
      response({ state: 'active' }),
      response({ workflow_runs: [{ status }] }),
    ]);
    assert.deepEqual(await refresh(env, busy.request), {
      status: 'already-running',
    });
    assert.equal(busy.calls.length, 2);
  }
});

test('fails clearly without exposing tokens or response bodies', async () => {
  await assert.rejects(refresh({}), /Configure GITHUB_ACTIONS_TOKEN/);
  const fake = api([new Response('private response content', { status: 401 })]);
  await assert.rejects(refresh(env, fake.request), {
    message: 'GitHub GET failed with HTTP 401',
  });
});
