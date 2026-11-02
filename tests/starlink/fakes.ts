import type { OrbitCatalog, ReentryLog } from '../../src/starlink/domain';
import { parseGp } from '../../src/starlink/sources/celestrak/parse-gp';
import { parseSatcat } from '../../src/starlink/sources/celestrak/parse-satcat';
import gpCapture from '../fixtures/celestrak-starlink-gp.json';
import satcatCapture from '../fixtures/celestrak-starlink-satcat.json';

export const ORBITS_READ_AT = '2026-10-30T04:13:47.000Z';
export const REENTRIES_READ_AT = '2026-10-30T04:14:02.000Z';

export const capturedOrbits = (readAt = ORBITS_READ_AT): OrbitCatalog => ({
  readAt,
  satellites: parseGp(gpCapture)
});

export const capturedReentries = (readAt = REENTRIES_READ_AT): ReentryLog => ({
  readAt,
  reentries: parseSatcat(satcatCapture)
});
