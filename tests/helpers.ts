import type { AddressInfo } from 'node:net';
import type { Express } from 'express';

export interface TestServer {
  url: string;
  close: () => Promise<void>;
}

export const metaContent = (page: string, attr: string): string =>
  (
    page.match(new RegExp(`<meta\\s+${attr}\\s+content="([^"]*)"`))?.[1] ?? ''
  ).replace(/\s+/g, ' ');

export const mp4Duration = (file: Buffer): number => {
  const box = file.indexOf('mvhd');
  if (box < 0) throw new Error('no mvhd box');
  const longDates = file[box + 4] === 1;
  const timescaleAt = box + (longDates ? 24 : 16);
  const timescale = file.readUInt32BE(timescaleAt);
  const units = longDates
    ? Number(file.readBigUInt64BE(timescaleAt + 4))
    : file.readUInt32BE(timescaleAt + 4);
  return units / timescale;
};

const EBML_TIMECODE_SCALE = Buffer.from([0x2a, 0xd7, 0xb1]);
const EBML_DURATION = Buffer.from([0x44, 0x89]);
const DEFAULT_TIMECODE_SCALE_NS = 1_000_000;

export const webmDuration = (file: Buffer): number => {
  const scaleAt = file.indexOf(EBML_TIMECODE_SCALE);
  const scaleNs =
    scaleAt < 0
      ? DEFAULT_TIMECODE_SCALE_NS
      : file.readUIntBE(scaleAt + 4, file[scaleAt + 3] & 0x7f);
  const at = file.indexOf(EBML_DURATION);
  if (at < 0) throw new Error('no Duration element');
  const ticks =
    (file[at + 2] & 0x7f) === 8
      ? file.readDoubleBE(at + 3)
      : file.readFloatBE(at + 3);
  return (ticks * scaleNs) / 1e9;
};

export const startTestServer = (app: Express): Promise<TestServer> =>
  new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://localhost:${port}`,
        close: () =>
          new Promise<void>((done, fail) =>
            server.close((err) => (err ? fail(err) : done()))
          )
      });
    });
  });
