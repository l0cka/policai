export const FAILURE_CLASSES = [
  {
    cls: 'robots_disallowed',
    pattern: /disallowed by robots\.txt/i,
    description: 'robots.txt disallows the URL for the collector.',
  },
  {
    cls: 'identity_refused',
    pattern:
      /ERR_HTTP2_PROTOCOL_ERROR|ERR_CONNECTION_RESET|ECONNRESET|\bHTTP 403\b|bot-challenge page|refused the headless browser with a 403/,
    description:
      'Heuristic label: HTTP/2 protocol error, connection reset, HTTP 403 or a bot challenge. An outage can look the same; a human decides.',
  },
  {
    cls: 'rate_limited',
    pattern: /\bHTTP 429\b/,
    description: 'HTTP 429.',
  },
  {
    cls: 'host_unavailable',
    pattern:
      /\bHTTP 5\d\d\b|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_REFUSED|ERR_CERT_|ECONNREFUSED|ENOTFOUND|DNS lookup|did not resolve to a usable address/,
    description: 'HTTP 5xx, DNS, refused connection or TLS certificate failure.',
  },
  {
    cls: 'not_found',
    pattern: /\bHTTP (?:404|410)\b/,
    description: 'HTTP 404 or 410.',
  },
  {
    cls: 'http_error',
    pattern: /\bHTTP \d{3}\b/,
    description: 'Any other HTTP error status.',
  },
  {
    cls: 'timeout',
    pattern: /timed out|\bTimeout \d+ms exceeded|aborted due to timeout|ERR_TIMED_OUT|ETIMEDOUT|host-gate wait budget/i,
    description: 'A retrieval or navigation deadline passed.',
  },
  {
    cls: 'empty',
    pattern:
      /returned no (?:usable|extractable) index or feed items|usable items; at least \d+ are required|returned no document bytes|produced no response/,
    description: 'The source answered with no usable items or bytes.',
  },
  {
    cls: 'parse',
    pattern:
      /no extractable text|no readable document text|extraction requires manual review|[Uu]nsupported (?:source content|document) type|byte validation|conflicting content type|DOCX|Invalid PDF|produced no extraction/,
    description: 'Content arrived but could not be extracted.',
  },
  {
    cls: 'other',
    pattern: /(?:)/,
    description: 'Anything else.',
  },
] as const satisfies readonly {
  cls: string;
  pattern: RegExp;
  description: string;
}[];

export type FailureClass = (typeof FAILURE_CLASSES)[number]['cls'];

const LOOSE_URL_PATTERN = /https?:\/\/\S+/gi;
const MAX_FAILED_URL_LENGTH = 2048;
const MAX_CAUSE_DEPTH = 4;
const SENTENCE_PUNCT = new Set(['.', ',', ';', ':', '!', '?']);
const WRAPPER_CHARS = new Set(['"', "'", '<', '>', '[', ']', '{', '}', '`']);

export function publicFailureUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(parsed.protocol)) return null;
  parsed.username = '';
  parsed.password = '';
  parsed.search = '';
  parsed.hash = '';
  const url = parsed.toString();
  return url.length <= MAX_FAILED_URL_LENGTH ? url : `${parsed.origin}/`;
}

function failureTexts(error: unknown, depth = 0): string[] {
  if (typeof error === 'string') return [error];
  if (!(error instanceof Error) || depth > MAX_CAUSE_DEPTH) return [];
  const code = 'code' in error && typeof error.code === 'string' ? [error.code] : [];
  const members =
    error instanceof AggregateError
      ? error.errors.flatMap((member: unknown) => failureTexts(member, depth + 1))
      : [];
  return [error.message, ...code, ...members, ...failureTexts(error.cause, depth + 1)];
}

function carriedUrl(error: unknown): string | null {
  return error instanceof Error && 'url' in error && typeof error.url === 'string'
    ? publicFailureUrl(error.url)
    : null;
}

function trimSentencePunct(raw: string): string {
  let end = raw.length;
  while (end > 0 && SENTENCE_PUNCT.has(raw[end - 1]!)) end -= 1;
  return raw.slice(0, end);
}

function countChar(raw: string, char: string): number {
  let count = 0;
  for (const next of raw) if (next === char) count += 1;
  return count;
}

function peelTrailingJunk(raw: string): string {
  let candidate = trimSentencePunct(raw);
  while (candidate.length > 0) {
    const last = candidate[candidate.length - 1]!;
    if (WRAPPER_CHARS.has(last)) {
      candidate = trimSentencePunct(candidate.slice(0, -1));
      continue;
    }
    if (last === ')' && countChar(candidate, '(') < countChar(candidate, ')')) {
      candidate = trimSentencePunct(candidate.slice(0, -1));
      continue;
    }
    break;
  }
  return candidate;
}

function extractPublicUrl(raw: string): string | null {
  let candidate = raw;
  while (candidate.length > 8) {
    const peeled = peelTrailingJunk(candidate);
    const url = publicFailureUrl(peeled);
    if (url) return url;
    candidate = candidate.slice(0, -1);
  }
  return null;
}

function firstUrl(texts: string[]): string | null {
  for (const text of texts) {
    for (const [match] of text.matchAll(LOOSE_URL_PATTERN)) {
      const url = extractPublicUrl(match);
      if (url) return url;
    }
  }
  return null;
}

function stripUrls(text: string): string {
  return text.replace(LOOSE_URL_PATTERN, ' ');
}

function classFromStatus(status: number): FailureClass | null {
  if (status === 403) return 'identity_refused';
  if (status === 429) return 'rate_limited';
  if (status >= 500 && status <= 599) return 'host_unavailable';
  if (status === 404 || status === 410) return 'not_found';
  if (status >= 400 && status <= 599) return 'http_error';
  return null;
}

function carriedStatus(error: unknown): number | undefined {
  return error instanceof Error && 'status' in error && typeof error.status === 'number'
    ? error.status
    : undefined;
}

function classFromTexts(texts: string[]): FailureClass {
  return (
    texts
      .map((text) =>
        FAILURE_CLASSES.find(({ pattern }) => pattern.test(stripUrls(text)))?.cls,
      )
      .find((found) => found !== undefined && found !== 'other') ?? 'other'
  );
}

export function classifyFailure(error: unknown): {
  cls: FailureClass;
  url: string | null;
} {
  const texts = failureTexts(error);
  const fromTexts = classFromTexts(texts);
  const status = carriedStatus(error);
  const fromStatus = status === undefined ? null : classFromStatus(status);
  const cls =
    fromTexts === 'robots_disallowed'
      ? fromTexts
      : (fromStatus ?? fromTexts);
  return { cls, url: carriedUrl(error) ?? firstUrl(texts) };
}

export function isFailureClass(value: unknown): value is FailureClass {
  return FAILURE_CLASSES.some(({ cls }) => cls === value);
}
