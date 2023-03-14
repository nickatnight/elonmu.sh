import express, { Express, Request, Response } from 'express';
import dotenv from 'dotenv';
import * as routes from "./routes";

dotenv.config();
const port = process.env.PORT;
const app: Express = express();

// Configure Express to parse incoming JSON data
app.use( express.json() );

// Configure routes
routes.register( app );

app.listen(port, () => {
  // tslint:disable-next-line:no-console
  console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
});
