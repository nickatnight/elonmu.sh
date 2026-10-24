import type * as express from 'express';

export const upstreamFailure = (res: express.Response, error: string) => {
  res.status(200).json({ error });
};
