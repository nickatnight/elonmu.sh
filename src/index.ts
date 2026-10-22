import { createApp } from './app';

const port = process.env.PORT;

createApp().listen(port, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
});
