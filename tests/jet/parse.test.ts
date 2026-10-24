import { describe, expect, it } from 'bun:test';
import {
  parseElonJetPost,
  parseFuelReply
} from '../../src/jet/sources/bluesky/parse';
import feedPages from '../fixtures/elonjet-feed.json';

const at = '2026-09-29T20:06:40.347712+00:00';
const uri = 'at://did:plc:test/app.bsky.feed.post/abc';

describe('parseElonJetPost: bot posts', () => {
  const cases: [
    string,
    {
      kind: 'takeoff' | 'landing';
      tail: string | null;
      place: string;
      durationMin: number | null;
    }
  ][] = [
    [
      'N8628 Took off from Austin, Texas, United States.',
      {
        kind: 'takeoff',
        tail: 'N8628',
        place: 'Austin, Texas, United States',
        durationMin: null
      }
    ],
    [
      'N8628 Took off near Savannah, Georgia, United States.',
      {
        kind: 'takeoff',
        tail: 'N8628',
        place: 'Savannah, Georgia, United States',
        durationMin: null
      }
    ],
    [
      'N8628 Landed in Austin, Texas, United States. Apx. flt. time 2 h 5 min. ',
      {
        kind: 'landing',
        tail: 'N8628',
        place: 'Austin, Texas, United States',
        durationMin: 125
      }
    ],
    [
      'N8628 Landed in Austin, Texas, United States. Apx. flt. time 17 min.',
      {
        kind: 'landing',
        tail: 'N8628',
        place: 'Austin, Texas, United States',
        durationMin: 17
      }
    ],
    [
      'N8628 Landed in Brownsville, Texas, United States. Apx. flt. time 3 h.',
      {
        kind: 'landing',
        tail: 'N8628',
        place: 'Brownsville, Texas, United States',
        durationMin: 180
      }
    ],
    [
      'N8628 Landed near Savannah, Georgia, United States. Apx. flt. time 47 min.',
      {
        kind: 'landing',
        tail: 'N8628',
        place: 'Savannah, Georgia, United States',
        durationMin: 47
      }
    ],
    [
      'N7628 Landed in San Jose, California, United States.',
      {
        kind: 'landing',
        tail: 'N7628',
        place: 'San Jose, California, United States',
        durationMin: null
      }
    ],
    [
      'Landed in San Jose, California, United States. Apx. flt. time 0 min.',
      {
        kind: 'landing',
        tail: null,
        place: 'San Jose, California, United States',
        durationMin: 0
      }
    ],
    [
      'Took off from Zurich, Zürich, Switzerland.',
      {
        kind: 'takeoff',
        tail: null,
        place: 'Zurich, Zürich, Switzerland',
        durationMin: null
      }
    ],
    [
      'N628TS Landed in Tokyo, Tōkyō Prefecture, Japan. Apx. flt. time 6 h 36 min. ',
      {
        kind: 'landing',
        tail: 'N628TS',
        place: 'Tokyo, Tōkyō Prefecture, Japan',
        durationMin: 396
      }
    ],
    [
      'N628TS Took off near New Delhi, Delhi (National Capital Territory), India.',
      {
        kind: 'takeoff',
        tail: 'N628TS',
        place: 'New Delhi, Delhi (National Capital Territory), India',
        durationMin: null
      }
    ],
    [
      'N628TS Landed in St. Louis, Missouri, United States. Apx. flt. time 1 h 2 min.',
      {
        kind: 'landing',
        tail: 'N628TS',
        place: 'St. Louis, Missouri, United States',
        durationMin: 62
      }
    ]
  ];

  for (const [text, want] of cases) {
    it(`parses ${JSON.stringify(text)}`, () => {
      expect(parseElonJetPost(text, at, uri)).toEqual({
        ...want,
        at: '2026-09-29T20:06:40.347Z',
        uri
      });
    });
  }

  it('normalises both timestamp styles the feed uses to ISO UTC', () => {
    const text = 'N8628 Took off from Austin, Texas, United States.';
    expect(parseElonJetPost(text, '2026-03-13T23:30:23.913Z', uri)?.at).toBe(
      '2026-03-13T23:30:23.913Z'
    );
    expect(
      parseElonJetPost(text, '2026-09-29T20:06:40.347712+00:00', uri)?.at
    ).toBe('2026-09-29T20:06:40.347Z');
  });

  it('rejects a post with an unparseable timestamp', () => {
    const text = 'N8628 Took off from Austin, Texas, United States.';
    expect(parseElonJetPost(text, 'yesterday', uri)).toBeNull();
  });
});

describe('parseElonJetPost: everything else', () => {
  const ignored = [
    'N7628 took off a bit ago from Austin',
    'N7628 Took off from San Jose a short while ago headed south.',
    'N8628 Took off from Austin Texas',
    'N8628 took off from Austin going to California.',
    'N7628 flew from Austin to Memphis today.',
    'N8628 taking off as N628TS lands right behind.',
    'Both jets inbound to Austin. One made a stop in Burbank first.',
    'Rejected takeoff',
    ''
  ];
  for (const text of ignored) {
    it(`ignores ${JSON.stringify(text)}`, () => {
      expect(parseElonJetPost(text, at, uri)).toBeNull();
    });
  }
});

describe('parseFuelReply', () => {
  it('reads gallons, dollars and tonnes of CO₂ from a real reply', () => {
    const text =
      '\n~ 782 gallons (2,960 liters). \n~ 5,240 lbs (2,377 kg) of jet fuel used. \n~ $6,083 cost of fuel. \n~ 8 tons of CO2 emissions.';
    expect(parseFuelReply(text)).toEqual({
      gallons: 782,
      usd: 6083,
      co2Tons: 8
    });
  });

  it('reads thousands separators', () => {
    const text =
      '\n~ 1,021 gallons (3,863 liters). \n~ 6,840 lbs (3,103 kg) of jet fuel used. \n~ $7,961 cost of fuel. \n~ 11 tons of CO2 emissions.';
    expect(parseFuelReply(text)).toEqual({
      gallons: 1021,
      usd: 7961,
      co2Tons: 11
    });
  });

  it('reads fractional tonnes', () => {
    const text =
      '\n~ 6 gallons (22 liters). \n~ 40 lbs (18 kg) of jet fuel used. \n~ $40 cost of fuel. \n~ 0.0625 tons of CO2 emissions.';
    expect(parseFuelReply(text)?.co2Tons).toBe(0.0625);
  });

  it('rejects the negative estimates the bot sometimes posts', () => {
    const text =
      '\n~ -6 gallons (-22 liters). \n~ -40 lbs (-18 kg) of jet fuel used. \n~ $-40 cost of fuel. \n~ -0.0625 tons of CO2 emissions.';
    expect(parseFuelReply(text)).toBeNull();
  });

  it('rejects replies that are not fuel estimates', () => {
    expect(parseFuelReply('Confirmed')).toBeNull();
    expect(
      parseFuelReply('Musk to spend July 4th in Jackson Hole?')
    ).toBeNull();
    expect(parseFuelReply('~ 782 gallons (2,960 liters).')).toBeNull();
  });
});

describe('the feed fixture', () => {
  const posts = feedPages.flatMap((page) =>
    page.feed
      .filter((item) => !('reason' in item))
      .map((item) => item.post.record)
  );

  it('parses every bot-format takeoff and landing', () => {
    const botShaped = posts.filter((r) =>
      /^(N\w+ )?(Took off|Landed) (from|near|in) [^,]+, .+\.( Apx\. flt\. time .+\.)?\s*$/.test(
        r.text
      )
    );
    expect(botShaped.length).toBeGreaterThan(40);
    for (const r of botShaped) {
      expect(parseElonJetPost(r.text, r.createdAt, uri)).not.toBeNull();
    }
  });

  it('reads a fuel estimate from every fuel-shaped reply except negative ones', () => {
    const fuelShaped = posts.filter(
      (r) => 'reply' in r && r.text.includes('cost of fuel')
    );
    expect(fuelShaped.length).toBeGreaterThan(10);
    for (const r of fuelShaped) {
      const fuel = parseFuelReply(r.text);
      if (r.text.includes('~ -')) expect(fuel).toBeNull();
      else expect(fuel).not.toBeNull();
    }
  });
});
