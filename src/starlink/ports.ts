import type { OrbitCatalog } from './domain';

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
