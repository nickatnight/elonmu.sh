import { createApp } from './app';
import { createHypeModule } from './hype';
import { createJetModule, warmUp } from './jet';

const port = process.env.PORT;

const jet = createJetModule();
void warmUp(jet);

createApp({ jet, hype: createHypeModule() }).listen(port, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
});
