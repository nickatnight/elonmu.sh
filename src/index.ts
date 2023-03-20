import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import * as routes from './routes';

dotenv.config();
const port = process.env.PORT;
const app: express.Express = express();

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
app.use((req, res, next) => {
  res.status(404).send('does not compute...');
});

app.listen(port, () => {
  // tslint:disable-next-line:no-console
  console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
});
