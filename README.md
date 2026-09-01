# Wayland’s Travel Calendar

![Wayland’s Travel Calendar sharing card](public/og.png)

A shareable, Apple Calendar-inspired web view of a private TripIt calendar feed. It supports Year, Month, Week, and Day views, adapts to phones and desktops, and displays event times in each visitor’s local timezone.

## How it works

The browser never receives the private TripIt feed URL. A GitHub Actions workflow downloads the feed using the encrypted `TRIPIT_ICAL_URL` repository secret, parses it at build time, removes private fields, and deploys a static site to GitHub Pages.

Only these fields are published:

- Event title
- Start and end
- All-day status
- Location

The ICS `DESCRIPTION`, `GEO`, `URL`, and `UID` fields and the private feed URL are excluded. Event titles and locations are published as supplied by TripIt, so those fields should still be reviewed for anything you do not want to share. The resulting calendar is public to anyone who has the website address.

To limit historical exposure and runaway recurrence expansion, the published window includes events that overlap the previous three years through the next eight years.

## Local development

Requirements: Node.js 22 or newer and pnpm.

```bash
pnpm install
pnpm dev
```

The checked-in `public/calendar-data.json` contains a fictional preview itinerary. To test a local ICS file without committing private data:

```bash
pnpm calendar:build -- --input /path/to/calendar.ics --output public/calendar-data.json
```

Restore the preview file before committing, or keep the generated file out of the commit.

## Production deployment

The application source lives in [`chinwayland/travel-calendar`](https://github.com/chinwayland/travel-calendar), while the custom domain is served by [`chinwayland/waylandchin.com`](https://github.com/chinwayland/waylandchin.com). The personal-site repository’s Pages workflow checks out this repository, builds the calendar with a `/travel-calendar` base path, and publishes it alongside the existing website.

The production workflow:

1. Reads `TRIPIT_ICAL_URL` from the `waylandchin.com` repository’s encrypted Actions secrets.
2. Downloads and sanitizes the feed in the GitHub Actions runner.
3. Builds this static application and installs it at `/travel-calendar/` in the personal-site artifact.
4. Deploys the combined artifact to GitHub Pages every 15 minutes and on manual runs.

The live calendar is available at:

[`https://waylandchin.com/travel-calendar/`](https://waylandchin.com/travel-calendar/)

Do not add a `CNAME` file to this source repository. The custom-domain configuration remains in the personal-site repository. This repository’s workflow is retained for testing and source-repository Pages deployments on pushes or manual runs; the scheduled production refresh is owned only by `waylandchin.com`.

GitHub may automatically disable scheduled workflows in a public repository after 60 days without repository activity. If updates stop, re-enable the workflow in the `waylandchin.com` repository’s **Actions** tab and run it manually once.

## Security note

A TripIt private feed URL is a bearer credential: anyone who has it can read the feed. If it has been posted anywhere unintended, reset the calendar-feed URL in TripIt and replace the GitHub Actions secret. Never commit the URL or an original `.ics` download.

## Production checks

```bash
pnpm test

NEXT_PUBLIC_BASE_PATH=/travel-calendar \
NEXT_PUBLIC_SITE_URL=https://waylandchin.com/travel-calendar \
pnpm build

NEXT_PUBLIC_BASE_PATH=/travel-calendar pnpm pages:prepare
```

`pages:prepare` verifies every generated asset referenced by the HTML and creates the `.nojekyll` marker required for GitHub Pages.
