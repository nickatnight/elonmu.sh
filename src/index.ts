import { createApp } from './app';
import { createJetModule, warmUp } from './jet';

const port = process.env.PORT;

// One jet module for the process: warmed now, then shared with the app so
// the first visitor gets the cached snapshot.
const jet = createJetModule();
void warmUp(jet);

createApp({ jet }).listen(port, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
});
