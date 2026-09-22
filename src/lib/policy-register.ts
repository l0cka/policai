import {
  JURISDICTION_NAMES, POLICY_TYPE_NAMES, POLICY_STATUS_NAMES,
  getJurisdictionName, getPolicyTypeName, getPolicyStatusName, getPrimaryPolicyDate,
  type Policy,
} from '@/types';

export type PolicySortField = 'title' | 'jurisdiction' | 'type' | 'status' | 'effectiveDate';
export type PolicySortDirection = 'asc' | 'desc';
export type PolicyViewMode = 'table' | 'list';
export const REGISTER_PAGE_SIZE = 8;

/** Research state is owned by the browser URL, never by the result renderer. */
export interface RegisterState {
  search: string;
  jurisdictions: string[];
  types: string[];
  statuses: string[];
  sortField: PolicySortField;
  sortDirection: PolicySortDirection;
  viewMode: PolicyViewMode;
  page: number;
}

const sortFields = ['title', 'jurisdiction', 'type', 'status', 'effectiveDate'];
const own = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);

export function parseRegisterState(params: URLSearchParams): RegisterState {
  const selected = (key: string, names: object) => [...new Set(
    params.getAll(key).flatMap(value => value.split(',')).filter(value => own(names, value) && value !== 'trashed'),
  )];
  const [field, direction] = (params.get('sort') ?? '').split(':');
  const validSort = sortFields.includes(field) && ['asc', 'desc'].includes(direction);
  const page = Number(params.get('page') ?? 1);
  return {
    search: params.get('q') ?? '',
    jurisdictions: selected('jurisdiction', JURISDICTION_NAMES),
    types: selected('type', POLICY_TYPE_NAMES),
    statuses: selected('status', POLICY_STATUS_NAMES),
    sortField: validSort ? field as PolicySortField : 'effectiveDate',
    sortDirection: validSort ? direction as PolicySortDirection : 'desc',
    viewMode: params.get('view') === 'table' ? 'table' : 'list',
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}

export function registerParams(state: RegisterState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.search) params.set('q', state.search);
  if (state.jurisdictions.length) params.set('jurisdiction', state.jurisdictions.join(','));
  if (state.types.length) params.set('type', state.types.join(','));
  if (state.statuses.length) params.set('status', state.statuses.join(','));
  if (state.sortField !== 'effectiveDate' || state.sortDirection !== 'desc') params.set('sort', `${state.sortField}:${state.sortDirection}`);
  if (state.viewMode !== 'list') params.set('view', state.viewMode);
  if (state.page > 1) params.set('page', String(state.page));
  return params;
}

export function updateRegisterState(state: RegisterState, patch: Partial<RegisterState>): RegisterState {
  const criteria = ['search', 'jurisdictions', 'types', 'statuses', 'sortField', 'sortDirection'] as const;
  const resetPage = criteria.some(key => key in patch && JSON.stringify(patch[key]) !== JSON.stringify(state[key]));
  return { ...state, ...patch, page: resetPage ? 1 : patch.page ?? state.page };
}

export function selectRegisterPolicies(policies: Policy[], state: RegisterState): Policy[] {
  const query = state.search.trim().toLowerCase();
  const label = (policy: Policy): string => {
    switch (state.sortField) {
      case 'jurisdiction': return getJurisdictionName(policy.jurisdiction);
      case 'type': return getPolicyTypeName(policy.type);
      case 'status': return getPolicyStatusName(policy.status);
      case 'effectiveDate': {
        const date = getPrimaryPolicyDate(policy).date;
        return date instanceof Date ? date.toISOString() : date;
      }
      default: return policy.title;
    }
  };
  return policies.filter(policy =>
    (!query || [policy.title, policy.description, ...policy.tags, ...policy.agencies].some(value => value.toLowerCase().includes(query))) &&
    (!state.jurisdictions.length || state.jurisdictions.includes(policy.jurisdiction)) &&
    (!state.types.length || state.types.includes(policy.type)) &&
    (!state.statuses.length || state.statuses.includes(policy.status)),
  ).sort((a, b) => {
    const comparison = label(a).localeCompare(label(b), 'en-AU') || a.id.localeCompare(b.id);
    return state.sortDirection === 'asc' ? comparison : -comparison;
  });
}
