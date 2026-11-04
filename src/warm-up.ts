import { warmUp as warmUpJet } from './jet';
import type { JetQuery } from './jet/ports';
import { warmUp as warmUpStarlink } from './starlink';
import type { StarlinkQuery } from './starlink/ports';

export const warmUpCaches = async (
  { jet, starlink }: { jet: JetQuery; starlink: StarlinkQuery },
  env: Record<string, string | undefined>
): Promise<void> => {
  const warming = [warmUpJet(jet)];

  if (env.SKIP_STARLINK_WARM_UP !== '1') warming.push(warmUpStarlink(starlink));

  await Promise.all(warming);
};
