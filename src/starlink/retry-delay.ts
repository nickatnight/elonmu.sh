import { UpstreamRefusedError } from './ports';

const AFTER_FAILURE_MS = 60_000;
// CelesTrak refuses repeat downloads inside a 2-hour window and blocks
// clients that keep asking, so a refusal waits the window out.
const AFTER_REFUSAL_MS = 2 * 3_600_000;

export const retryDelay = (error: unknown): number =>
  error instanceof UpstreamRefusedError ? AFTER_REFUSAL_MS : AFTER_FAILURE_MS;
