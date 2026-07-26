import {
  JURISDICTIONS,
  type Jurisdiction,
} from '@/types';

export type NetworkRelationFilter = 'all' | 'thematic' | 'formal';
export type NetworkViewMode = 'focus' | 'overview';

export interface NetworkViewState {
  focus: string | null;
  query: string;
  jurisdictions: Jurisdiction[];
  theme: string | null;
  relation: NetworkRelationFilter;
  view: NetworkViewMode;
}

interface ParseNetworkViewStateOptions {
  defaultFocus: string | null;
  validNodeIds: Iterable<string>;
  validThemeKeys: Iterable<string>;
}

const RELATION_FILTERS = new Set<NetworkRelationFilter>([
  'all',
  'thematic',
  'formal',
]);
const VIEW_MODES = new Set<NetworkViewMode>(['focus', 'overview']);
const JURISDICTION_SET = new Set<string>(JURISDICTIONS);

export function defaultNetworkViewState(
  defaultFocus: string | null,
): NetworkViewState {
  return {
    focus: defaultFocus,
    query: '',
    jurisdictions: [...JURISDICTIONS].sort(),
    theme: null,
    relation: 'all',
    view: 'focus',
  };
}

export function parseNetworkViewState(
  params: URLSearchParams,
  options: ParseNetworkViewStateOptions,
): NetworkViewState {
  const defaults = defaultNetworkViewState(options.defaultFocus);
  const validNodeIds = new Set(options.validNodeIds);
  const validThemeKeys = new Set(options.validThemeKeys);
  const focusParam = params.get('focus');
  const relationParam = params.get('relation') as NetworkRelationFilter | null;
  const viewParam = params.get('view') as NetworkViewMode | null;
  const themeParam = params.get('theme');
  const jurisdictionParam = params.get('jurisdiction');

  const jurisdictions = jurisdictionParam
    ? jurisdictionParam
        .split(',')
        .filter((value): value is Jurisdiction =>
          JURISDICTION_SET.has(value),
        )
    : defaults.jurisdictions;

  return {
    focus: params.has('focus')
      ? focusParam === 'none'
        ? null
        : focusParam && validNodeIds.has(focusParam)
          ? focusParam
          : defaults.focus
      : defaults.focus,
    query: params.get('q')?.trim().slice(0, 120) ?? '',
    jurisdictions:
      jurisdictions.length > 0
        ? [...new Set(jurisdictions)].sort()
        : defaults.jurisdictions,
    theme:
      themeParam && validThemeKeys.has(themeParam) ? themeParam : null,
    relation:
      relationParam && RELATION_FILTERS.has(relationParam)
        ? relationParam
        : 'all',
    view: viewParam && VIEW_MODES.has(viewParam) ? viewParam : 'focus',
  };
}

export function serializeNetworkViewState(
  state: NetworkViewState,
): URLSearchParams {
  const params = new URLSearchParams();
  const allJurisdictions = [...JURISDICTIONS].sort();
  const jurisdictions = [...state.jurisdictions].sort();

  params.set('focus', state.focus ?? 'none');
  if (state.query) params.set('q', state.query);
  if (
    jurisdictions.length !== allJurisdictions.length ||
    jurisdictions.some(
      (jurisdiction, index) => jurisdiction !== allJurisdictions[index],
    )
  ) {
    params.set('jurisdiction', jurisdictions.join(','));
  }
  if (state.theme) params.set('theme', state.theme);
  if (state.relation !== 'all') params.set('relation', state.relation);
  if (state.view !== 'focus') params.set('view', state.view);

  return params;
}
