import { createApp } from './app';
import { createDogeModule } from './doge';
import { createHypeModule } from './hype';
import { createJetModule } from './jet';
import { createNewsModule } from './news';
import { createStarlinkModule } from './starlink';
import { warmUpCaches } from './warm-up';

const port = process.env.PORT;

const jet = createJetModule();
const starlink = createStarlinkModule();

void warmUpCaches({ jet, starlink }, process.env);

createApp({
  jet,
  hype: createHypeModule(),
  doge: createDogeModule(),
  news: createNewsModule(),
  starlink
}).listen(port, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
});
