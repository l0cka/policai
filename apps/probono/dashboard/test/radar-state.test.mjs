import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseRadarState, radarHref, radarPage, RADAR_PAGE_SIZE } from '../lib/radar-state.ts';

describe('radar research state', () => {
  it('normalizes untrusted Next search params without accepting arbitrary streams', () => {
    assert.deepEqual(parseRadarState({stream:'__proto__',q:['first','second'],page:'2x',opp:'yes',filtered:'0'}), {stream:undefined,q:'first',opp:undefined,filtered:undefined,page:1});
    for (const page of ['0','-1','1.5','Infinity','99999999999999999']) assert.equal(parseRadarState({page}).page,1);
  });
  it('keeps filters and literal all search in shareable links anchored to results', () => {
    const state=parseRadarState({q:'all',stream:'funding',opp:'1',page:'3'});
    assert.equal(radarHref(state,{page:4}),'/?stream=funding&q=all&opp=1&page=4#radar-feed');
    assert.equal(radarHref(state,{stream:'news'}),'/?stream=news&q=all&opp=1#radar-feed');
    assert.equal(radarHref(state,{q:undefined,stream:undefined,opp:undefined}),'/#radar-feed');
  });
  it('clamps stale archive links and exposes honest result ranges', () => {
    assert.equal(RADAR_PAGE_SIZE,25);
    assert.deepEqual(radarPage(101,999),{page:5,pages:5,offset:100,first:101,last:101,total:101});
    assert.deepEqual(radarPage(0,2),{page:1,pages:1,offset:0,first:0,last:0,total:0});
    assert.equal(radarPage(50,2).last,50);
  });
});
