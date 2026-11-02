export type IsoTimestamp = string;

export type Satellite = {
  id: number;
  name: string;
  epoch: IsoTimestamp;
  meanMotion: number;
  meanMotionDot: number;
  eccentricity: number;
  inclination: number;
  raan: number;
  argOfPerigee: number;
  meanAnomaly: number;
};

export type OrbitCatalog = { readAt: IsoTimestamp; satellites: Satellite[] };

export type IsoDate = string;

export type Reentry = {
  id: number;
  name: string;
  launched: IsoDate;
  reentered: IsoDate;
};

export type ReentryLog = { readAt: IsoTimestamp; reentries: Reentry[] };

export type Attribution = { name: string; url: string };

export type ReentryTally = { year: number; count: number; recent: Reentry[] };

type Orbits =
  | { inOrbit: number; satellites: Satellite[] }
  | { inOrbit: null; satellites: null };

export type StarlinkSnapshot = { updatedAt: IsoTimestamp } & Orbits & {
    reentries: ReentryTally | null;
    attribution: Attribution[];
  };

export const STARLINK_ATTRIBUTION: Attribution[] = [
  { name: 'CelesTrak', url: 'https://celestrak.org' }
];

export const OBITUARY_COUNT = 12;
