export const FAILURE_CLASSES = [
  {
    cls: 'robots_disallowed',
    pattern: /disallowed by robots\.txt/i,
    description: 'robots.txt disallows the URL for the collector.',
  },
  {
    cls: 'identity_refused',
    pattern:
      /ERR_HTTP2_PROTOCOL_ERROR|ERR_CONNECTION_RESET|ECONNRESET|\bHTTP 403\b|bot-challenge page/,
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
      /\bHTTP 5\d\d\b|robots\.txt for \S+ was unreachable|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_REFUSED|ERR_CERT_|ECONNREFUSED|ENOTFOUND|DNS lookup|did not resolve to a usable address/,
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
    pattern: /timed out|\bTimeout \d+ms exceeded|aborted due to timeout|ERR_TIMED_OUT|ETIMEDOUT/i,
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

const URL_PATTERN = /https?:\/\/[^\s"'<>()[\]{}`]+/gi;
const MAX_FAILED_URL_LENGTH = 2048;
const MAX_CAUSE_DEPTH = 4;

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

function firstUrl(texts: string[]): string | null {
  for (const text of texts) {
    for (const [match] of text.matchAll(URL_PATTERN)) {
      const url = publicFailureUrl(match.replace(/[.,;:!?]+$/, ''));
      if (url) return url;
    }
  }
  return null;
}

export function classifyFailure(error: unknown): {
  cls: FailureClass;
  url: string | null;
} {
  const texts = failureTexts(error);
  const cls =
    texts
      .map((text) => FAILURE_CLASSES.find(({ pattern }) => pattern.test(text))?.cls)
      .find((found) => found !== undefined && found !== 'other') ?? 'other';
  return { cls, url: carriedUrl(error) ?? firstUrl(texts) };
}

export function isFailureClass(value: unknown): value is FailureClass {
  return FAILURE_CLASSES.some(({ cls }) => cls === value);
}
