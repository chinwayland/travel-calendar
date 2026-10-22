# External calendar refresh scheduler

Status: deployed to the existing Cloudflare account as `wayland-travel-calendar-scheduler`; no active cron trigger until a dedicated credential is installed and tested. The existing GitHub schedule remains enabled during setup.

Cloudflare Workers Cron Triggers will invoke the existing `chinwayland/waylandchin.com` Pages workflow at minutes 7, 22, 37, and 52 of each hour (UTC; this is every 15 minutes in all timezones). This is 96 invocations/day, within the Workers Free tier. Standard GitHub-hosted runners are free for this public repository. No paid subscription or domain change is required.

The scheduler receives no TripIt credential or itinerary. It only needs a GitHub **fine-grained personal access token** with:

- Resource owner: `chinwayland`.
- Repository access: **Only select repositories → waylandchin.com**.
- Repository permissions: **Actions: Read and write**; Metadata read access is automatic.
- No Contents, Administration, or other optional permissions.
- Choose an expiration appropriate to your account policy; an expiring token must be replaced before it expires. This removes the 60-day inactivity dependency, not token-expiry maintenance.

Create the credential through GitHub’s normal UI. Do not paste it into chat, commit it, or put it in a command argument. Store it as the Cloudflare Worker secret `GITHUB_ACTIONS_TOKEN`. With the installed runtime on this machine, the interactive command from the project directory is:

```bash
env PATH=/Users/waylandchin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/usr/bin:/bin node_modules/.bin/wrangler secret put GITHUB_ACTIONS_TOKEN --config scheduler/wrangler.toml
```

The command prompts for the token without echoing it. The scheduler Worker must be deployed first. It is staged with `crons = []`, no workers.dev URL, and no public routes.

Activation checklist:

1. Deploy the staged Worker to the existing Cloudflare account.
2. Have the owner create and install the narrow GitHub token as the Worker secret.
3. Test one real dispatch and verify the resulting Pages release.
4. Change `crons` to `["7,22,37,52 * * * *"]`, deploy, and verify a scheduled run.
5. Only after that succeeds, remove the native `schedule` trigger from the personal-site repository’s workflow to avoid duplicate refreshes. Keep its push and workflow_dispatch triggers.

If GitHub disables the workflow specifically for inactivity, the Worker re-enables it before dispatching. A manually disabled workflow stays disabled. An existing pending/running release is not duplicated. API failures are reported using HTTP status only, without logging credentials or response bodies.

Sources: [Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/), [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [GitHub workflow API](https://docs.github.com/en/rest/actions/workflows).
