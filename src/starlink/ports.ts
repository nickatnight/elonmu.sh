import type { OrbitCatalog, ReentryLog, StarlinkSnapshot } from './domain';

export interface OrbitSource {
  /**
   * Contract (tests/starlink/orbit-source.contract.ts):
   * 1. at least one satellite
   * 2. ids are unique positive integers (NORAD catalogue numbers)
   * 3. every satellite has a non-blank name
   * 4. epochs are ISO 8601 UTC timestamps
   * 5. elements are finite: meanMotion > 0 (rev/day), meanMotionDot in
   *    rev/day² (half the rate of change of mean motion, as in a TLE),
   *    0 <= eccentricity < 1, inclination 0 to 180 degrees, other angles in
   *    degrees
   * 6. carries only readAt and the satellites' domain fields
   * 7. readAt is when the catalogue was read, an ISO 8601 UTC timestamp
   * 8. throws on upstream failure or a body with no usable satellite
   */
  fetchOrbits(): Promise<OrbitCatalog>;
}

export interface ReentrySource {
  /**
   * Contract (tests/starlink/reentry-source.contract.ts):
   * 1. at least one re-entry; satellites still in orbit are left out
   * 2. ids are unique positive integers (NORAD catalogue numbers)
   * 3. every re-entry has a non-blank name
   * 4. launched and reentered are YYYY-MM-DD (UTC), launched <= reentered
   * 5. carries only readAt and the re-entries' domain fields
   * 6. readAt is when the catalogue was read, an ISO 8601 UTC timestamp
   * 7. throws on upstream failure or a body with no usable re-entry
   */
  fetchReentries(): Promise<ReentryLog>;
}

export interface StarlinkQuery {
  snapshot(): Promise<StarlinkSnapshot>;
}

export class UpstreamRefusedError extends Error {
  constructor(status: number, options?: { cause?: unknown }) {
    super(`celestrak: refused with status ${status}`, options);
    this.name = 'UpstreamRefusedError';
  }
}
