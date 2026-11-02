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
