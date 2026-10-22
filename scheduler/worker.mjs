// This scheduler can only trigger the existing website release. It never
// receives the TripIt feed, and it has no public HTTP endpoint.
const workflow =
  'https://api.github.com/repos/chinwayland/waylandchin.com/actions/workflows/deploy-pages.yml';

export async function refresh(env, request = fetch) {
  if (!env.GITHUB_ACTIONS_TOKEN)
    throw new Error(
      'Configure GITHUB_ACTIONS_TOKEN before enabling the schedule.',
    );
  async function github(url, method = 'GET', body) {
    const response = await request(url, {
      method,
      redirect: 'error',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${env.GITHUB_ACTIONS_TOKEN}`,
        'X-GitHub-Api-Version': '2026-03-10',
        'User-Agent': 'Wayland-Travel-Calendar-Scheduler',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(`GitHub ${method} failed with HTTP ${response.status}`);
    return response;
  }

  const state = await (await github(workflow)).json();
  if (state.state === 'disabled_inactivity') {
    await github(`${workflow}/enable`, 'PUT');
  } else if (state.state !== 'active') {
    // Respect a deliberate manual disable or another administrative block.
    return { status: 'disabled-by-owner' };
  }

  const runs = await (
    await github(`${workflow}/runs?branch=main&per_page=5`)
  ).json();
  if (
    (runs.workflow_runs ?? []).some((run) =>
      ['requested', 'queued', 'pending', 'waiting', 'in_progress'].includes(
        run.status,
      ),
    )
  ) {
    return { status: 'already-running' };
  }

  await github(`${workflow}/dispatches`, 'POST', { ref: 'main' });
  return { status: 'dispatched' };
}

const scheduler = {
  async scheduled(_controller, env) {
    const result = await refresh(env);
    console.log(JSON.stringify(result));
  },
};

export default scheduler;
