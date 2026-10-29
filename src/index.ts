import { createApp } from './app';
import { createDogeModule } from './doge';
import { createHypeModule } from './hype';
import { createJetModule, warmUp } from './jet';
import { createNewsModule } from './news';

const port = process.env.PORT;

const jet = createJetModule();
void warmUp(jet);

createApp({
  jet,
  hype: createHypeModule(),
  doge: createDogeModule(),
  news: createNewsModule()
}).listen(port, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
});
