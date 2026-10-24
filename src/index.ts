import { createApp } from './app';
import { createJetModule, warmUp } from './jet';

const port = process.env.PORT;

const jet = createJetModule();
void warmUp(jet);

createApp({ jet }).listen(port, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
});
