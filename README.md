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

## GitHub Pages setup

1. Create a public repository named `travel-calendar` and push this project to its `main` branch.
2. In the repository, open **Settings → Secrets and variables → Actions** and create a secret named `TRIPIT_ICAL_URL` containing the private TripIt calendar-feed URL.
3. Open **Settings → Pages** and select **GitHub Actions** as the source.
4. Run the **Refresh and deploy travel calendar** workflow, or push to `main`.

The workflow refreshes the feed every 15 minutes and publishes the site at:

`https://www.waylandchin.com/travel-calendar/`

Do not add a `CNAME` file to this project repository. GitHub Pages will use the custom domain already configured on the personal website repository and mount this project beneath `/travel-calendar/`.

GitHub may automatically disable scheduled workflows in a public repository after 60 days without repository activity. If updates stop, re-enable the workflow from the repository’s **Actions** tab and run it manually once.

## Security note

A TripIt private feed URL is a bearer credential: anyone who has it can read the feed. If it has been posted anywhere unintended, reset the calendar-feed URL in TripIt and replace the GitHub Actions secret. Never commit the URL or an original `.ics` download.

## Production checks

```bash
pnpm test

NEXT_PUBLIC_BASE_PATH=/travel-calendar \
NEXT_PUBLIC_SITE_URL=https://www.waylandchin.com/travel-calendar \
pnpm build

NEXT_PUBLIC_BASE_PATH=/travel-calendar pnpm pages:prepare
```

`pages:prepare` verifies every generated asset referenced by the HTML and creates the `.nojekyll` marker required for GitHub Pages.
