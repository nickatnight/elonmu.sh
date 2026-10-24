import type { Attribution, JetSnapshot } from './domain';
import { latestSentence, totalsLine } from './format';
import { arcPath, orthographic, round1, TEASER_SIZE } from './projection';

export type TeaserArc = { id: string; d: string; latest: boolean };

export type Teaser = {
  size: number;
  arcs: TeaserArc[];
  origin: { x: number; y: number } | null;
  latest: string | null;
  totalsLine: string;
  summary: string;
  attribution: Attribution;
  empty: boolean;
};

export const toTeaser = (snapshot: JetSnapshot): Teaser => {
  const { flights, year } = snapshot;
  const newest = flights[0];

  const arcs: TeaserArc[] = [];
  flights.forEach((f, i) => {
    if (f.status === 'airborne' || !f.from || !f.to) return;
    const d = arcPath(f.from, f.to);
    if (d) arcs.push({ id: f.id, d, latest: i === 0 });
  });
  arcs.reverse();

  let origin: Teaser['origin'] = null;
  if (newest?.status === 'airborne' && newest.from) {
    const p = orthographic(newest.from);
    if (p.visible) origin = { x: round1(p.x), y: round1(p.y) };
  }

  const latest = latestSentence(flights);
  const n = snapshot.totals.flights;
  const summary = flights.length
    ? `Map of ${n} flight${n === 1 ? '' : 's'} so far in ${year}.${latest ? ` ${latest}` : ''}`
    : `Map with no flights yet in ${year}.`;

  return {
    size: TEASER_SIZE,
    arcs,
    origin,
    latest,
    totalsLine: totalsLine(snapshot.totals),
    summary,
    attribution: snapshot.attribution,
    empty: flights.length === 0
  };
};
