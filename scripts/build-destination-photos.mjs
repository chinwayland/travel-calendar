import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const root = 'public/destination-photos';
await mkdir(root, { recursive: true });
const dataPath = process.argv[2] ?? 'public/calendar-data-v2.json';
const data = JSON.parse(await readFile(dataPath, 'utf8'));
let photos = {};
try {
  photos = JSON.parse(await readFile(`${root}/index.json`, 'utf8'));
} catch {}
const overrides = JSON.parse(
  await readFile('scripts/destination-overrides.json', 'utf8'),
);
const headers = {
  'User-Agent':
    'WaylandTravelCalendar/1.0 (https://waylandchin.com/travel-calendar/)',
};
async function json(url) {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Image service HTTP ${response.status}`);
  return response.json();
}
for (const trip of data.events.filter((event) => event.allDay)) {
  const key = `${trip.title}|${trip.location}`;
  if (photos[key]) continue;
  const title = trip.title.replace(/\s*\(.*$/, '').trim();
  const place = overrides[title] ?? title;
  try {
    const query = new URLSearchParams({
      action: 'query',
      format: 'json',
      redirects: '1',
      titles: place,
      prop: 'pageimages|coordinates',
      piprop: 'name',
      pilicense: 'free',
    });
    const result = await json(`https://en.wikipedia.org/w/api.php?${query}`);
    const page = Object.values(result.query?.pages ?? {})[0];
    // Only geographically identified articles; do not substitute unrelated search results.
    if ((!page?.coordinates?.length && !overrides[title]) || !page?.pageimage)
      continue;
    const imageQuery = new URLSearchParams({
      action: 'query',
      format: 'json',
      titles: `File:${page.pageimage}`,
      prop: 'imageinfo',
      iiprop: 'url|extmetadata',
      iiurlwidth: '800',
    });
    const info = await json(
      `https://commons.wikimedia.org/w/api.php?${imageQuery}`,
    );
    const image = Object.values(info.query?.pages ?? {})[0]?.imageinfo?.[0];
    const meta = image?.extmetadata;
    const plain = (value) =>
      String(value ?? '')
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .slice(0, 500);
    const license = plain(meta?.LicenseShortName?.value);
    if (
      !image?.thumburl ||
      !/^(CC BY(?:-SA)? [\d.]+|Public domain|CC0)$/i.test(license)
    )
      continue;
    const url = new URL(image.thumburl);
    if (!['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(url.hostname))
      continue;
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(20000),
    });
    if (
      !response.ok ||
      !response.headers.get('content-type')?.startsWith('image/')
    )
      throw new Error('Photo download failed');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > 5000000) throw new Error('Photo too large');
    const filename = `${createHash('sha256').update(place).digest('hex').slice(0, 16)}.jpg`;
    await writeFile(`${root}/${filename}`, bytes);
    photos[key] = {
      src: `/destination-photos/${filename}`,
      place: page.title,
      author: plain(meta.Artist?.value),
      license,
      source: image.descriptionurl,
    };
    console.log(`Destination photo: ${place}`);
  } catch (error) {
    // A temporary image-service failure must never prevent calendar updates.
    console.warn(`Using fallback for ${place}: ${error.message}`);
  }
}
await writeFile(`${root}/index.json`, `${JSON.stringify(photos, null, 2)}\n`);
