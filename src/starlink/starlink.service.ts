import type { Clock } from '../ports';
import {
  OBITUARY_COUNT,
  type OrbitCatalog,
  type Reentry,
  type ReentryLog,
  type ReentryTally,
  type Satellite,
  STARLINK_ATTRIBUTION,
  type StarlinkSnapshot
} from './domain';
import type { OrbitSource, ReentrySource, StarlinkQuery } from './ports';

const round = (value: number, decimals: number): number =>
  Math.round(value * 10 ** decimals) / 10 ** decimals;

const servedPrecision = (s: Satellite): Satellite => ({
  id: s.id,
  name: s.name,
  epoch: s.epoch,
  meanMotion: round(s.meanMotion, 5),
  meanMotionDot: round(s.meanMotionDot, 6),
  eccentricity: round(s.eccentricity, 4),
  inclination: round(s.inclination, 2),
  raan: round(s.raan, 2),
  argOfPerigee: round(s.argOfPerigee, 2),
  meanAnomaly: round(s.meanAnomaly, 2)
});

const newestFirst = (a: Reentry, b: Reentry): number => {
  if (a.reentered !== b.reentered) return a.reentered < b.reentered ? 1 : -1;
  return a.id - b.id;
};

const tally = (reentries: Reentry[], year: number): ReentryTally => {
  const thisYear = reentries.filter((r) => r.reentered.startsWith(`${year}-`));
  return {
    year,
    count: thisYear.length,
    recent: thisYear.sort(newestFirst).slice(0, OBITUARY_COUNT)
  };
};

type Built = {
  catalog: OrbitCatalog | null;
  log: ReentryLog | null;
  year: number;
  snapshot: StarlinkSnapshot;
};

export class StarlinkService implements StarlinkQuery {
  private last: Built | null = null;

  constructor(
    private readonly deps: {
      orbits: OrbitSource;
      reentries: ReentrySource;
      clock: Clock;
    }
  ) {}

  async snapshot(): Promise<StarlinkSnapshot> {
    const [orbits, reentries] = await Promise.allSettled([
      this.deps.orbits.fetchOrbits(),
      this.deps.reentries.fetchReentries()
    ]);
    if (orbits.status === 'rejected' && reentries.status === 'rejected')
      throw orbits.reason;
    const catalog = orbits.status === 'fulfilled' ? orbits.value : null;
    const log = reentries.status === 'fulfilled' ? reentries.value : null;
    const readAts = [catalog?.readAt, log?.readAt].filter(
      (at): at is string => at !== undefined
    );
    const year = this.deps.clock.now().getUTCFullYear();
    const last = this.last;
    if (last?.catalog === catalog && last.log === log && last.year === year)
      return last.snapshot;
    const snapshot: StarlinkSnapshot = {
      updatedAt: readAts.sort()[0],
      ...(catalog
        ? {
            inOrbit: catalog.satellites.length,
            satellites: catalog.satellites.map(servedPrecision)
          }
        : { inOrbit: null, satellites: null }),
      reentries: log ? tally(log.reentries, year) : null,
      attribution: STARLINK_ATTRIBUTION
    };
    this.last = { catalog, log, year, snapshot };
    return snapshot;
  }
}
