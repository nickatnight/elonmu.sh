import express from 'express';
import path from 'node:path';
import * as routes from './routes';

export const createApp = (): express.Express => {
  const app = express();

  // Configure Express to use EJS
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'ejs');

  // Configure Express to parse incoming JSON data
  app.use(express.json());

  // Configure static serving
  app.use(
    express.static(path.join(__dirname, 'public'), { maxAge: 31557600000 })
  );

  // Configure routes
  routes.register(app);

  // Configure Errors
  app.use((_req, res) => {
    res.status(404).send('does not compute...');
  });

  return app;
};
