export const STREAMS: Record<string, string> = {
  news: 'News', law_reform: 'Law reform', funding: 'Funding', tech_justice: 'Tech & justice',
};
export const RADAR_PAGE_SIZE = 25;
export type RadarSearchParams = Record<string, string | string[] | undefined>;
export interface RadarState {
  stream?: string;
  q?: string;
  opp?: '1';
  filtered?: '1';
  page: number;
}

export function parseRadarState(params: RadarSearchParams): RadarState {
  const first = (key: string) => Array.isArray(params[key]) ? params[key][0] : params[key];
  const stream = first('stream');
  const page = Number(first('page') ?? 1);
  return {
    stream: stream && Object.prototype.hasOwnProperty.call(STREAMS, stream) ? stream : undefined,
    q: first('q')?.trim().slice(0, 300) || undefined,
    opp: first('opp') === '1' ? '1' : undefined,
    filtered: first('filtered') === '1' ? '1' : undefined,
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}

/** Filter/search changes return to page one; pagination retains the research context. */
export function radarHref(state: RadarState, patch: Partial<RadarState> = {}): string {
  const changed = ['stream', 'q', 'opp', 'filtered'].some(key => key in patch);
  const next = { ...state, ...patch, page: changed ? 1 : patch.page ?? state.page };
  const params = new URLSearchParams();
  for (const key of ['stream', 'q', 'opp', 'filtered'] as const) {
    if (next[key]) params.set(key, next[key]);
  }
  if (next.page > 1) params.set('page', String(next.page));
  return `/${params.size ? `?${params}` : ''}#radar-feed`;
}

export function radarPage(total: number, requestedPage: number) {
  const pages = Math.max(1, Math.ceil(total / RADAR_PAGE_SIZE));
  const page = Math.min(Math.max(1, requestedPage), pages);
  const offset = (page - 1) * RADAR_PAGE_SIZE;
  return { page, pages, offset, first: total ? offset + 1 : 0, last: Math.min(offset + RADAR_PAGE_SIZE, total), total };
}
