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
