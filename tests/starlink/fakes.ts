import type { OrbitCatalog } from '../../src/starlink/domain';
import { parseGp } from '../../src/starlink/sources/celestrak/parse-gp';
import gpCapture from '../fixtures/celestrak-starlink-gp.json';

export const ORBITS_READ_AT = '2026-10-30T04:13:47.000Z';

export const capturedOrbits = (readAt = ORBITS_READ_AT): OrbitCatalog => ({
  readAt,
  satellites: parseGp(gpCapture)
});
