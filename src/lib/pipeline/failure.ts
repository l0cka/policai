export const FAILURE_CLASSES = [
  {
    cls: 'identity_refused',
    pattern:
      /ERR_HTTP2_PROTOCOL_ERROR|ERR_CONNECTION_RESET|ECONNRESET|\bHTTP 403\b|bot-challenge page/,
    description:
      'Heuristic label: HTTP/2 protocol error, connection reset, HTTP 403 or a bot challenge. An outage can look the same; a human decides.',
  },
  {
    cls: 'robots_disallowed',
    pattern: /disallowed by robots\.txt/i,
    description: 'robots.txt disallows the URL for the collector.',
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
    pattern: /timed out|timeout|ERR_TIMED_OUT/i,
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

const URL_PATTERN = /https?:\/\/[^\s"'<>()]+/;

export function classifyFailure(error: unknown): {
  cls: FailureClass;
  url: string | null;
} {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  const row = FAILURE_CLASSES.find(({ pattern }) => pattern.test(message));
  const url = message.match(URL_PATTERN)?.[0].replace(/[.,;:]+$/, '') ?? null;
  return { cls: row?.cls ?? 'other', url };
}

export function isFailureClass(value: unknown): value is FailureClass {
  return FAILURE_CLASSES.some(({ cls }) => cls === value);
}
