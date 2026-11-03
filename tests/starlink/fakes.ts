import type { Clock } from '../../src/ports';
import type { OrbitCatalog, ReentryLog } from '../../src/starlink/domain';
import type { StarlinkQuery } from '../../src/starlink/ports';
import { parseGp } from '../../src/starlink/sources/celestrak/parse-gp';
import { parseSatcat } from '../../src/starlink/sources/celestrak/parse-satcat';
import { InMemoryOrbitSource } from '../../src/starlink/sources/memory/in-memory-orbit-source';
import { InMemoryReentrySource } from '../../src/starlink/sources/memory/in-memory-reentry-source';
import { StarlinkService } from '../../src/starlink/starlink.service';
import { FakeClock } from '../fakes';
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

export const STARLINK_NOW = '2026-10-30T04:30:00.000Z';

export const sampleStarlink = (
  clock: Clock = new FakeClock(STARLINK_NOW)
): StarlinkQuery =>
  new StarlinkService({
    orbits: new InMemoryOrbitSource(capturedOrbits()),
    reentries: new InMemoryReentrySource(capturedReentries()),
    clock
  });

const celestrakDown = { error: new Error('celestrak down') };

export const orbitsDownStarlink = (): StarlinkQuery =>
  new StarlinkService({
    orbits: new InMemoryOrbitSource(capturedOrbits(), celestrakDown),
    reentries: new InMemoryReentrySource(capturedReentries()),
    clock: new FakeClock(STARLINK_NOW)
  });

export const reentriesDownStarlink = (): StarlinkQuery =>
  new StarlinkService({
    orbits: new InMemoryOrbitSource(capturedOrbits()),
    reentries: new InMemoryReentrySource(capturedReentries(), celestrakDown),
    clock: new FakeClock(STARLINK_NOW)
  });

export const failingStarlink = (): StarlinkQuery => ({
  snapshot: () => Promise.reject(new Error('celestrak down'))
});
