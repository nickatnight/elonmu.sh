import type { HypeSeries, IsoDate, Spike } from './domain';

export type Frame = 'wide' | 'narrow';

export type ChartSeries = Pick<
  HypeSeries,
  'from' | 'to' | 'days' | 'stats' | 'spikes'
>;

export type LabelAnchor = 'start' | 'middle' | 'end';

export type SpikeMark = {
  date: IsoDate;
  x: number;
  y: number;
  label: {
    x: number;
    y: number;
    text: string;
    anchor: LabelAnchor;
    leader: { y1: number; y2: number } | null;
  };
};

export type ChartGeometry = {
  frame: Frame;
  width: number;
  height: number;
  fontSize: number;
  plot: { left: number; right: number; top: number; bottom: number };
  baselineY: number;
  top: number;
  gridlines: { y: number; label: string }[];
  normalPath: string;
  hotPath: string;
  months: { x: number; label: string }[];
  spikes: SpikeMark[];
};

type FrameSpec = {
  width: number;
  height: number;
  pad: { top: number; right: number; bottom: number; left: number };
  quarterMonthsOnly: boolean;
  spikeCount: number;
};

const FRAMES: Record<Frame, FrameSpec> = {
  wide: {
    width: 720,
    height: 300,
    pad: { top: 24, right: 12, bottom: 24, left: 36 },
    quarterMonthsOnly: false,
    spikeCount: 5
  },
  narrow: {
    width: 360,
    height: 260,
    pad: { top: 20, right: 8, bottom: 24, left: 30 },
    quarterMonthsOnly: true,
    spikeCount: 3
  }
};

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
];

const DAY_MS = 86_400_000;
const FONT_SIZE = 11;
const CHAR_WIDTH = FONT_SIZE * 0.6;
const LINE_HEIGHT = FONT_SIZE + 4;
const LABEL_GAP = 6;
const DOT_CLEARANCE = 3;
const LOW_EXP = -1;
const MIN_TOP_EXP = 2;
const HOT_RATIO = 2;

const round1 = (n: number): number => Math.round(n * 10) / 10;

const utc = (date: IsoDate): number => Date.parse(`${date}T00:00:00.000Z`);

export const dayMonth = (date: IsoDate): string => {
  const at = new Date(utc(date));
  return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}`;
};

const spikeLabel = (spike: Spike): string =>
  `${dayMonth(spike.date)} · ${spike.timesMedian}×`;

const gridLabel = (exp: number): string => (exp === -1 ? '½×' : `${2 ** exp}×`);

type Dot = { date: IsoDate; x: number; y: number; text: string };

type Label = { left: number; right: number; y: number; anchor: LabelAnchor };

const overlaps = (a: Label, b: Label): boolean =>
  a.left < b.right + 2 &&
  b.left < a.right + 2 &&
  Math.abs(a.y - b.y) < LINE_HEIGHT;

const covers = (label: Label, dot: Dot): boolean =>
  dot.x >= label.left - DOT_CLEARANCE &&
  dot.x <= label.right + DOT_CLEARANCE &&
  dot.y >= label.y - FONT_SIZE - DOT_CLEARANCE &&
  dot.y <= label.y + DOT_CLEARANCE;

const placeLabels = (
  dots: Dot[],
  bounds: { left: number; right: number }
): Label[] => {
  const placed: Label[] = [];
  for (const dot of dots) {
    const w = dot.text.length * CHAR_WIDTH;
    const anchor: LabelAnchor =
      dot.x - w / 2 < bounds.left
        ? 'start'
        : dot.x + w / 2 > bounds.right
          ? 'end'
          : 'middle';
    const left =
      anchor === 'start' ? dot.x : anchor === 'end' ? dot.x - w : dot.x - w / 2;
    const label = { left, right: left + w, y: dot.y - LABEL_GAP, anchor };
    const clearOf = (): number | null => {
      const hit = placed.find((p) => overlaps(p, label));
      if (hit) return hit.y - LINE_HEIGHT;
      const other = dots.find((d) => d !== dot && covers(label, d));
      return other ? other.y - DOT_CLEARANCE - 1 : null;
    };
    for (let y = clearOf(); y !== null; y = clearOf()) label.y = y;
    placed.push(label);
  }
  return placed;
};

const monthStarts = (from: IsoDate, to: IsoDate): Date[] => {
  const first = new Date(utc(from));
  const end = utc(to);
  const starts: Date[] = [];
  let at = Date.UTC(
    first.getUTCFullYear(),
    first.getUTCMonth() + (first.getUTCDate() === 1 ? 0 : 1),
    1
  );
  while (at <= end) {
    const d = new Date(at);
    starts.push(d);
    at = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  }
  return starts;
};

export const seismograph = (
  series: ChartSeries,
  frame: Frame
): ChartGeometry => {
  const spec = FRAMES[frame];
  const { pad, width } = spec;
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = spec.height - pad.top - pad.bottom;
  const median = series.stats.median;
  const ratio = (views: number): number => (median > 0 ? views / median : 1);

  const peakRatio = Math.max(1, ...series.days.map((d) => ratio(d.views)));
  const topExp = Math.max(MIN_TOP_EXP, Math.ceil(Math.log2(peakRatio)));
  const yIn = (r: number): number => {
    const exp = Math.max(LOW_EXP, Math.log2(r));
    return pad.top + ((topExp - exp) / (topExp - LOW_EXP)) * plotHeight;
  };

  const start = utc(series.from);
  const spanDays = Math.max(1, (utc(series.to) - start) / DAY_MS + 1);
  const xAt = (date: IsoDate): number =>
    round1(
      pad.left + (((utc(date) - start) / DAY_MS + 0.5) * plotWidth) / spanDays
    );

  const dots: Dot[] = series.spikes.slice(0, spec.spikeCount).map((spike) => ({
    date: spike.date,
    x: xAt(spike.date),
    y: yIn(ratio(spike.views)),
    text: spikeLabel(spike)
  }));
  const labels = placeLabels(dots, {
    left: pad.left,
    right: width - pad.right
  });

  const highestLabel = Math.min(Infinity, ...labels.map((l) => l.y));
  const shift = Math.max(0, Math.ceil(LINE_HEIGHT - highestLabel));
  const yAt = (r: number): number => round1(shift + yIn(r));
  const baselineY = yAt(1);

  const normal: string[] = [];
  const hot: string[] = [];
  for (const d of series.days) {
    const r = ratio(d.views);
    (r >= HOT_RATIO ? hot : normal).push(
      `M${xAt(d.date)} ${baselineY}V${yAt(r)}`
    );
  }

  const gridlines = [];
  for (let exp = LOW_EXP; exp <= topExp; exp++)
    gridlines.push({ y: yAt(2 ** exp), label: gridLabel(exp) });

  const months = monthStarts(series.from, series.to)
    .filter((d) => !spec.quarterMonthsOnly || d.getUTCMonth() % 3 === 0)
    .map((d) => ({
      x: xAt(d.toISOString().slice(0, 10)),
      label: MONTHS[d.getUTCMonth()]
    }));

  return {
    frame,
    width,
    height: spec.height + shift,
    fontSize: FONT_SIZE,
    plot: {
      left: pad.left,
      right: width - pad.right,
      top: pad.top + shift,
      bottom: spec.height - pad.bottom + shift
    },
    baselineY,
    top: 2 ** topExp,
    gridlines,
    normalPath: normal.join(''),
    hotPath: hot.join(''),
    months,
    spikes: dots.map((dot, i) => {
      const label = labels[i];
      const moved = label.y < dot.y - LABEL_GAP;
      return {
        date: dot.date,
        x: dot.x,
        y: round1(shift + dot.y),
        label: {
          x: dot.x,
          y: round1(shift + label.y),
          text: dot.text,
          anchor: label.anchor,
          leader: moved
            ? {
                y1: round1(shift + dot.y - DOT_CLEARANCE - 1),
                y2: round1(shift + label.y + DOT_CLEARANCE)
              }
            : null
        }
      };
    })
  };
};
