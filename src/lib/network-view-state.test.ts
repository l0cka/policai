import { describe, expect, it } from 'vitest';
import {
  defaultNetworkViewState,
  parseNetworkViewState,
  serializeNetworkViewState,
} from './network-view-state';

const options = {
  defaultFocus: 'policy-a',
  validNodeIds: ['policy-a', 'policy-b'],
  validThemeKeys: ['courts', 'privacy'],
};

describe('network view state', () => {
  it('uses a stable, validated default state', () => {
    expect(parseNetworkViewState(new URLSearchParams(), options)).toEqual(
      defaultNetworkViewState('policy-a'),
    );
  });

  it('parses and serializes committed filters in a stable order', () => {
    const state = parseNetworkViewState(
      new URLSearchParams(
        'view=overview&theme=courts&relation=thematic&jurisdiction=vic,federal&q=court&focus=policy-b',
      ),
      options,
    );

    expect(state).toMatchObject({
      focus: 'policy-b',
      query: 'court',
      jurisdictions: ['federal', 'vic'],
      theme: 'courts',
      relation: 'thematic',
      view: 'overview',
    });
    expect(serializeNetworkViewState(state).toString()).toBe(
      'focus=policy-b&q=court&jurisdiction=federal%2Cvic&theme=courts&relation=thematic&view=overview',
    );
  });

  it('preserves an explicitly closed inspector and rejects invalid state', () => {
    const closed = parseNetworkViewState(
      new URLSearchParams(
        'focus=none&theme=unknown&relation=wrong&view=wrong&jurisdiction=unknown',
      ),
      options,
    );

    expect(closed.focus).toBeNull();
    expect(closed.theme).toBeNull();
    expect(closed.relation).toBe('all');
    expect(closed.view).toBe('focus');
    expect(closed.jurisdictions).toHaveLength(9);
    expect(serializeNetworkViewState(closed).get('focus')).toBe('none');
  });
});
