import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const photos = JSON.parse(
  await readFile(
    new URL('../public/destination-photos/index.json', import.meta.url),
  ),
);
test('destination photos are local, credited, and backed by image files', async () => {
  assert.ok(Object.keys(photos).length > 0);
  for (const photo of Object.values(photos)) {
    assert.match(photo.src, /^\/destination-photos\/[a-f0-9]{16}\.jpg$/);
    assert.equal(new URL(photo.source).hostname, 'commons.wikimedia.org');
    assert.ok(photo.author && photo.place && photo.license);
    assert.ok(
      (await stat(new URL(`../public${photo.src}`, import.meta.url))).size >
        1000,
    );
  }
});
test('small towns and conflicting trip locations retain their intended destination', () => {
  assert.equal(
    photos['Hengdian|Dongyang, China'].place,
    'Hengdian World Studios',
  );
  assert.equal(photos['Yongkang|Jinhua, China'].place, 'Yongkang, Zhejiang');
  assert.equal(photos['Tokyo|Shanghai, China'].place, 'Tokyo');
});
