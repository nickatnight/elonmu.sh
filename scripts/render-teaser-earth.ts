// Offline, by hand: renders the home teaser's Earth from the night texture.
//
//   bun scripts/render-teaser-earth.ts
//
// Re-run whenever TEASER_VIEW or TEASER_SIZE changes in src/jet/projection.ts:
// the server draws its SVG arcs with those same constants, so the image and
// the arcs only line up when both come from one view. Needs ffmpeg with the
// v360 filter (8.x); WebP encoding uses Bun's built-in image support.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type LatLon, TEASER_SIZE, TEASER_VIEW } from '../src/jet/projection';

const globeDir = path.join(import.meta.dir, '../src/public/static/img/globe');
export const TEXTURE = path.join(globeDir, 'earth-night.jpg');
export const OUTPUT = path.join(globeDir, 'teaser-earth.webp');
const WEBP_QUALITY = 85;

// The ffmpeg filter that turns the equirectangular texture into an
// orthographic hemisphere centred on `view`, transparent outside the disc.
// A 180° orthographic lens places a point at angle c from the centre at
// r = R·sin(c): the same mapping as src/jet/projection.ts's orthographic().
export const teaserFilter = (
  view: LatLon = TEASER_VIEW,
  size: number = TEASER_SIZE
): string =>
  [
    'v360=input=e:output=og',
    'h_fov=180:v_fov=180',
    `yaw=${view.lon}:pitch=${view.lat}`,
    `w=${size}:h=${size}`,
    'interp=lanczos:alpha_mask=1'
  ].join(':');

// Runs ffmpeg with the teaser filter: equirectangular `input` → RGBA PNG.
export const renderPng = (
  input: string,
  output: string,
  view: LatLon = TEASER_VIEW,
  size: number = TEASER_SIZE
): void => {
  const run = Bun.spawnSync([
    'ffmpeg',
    '-v',
    'error',
    '-y',
    '-i',
    input,
    '-vf',
    `${teaserFilter(view, size)},format=rgba`,
    '-frames:v',
    '1',
    output
  ]);
  if (run.exitCode !== 0) {
    throw new Error(`ffmpeg failed: ${run.stderr.toString()}`);
  }
};

if (import.meta.main) {
  const work = mkdtempSync(path.join(tmpdir(), 'teaser-earth-'));
  try {
    const png = path.join(work, 'teaser-earth.png');
    renderPng(TEXTURE, png);
    await Bun.file(png).image().webp({ quality: WEBP_QUALITY }).write(OUTPUT);
    const bytes = Bun.file(OUTPUT).size;
    console.log(
      `wrote ${path.relative(process.cwd(), OUTPUT)}: ${TEASER_SIZE}×${TEASER_SIZE}, ${(bytes / 1024).toFixed(1)} KB`
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
