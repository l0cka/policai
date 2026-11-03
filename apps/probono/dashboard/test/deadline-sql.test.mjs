import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NON_DEADLINE_SQL } from '../lib/deadline-data.ts';
import { looksLikeNonDeadline } from '../lib/deadline-model.ts';

const sqlRegex = new RegExp(NON_DEADLINE_SQL.slice(1, -1).replaceAll('\\y', '\\b'), 'i');

const PROBES = [
  'commence', 'commences', 'commenced', 'commencement', 'commencing',
  'takes effect', 'take effect', 'comes into force', 'come into effect',
  'expo', 'election', 'open', 'opens', 'opened', 'opening', 'launch', 'launched',
  'meeting', 'webinar', 'event', 'forum', 'conference', 'symposium', 'summit',
  'information session', 'info session', 'workshop', 'hearing', 'agm', 'general meeting',
];

describe('NON_DEADLINE_SQL mirrors the JS model', () => {
  it('matches every phrase the JS non-deadline rule matches', () => {
    for (const probe of PROBES) {
      assert.equal(looksLikeNonDeadline(probe), true, `JS matches ${probe}`);
      assert.ok(sqlRegex.test(probe), `SQL matches ${probe}`);
    }
  });
});
