import { access, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputDirectory = resolve('dist/client');
const indexPath = resolve(outputDirectory, 'index.html');
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/+$/, '');

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

await access(indexPath);

// Vinext currently writes assetPrefix files beneath a physical base-path folder.
// GitHub Pages already mounts the artifact at that path, so assets must live at
// the artifact root even though their public URLs retain the base path.
if (basePath) {
  const nestedAssets = resolve(outputDirectory, basePath.slice(1), '_next');
  const rootAssets = resolve(outputDirectory, '_next');

  if (await exists(nestedAssets)) {
    if (await exists(rootAssets)) {
      throw new Error(
        'Both nested and root _next asset folders exist; refusing to overwrite either.',
      );
    }
    await rename(nestedAssets, rootAssets);
  }
}

const html = await readFile(indexPath, 'utf8');
const assetUrls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((url) => url.startsWith(`${basePath}/_next/`));

if (assetUrls.length === 0) {
  throw new Error('No generated _next assets were referenced by index.html.');
}

for (const assetUrl of assetUrls) {
  const artifactPath = assetUrl.slice(basePath.length + 1).split(/[?#]/, 1)[0];
  await access(resolve(outputDirectory, artifactPath));
}

await writeFile(resolve(outputDirectory, '.nojekyll'), '', 'utf8');

console.log(
  `Prepared GitHub Pages output at ${outputDirectory} (${assetUrls.length} asset references verified)`,
);
