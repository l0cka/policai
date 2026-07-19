import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';
import { load } from 'cheerio';
import {
  canonicalizeSourceUrl,
  isAllowedSourceHost,
  isSafePublicHttpsUrl,
  sourceUrlsEqual,
} from '@/lib/source-url';
import { cleanHtmlContent } from '@/lib/utils';
import type {
  LinkedDocumentEvidence,
  SourceEvidence,
} from '@/types';

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_ATTEMPTS = 2;
const DEFAULT_RETRY_DELAY_MS = 250;
const DEFAULT_MAX_RESPONSE_BYTES = 20 * 1024 * 1024;
const DEFAULT_MAX_LINKED_DOCUMENT_BYTES = 32 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const MAX_LINKED_DOCUMENTS = 8;
export type DocumentKind = 'pdf' | 'docx' | 'doc' | 'rtf';

export const COLLECTOR_USER_AGENT =
  'Mozilla/5.0 (compatible; Policai/1.0; +https://policai.com.au)';

export class SourceFetchError extends Error {
  readonly status?: number;
  readonly retryable: boolean;
  readonly code?: 'destination_mismatch';

  constructor(
    message: string,
    options: {
      status?: number;
      retryable?: boolean;
      cause?: unknown;
      code?: 'destination_mismatch';
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'SourceFetchError';
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.code = options.code;
  }
}

async function withinRetrievalDeadline<T>(
  operation: Promise<T>,
  deadlineAt: number,
  timeoutMs: number,
): Promise<T> {
  const remainingMs = deadlineAt - Date.now();
  if (remainingMs <= 0) {
    throw new SourceFetchError(`Timed out after ${timeoutMs}ms`, {
      retryable: true,
    });
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(
            new SourceFetchError(`Timed out after ${timeoutMs}ms`, {
              retryable: true,
            }),
          ),
          remainingMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface RetrievedSource {
  body: string;
  /** Original response bytes, retained for binary document extraction. */
  bytes?: Uint8Array;
  /**
   * Internal retrieved attachments for readability checks and extraction.
   * Only their evidence is persisted; response bytes remain in-memory.
   */
  linkedSources?: RetrievedSource[];
  evidence: SourceEvidence;
  durationMs: number;
}

export interface RetrieveSourceOptions {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
  attempts?: number;
  retryDelayMs?: number;
  maxResponseBytes?: number;
  /** Shared in-memory byte budget across all linked policy documents. */
  maxLinkedDocumentBytes?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  resolveHost?: (hostname: string) => Promise<string[]>;
  destinationPolicy?: 'official' | 'public-https';
  /** Internal escape hatch used when hashing a linked document itself. */
  hashLinkedDocuments?: boolean;
  http1Fallback?: (
    url: string,
    options: {
      now: () => Date;
      timeoutMs: number;
      maxResponseBytes: number;
      resolveHost?: (hostname: string) => Promise<string[]>;
      destinationPolicy?: 'official' | 'public-https';
      deadlineAt?: number;
      startedAt?: number;
    },
  ) => Promise<RetrievedSource>;
}

const BLOCKED_ADDRESSES = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  BLOCKED_ADDRESSES.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['2001::', 32],
  ['2001:2::', 48],
  ['2001:db8::', 32],
  ['2001:10::', 28],
  ['2001:20::', 28],
  ['2002::', 16],
  ['3fff::', 20],
] as const) {
  BLOCKED_ADDRESSES.addSubnet(network, prefix, 'ipv6');
}

const GLOBAL_IPV6_UNICAST = new BlockList();
GLOBAL_IPV6_UNICAST.addSubnet('2000::', 3, 'ipv6');

async function resolveHostAddresses(hostname: string): Promise<string[]> {
  const addresses = await lookup(hostname, {
    all: true,
    verbatim: true,
  });
  return addresses.map((result) => result.address);
}

function isBlockedAddress(address: string): boolean {
  const mappedIpv4 = address.toLowerCase().startsWith('::ffff:')
    ? address.slice('::ffff:'.length)
    : null;
  if (mappedIpv4 && isIP(mappedIpv4) === 4) {
    return BLOCKED_ADDRESSES.check(mappedIpv4, 'ipv4');
  }
  const family = isIP(address);
  if (family === 4) return BLOCKED_ADDRESSES.check(address, 'ipv4');
  if (family === 6) {
    return (
      !GLOBAL_IPV6_UNICAST.check(address, 'ipv6') ||
      BLOCKED_ADDRESSES.check(address, 'ipv6')
    );
  }
  return true;
}

export async function assertSafeSourceUrl(
  url: string,
  resolveHost?: (hostname: string) => Promise<string[]>,
  destinationPolicy: 'official' | 'public-https' = 'official',
): Promise<string[]> {
  const allowed =
    destinationPolicy === 'official'
      ? isAllowedSourceHost(url)
      : isSafePublicHttpsUrl(url);
  if (!allowed) {
    throw new SourceFetchError(
      destinationPolicy === 'official'
        ? 'Source URL must be HTTPS on an allow-listed official host'
        : 'Source URL must be a public HTTPS destination',
      {
        retryable: false,
        code:
          destinationPolicy === 'official'
            ? 'destination_mismatch'
            : undefined,
      },
    );
  }

  if (!resolveHost) return [];
  const hostname = new URL(url).hostname;
  let addresses: string[];
  try {
    addresses = await resolveHost(hostname);
  } catch (error) {
    throw new SourceFetchError(`DNS lookup failed for ${hostname}`, {
      retryable: true,
      cause: error,
    });
  }
  if (addresses.length === 0) {
    throw new SourceFetchError(`DNS lookup returned no addresses for ${hostname}`, {
      retryable: true,
    });
  }
  if (addresses.some(isBlockedAddress)) {
    throw new SourceFetchError(
      `Source host ${hostname} resolved to a blocked network address`,
      { retryable: false },
    );
  }
  return addresses;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export function documentKindFromBytes(
  body: Uint8Array,
): DocumentKind | null {
  const bytes = Buffer.from(body);
  const prefix = bytes.subarray(0, Math.min(bytes.length, 1024));
  if (prefix.indexOf(Buffer.from('%PDF-')) >= 0) return 'pdf';
  if (
    bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) &&
    bytes.includes(Buffer.from('[Content_Types].xml')) &&
    bytes.includes(Buffer.from('word/'))
  ) {
    return 'docx';
  }
  if (
    bytes.subarray(0, 8).equals(
      Buffer.from([
        0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
      ]),
    )
  ) {
    return 'doc';
  }
  if (
    prefix
      .toString('utf8')
      .replace(/^\uFEFF/, '')
      .trimStart()
      .startsWith('{\\rtf')
  ) {
    return 'rtf';
  }
  return null;
}

function shouldRetainBinaryBytes(
  body: Uint8Array,
  contentType: string,
): boolean {
  if (documentKindFromBytes(body)) return true;
  const prefix = Buffer.from(body)
    .subarray(0, Math.min(body.byteLength, 256))
    .toString('utf8')
    .trimStart();
  if (prefix.startsWith('<')) return false;
  const normalized = contentType.toLowerCase();
  return !(
    normalized.startsWith('text/') ||
    normalized.includes('html') ||
    normalized.includes('xml') ||
    normalized.includes('json') ||
    normalized.includes('javascript')
  );
}

function isHtmlPayload(
  body: Buffer | string,
  contentType: string,
): boolean {
  const prefix = (typeof body === 'string' ? body : body.toString('utf8'))
    .slice(0, 4096)
    .trimStart()
    .toLowerCase();
  return (
    contentType.includes('html') ||
    /^(?:<!doctype\s+html|<html|<head|<body|<main|<script|<div|<!--)/.test(
      prefix,
    )
  );
}

function stableHashContent(
  body: Buffer,
  contentType: string,
  baseUrl: string,
): string {
  if (documentKindFromBytes(body)) {
    return createHash('sha256').update(body).digest('hex');
  }
  if (isHtmlPayload(body, contentType)) {
    const markup = body.toString('utf8');
    const $ = load(markup);
    let semantic = $('main').first();
    if (semantic.length === 0) semantic = $('[role="main"]').first();
    if (semantic.length === 0) semantic = $('article').first();
    if (semantic.length === 0) semantic = $('body').first();
    if (semantic.is('body')) {
      semantic.children('header').remove();
    }
    semantic
      .find('nav, footer, aside, script, style, noscript, svg')
      .remove();

    const references = new Set<string>();
    const relevantReference =
      /\b(?:artificial intelligence|ai|policy|standard|framework|guidance|guideline|practice note|regulation|legislation)\b/i;
    const referenceAttributes = [
      ['a[href]', 'href'],
      ['iframe[src]', 'src'],
      ['embed[src]', 'src'],
      ['object[data]', 'data'],
    ] as const;
    for (const [selector, attribute] of referenceAttributes) {
      semantic.find(selector).each((_index, element) => {
        const value = $(element).attr(attribute)?.trim();
        const context = `${$(element).text()} ${value ?? ''}`;
        if (
          value &&
          !value.toLowerCase().startsWith('javascript:') &&
          relevantReference.test(context)
        ) {
          try {
            const resolved = new URL(value, baseUrl);
            if (resolved.protocol === 'http:' || resolved.protocol === 'https:') {
              references.add(
                `${element.tagName}:${attribute}:${canonicalizeSourceUrl(resolved.toString())}`,
              );
            }
          } catch {
            // Invalid references are not stable source identities.
          }
        }
      });
    }

    const metadata = new Set<string>();
    const stableMetadataKeys = new Set([
      'article:published_time',
      'article:modified_time',
      'date',
      'datepublished',
      'dcterms.date',
      'dcterms.issued',
      'dcterms.modified',
      'dc.date',
      'og:title',
      'citation_title',
      'citation_publication_date',
    ]);
    $('meta[content]').each((_index, element) => {
      const key =
        $(element).attr('name') ??
        $(element).attr('property') ??
        $(element).attr('itemprop');
      const value = $(element).attr('content')?.trim();
      if (
        key &&
        value &&
        stableMetadataKeys.has(key.toLowerCase())
      ) {
        metadata.add(`${key.toLowerCase()}:${value}`);
      }
    });
    semantic.find('time[datetime]').each((_index, element) => {
      const value = $(element).attr('datetime')?.trim();
      if (value) metadata.add(`time:${value}`);
    });
    const normalized = JSON.stringify({
      text: cleanHtmlContent(semantic.html() ?? semantic.text()),
      references: Array.from(references).sort(),
      metadata: Array.from(metadata).sort(),
    });
    return createHash('sha256').update(normalized).digest('hex');
  }
  if (contentType.includes('xml')) {
    const normalized = cleanHtmlContent(body.toString('utf8'));
    return createHash('sha256').update(normalized).digest('hex');
  }
  return createHash('sha256').update(body).digest('hex');
}

function linkedDocumentUrls(body: string, baseUrl: string): string[] {
  const $ = load(body);
  let semantic = $('main').first();
  if (semantic.length === 0) semantic = $('[role="main"]').first();
  if (semantic.length === 0) semantic = $('article').first();
  if (semantic.length === 0) semantic = $('body').first();
  semantic.find('nav, footer, aside, script, style, noscript, svg').remove();

  const urls = new Set<string>();
  const documentPath =
    /\.(?:pdf|docx?|rtf)(?:$|[?#])/i;
  const policyContext =
    /\b(?:artificial intelligence|ai|policy|standard|framework|guidance|guideline|practice note|regulation|legislation|instrument)\b/i;
  const explicitDownloadPath =
    /(?:^|\/)(?:download|attachment)(?:\/|$|[?#])/i;
  const declaredDocumentType =
    /(?:pdf|msword|wordprocessingml|rtf)/i;
  const genericDocumentAction =
    /^(?:download|view|open|read)(?:\s+(?:the\s+)?(?:document|file|pdf|word|docx?|rtf))?$/i;
  const pageHeading = semantic.find('h1').first().text().trim();
  const referenceAttributes = [
    ['a[href]', 'href'],
    ['iframe[src]', 'src'],
    ['embed[src]', 'src'],
    ['object[data]', 'data'],
  ] as const;

  for (const [selector, attribute] of referenceAttributes) {
    semantic.find(selector).each((_index, element) => {
      const value = $(element).attr(attribute)?.trim();
      if (!value || value.toLowerCase().startsWith('javascript:')) return;
      const isDownload =
        element.tagName === 'a' && $(element).is('[download]');
      const linkText = $(element).text().replace(/\s+/g, ' ').trim();
      const linkContext = `${linkText} ${value}`;
      const sectionHeading = $(element)
        .closest('section, article, div')
        .find('h1, h2, h3, h4')
        .first()
        .text()
        .trim();
      const genericActionHasPolicyContext =
        (element.tagName !== 'a' ||
          genericDocumentAction.test(linkText) ||
          (isDownload && linkText.length === 0)) &&
        policyContext.test(`${sectionHeading} ${pageHeading}`);
      const declaresDocument = declaredDocumentType.test(
        $(element).attr('type') ?? '',
      );
      const isCandidateDocument =
        documentPath.test(value) ||
        declaresDocument ||
        isDownload ||
        explicitDownloadPath.test(value);
      if (
        !isCandidateDocument ||
        (!policyContext.test(linkContext) &&
          !genericActionHasPolicyContext)
      ) {
        return;
      }
      try {
        const resolved = canonicalizeSourceUrl(
          new URL(value, baseUrl).toString(),
        );
        if (!isSafePublicHttpsUrl(resolved)) {
          throw new SourceFetchError(
            `Recognized policy document URL is not a safe public HTTPS source: ${resolved}`,
            { retryable: false },
          );
        }
        urls.add(resolved);
      } catch (error) {
        if (error instanceof SourceFetchError) throw error;
        // Malformed links are already represented in the page fingerprint.
      }
    });
  }

  if (urls.size > MAX_LINKED_DOCUMENTS) {
    throw new SourceFetchError(
      `Source links to more than ${MAX_LINKED_DOCUMENTS} policy documents; use the canonical instrument URL`,
      { retryable: false },
    );
  }
  return Array.from(urls).sort();
}

function linkedDocumentKind(
  url: string,
  contentType: string,
): DocumentKind | null {
  const pathname = new URL(url).pathname.toLowerCase();
  const pathKind: DocumentKind | null = pathname.endsWith('.pdf')
    ? 'pdf'
    : pathname.endsWith('.docx')
      ? 'docx'
      : pathname.endsWith('.doc')
        ? 'doc'
        : pathname.endsWith('.rtf')
          ? 'rtf'
          : null;
  const normalizedType = contentType.toLowerCase();
  const mimeKind: DocumentKind | null = normalizedType.includes('pdf')
    ? 'pdf'
    : normalizedType.includes(
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        )
      ? 'docx'
      : normalizedType.includes('application/msword')
        ? 'doc'
        : normalizedType.includes('rtf')
          ? 'rtf'
          : null;
  if (pathKind && mimeKind && pathKind !== mimeKind) {
    throw new SourceFetchError(
      `Linked policy document ${url} returned a conflicting content type`,
      { retryable: false },
    );
  }
  return pathKind ?? mimeKind;
}

function assertLinkedDocumentBytes(
  linked: RetrievedSource,
  requestedUrl: string,
): void {
  const bytes = linked.bytes;
  if (!bytes || bytes.length === 0) {
    throw new SourceFetchError(
      `Linked policy document ${requestedUrl} returned no document bytes`,
      { retryable: false },
    );
  }
  const finalUrl = linked.evidence.finalUrl ?? requestedUrl;
  const contentType = linked.evidence.contentType ?? '';
  const expectedKind = linkedDocumentKind(
    finalUrl,
    contentType,
  ) ?? (
    finalUrl === requestedUrl
      ? null
      : linkedDocumentKind(requestedUrl, contentType)
  );
  const buffer = Buffer.from(bytes);
  const actualKind = documentKindFromBytes(buffer);
  const kind = expectedKind ?? actualKind;
  if (!kind) {
    throw new SourceFetchError(
      `Linked policy document ${requestedUrl} returned an unsupported document type`,
      { retryable: false },
    );
  }
  if (actualKind !== kind) {
    throw new SourceFetchError(
      `Linked policy document ${requestedUrl} failed ${kind.toUpperCase()} byte validation`,
      { retryable: false },
    );
  }
}

async function addLinkedDocumentEvidence(
  retrieved: RetrievedSource,
  requestedUrl: string,
  options: RetrieveSourceOptions,
): Promise<RetrievedSource> {
  if (
    options.hashLinkedDocuments === false ||
    !isHtmlPayload(
      retrieved.body,
      retrieved.evidence.contentType ?? '',
    )
  ) {
    return retrieved;
  }

  const urls = linkedDocumentUrls(
    retrieved.body,
    retrieved.evidence.finalUrl ?? requestedUrl,
  );
  if (urls.length === 0) return retrieved;

  const linkedResults: Array<{
    evidence: LinkedDocumentEvidence;
    source: RetrievedSource;
  }> = [];
  const maxLinkedDocumentBytes =
    options.maxLinkedDocumentBytes ?? DEFAULT_MAX_LINKED_DOCUMENT_BYTES;
  let retainedLinkedDocumentBytes = 0;
  for (const url of urls) {
    const remainingBytes =
      maxLinkedDocumentBytes - retainedLinkedDocumentBytes;
    if (remainingBytes <= 0) {
      throw new SourceFetchError(
        `Linked policy documents exceed the ${maxLinkedDocumentBytes} byte aggregate limit`,
        { retryable: false },
      );
    }
    const linked = await retrieveSource(url, {
      ...options,
      attempts: 1,
      maxResponseBytes: Math.min(
        options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
        remainingBytes,
      ),
      destinationPolicy: isAllowedSourceHost(url)
        ? 'official'
        : 'public-https',
      hashLinkedDocuments: false,
    });
    assertLinkedDocumentBytes(linked, url);
    if (!linked.evidence.contentHash) {
      throw new SourceFetchError(
        `Linked policy document ${url} did not produce a content hash`,
        { retryable: false },
      );
    }
    retainedLinkedDocumentBytes += linked.bytes?.byteLength ?? 0;
    if (retainedLinkedDocumentBytes > maxLinkedDocumentBytes) {
      throw new SourceFetchError(
        `Linked policy documents exceed the ${maxLinkedDocumentBytes} byte aggregate limit`,
        { retryable: false },
      );
    }
    linkedResults.push({
      source: linked,
      evidence: {
        url,
        finalUrl: linked.evidence.finalUrl,
        retrievedAt: linked.evidence.retrievedAt,
        contentType: linked.evidence.contentType,
        contentHash: linked.evidence.contentHash,
        etag: linked.evidence.etag,
        lastModified: linked.evidence.lastModified,
      },
    });
  }
  const linkedDocuments = linkedResults.map((result) => result.evidence);
  const pageHash = retrieved.evidence.contentHash;
  if (!pageHash) {
    throw new SourceFetchError(
      'HTML source did not produce a page content hash',
      { retryable: false },
    );
  }
  const contentHash = createHash('sha256')
    .update(
      JSON.stringify({
        pageHash,
        linkedDocuments: linkedDocuments.map(({ url, contentHash }) => ({
          url,
          contentHash,
        })),
      }),
    )
    .digest('hex');

  return {
    ...retrieved,
    linkedSources: linkedResults.map((result) => result.source),
    evidence: {
      ...retrieved.evidence,
      contentHash,
      linkedDocuments,
    },
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function assertUsableSource(body: string, contentType: string): void {
  if (!isHtmlPayload(body, contentType)) return;
  const normalized = body.toLowerCase();
  const challengeSignals = [
    'awswafintegration',
    'verify that you&#39;re not a robot',
    "verify that you're not a robot",
    'checking your browser before accessing',
    'cf-chl-',
  ];
  if (challengeSignals.some((signal) => normalized.includes(signal))) {
    throw new SourceFetchError(
      'Received a bot-challenge page instead of source content',
      { retryable: false },
    );
  }
}

async function defaultSleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function headerValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizedAddress(address: string): string {
  return address.toLowerCase().startsWith('::ffff:')
    ? address.slice('::ffff:'.length)
    : address;
}

function assertContentLengthWithinLimit(
  value: string | string[] | undefined,
  maxResponseBytes: number,
): void {
  const header = headerValue(value);
  if (!header) return;
  const length = Number(header);
  if (
    Number.isFinite(length) &&
    length > maxResponseBytes
  ) {
    throw new SourceFetchError(
      `Source response exceeds ${maxResponseBytes} byte limit`,
      { retryable: false },
    );
  }
}

async function readResponseBytes(
  response: Response,
  maxResponseBytes: number,
): Promise<Buffer> {
  assertContentLengthWithinLimit(
    response.headers.get('content-length') ?? undefined,
    maxResponseBytes,
  );
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxResponseBytes) {
        await reader.cancel();
        throw new SourceFetchError(
          `Source response exceeds ${maxResponseBytes} byte limit`,
          { retryable: false },
        );
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, received);
}

export function assertExpectedSourceDestination(
  requestedUrl: string,
  retrieved: RetrievedSource,
): void {
  const requested = new URL(requestedUrl);
  const finalUrl = new URL(
    retrieved.evidence.finalUrl ?? requestedUrl,
  );
	if (sourceUrlsEqual(requestedUrl, finalUrl.toString())) return;
	const homepagePaths = new Set([
		'/',
		'/default',
		'/default.aspx',
		'/home',
		'/index',
		'/index.htm',
		'/index.html',
		'/welcome',
	]);
	const normalizedFinalPath =
		finalUrl.pathname.toLowerCase().replace(/\/+$/, '') || '/';
	if (!homepagePaths.has(normalizedFinalPath)) return;

  const meaningfulSelectorKeys = new Set([
    'attachment',
    'doc',
    'document',
    'download',
    'file',
    'id',
    'item',
    'nid',
    'node',
    'p',
    'page_id',
    'policy',
    'publication',
    'record',
    'resource',
  ]);
  const hasMeaningfulFinalSelector = Array.from(
    finalUrl.searchParams.entries(),
  ).some(
    ([key, value]) =>
      meaningfulSelectorKeys.has(key.toLowerCase()) && value.trim().length > 0,
  );
  const preservesRequestedRootSelector = Array.from(
    requested.searchParams.entries(),
  ).some(([key, value]) => finalUrl.searchParams.getAll(key).includes(value));
  const lostDocumentIdentity =
    requested.pathname !== '/'
      ? !hasMeaningfulFinalSelector
      : requested.search.length > 0 && !preservesRequestedRootSelector;
  if (lostDocumentIdentity) {
    throw new SourceFetchError(
      `Source redirected from ${requested.pathname}${requested.search} to the site homepage`,
      { retryable: false, code: 'destination_mismatch' },
    );
  }
}

export async function retrieveSourceOverHttp1(
  url: string,
  options: {
    now: () => Date;
    timeoutMs: number;
    redirects?: number;
    originalUrl?: string;
    resolveHost?: (hostname: string) => Promise<string[]>;
    destinationPolicy?: 'official' | 'public-https';
    maxResponseBytes?: number;
    deadlineAt?: number;
    startedAt?: number;
    requestImpl?: typeof https.get;
  },
): Promise<RetrievedSource> {
  const redirects = options.redirects ?? 0;
  const originalUrl = options.originalUrl ?? url;
  if (redirects > MAX_REDIRECTS) {
    throw new SourceFetchError('Too many redirects');
  }
  const startedAt = options.startedAt ?? Date.now();
  const deadlineAt =
    options.deadlineAt ?? startedAt + options.timeoutMs;
  const addresses = await withinRetrievalDeadline(
    assertSafeSourceUrl(
      url,
      options.resolveHost ?? resolveHostAddresses,
      options.destinationPolicy,
    ),
    deadlineAt,
    options.timeoutMs,
  );
  if (addresses.length === 0) {
    throw new SourceFetchError('Source host did not resolve to a usable address', {
      retryable: true,
    });
  }
  const maxResponseBytes =
    options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const parsed = new URL(url);
  const requestImpl = options.requestImpl ?? https.get;

  const attemptAddress = (
    pinnedAddress: string,
    addressTimeoutMs: number,
  ) => new Promise<RetrievedSource>((resolve, reject) => {
    const attemptDeadlineMs = Math.max(
      1,
      Math.min(addressTimeoutMs, deadlineAt - Date.now()),
    );
    let settled = false;
    const finish = <T>(
      callback: (value: T) => void,
      value: T,
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(totalTimer);
      callback(value);
    };
    const fail = (error: unknown) =>
      finish(
        reject,
        error instanceof SourceFetchError
          ? error
          : new SourceFetchError(errorMessage(error), {
              retryable: true,
              cause: error,
            }),
      );

    const request = requestImpl(
      parsed,
      {
        family: isIP(pinnedAddress),
        lookup: (_hostname, _lookupOptions, callback) => {
          callback(null, pinnedAddress, isIP(pinnedAddress));
        },
        headers: {
          'User-Agent': COLLECTOR_USER_AGENT,
          Accept:
            'text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml;q=0.9,application/pdf;q=0.8,*/*;q=0.5',
          'Accept-Language': 'en-AU,en;q=0.9',
        },
      },
      (response) => {
        try {
          const status = response.statusCode ?? 0;
			const location = headerValue(response.headers.location);
			if (status >= 300 && status < 400 && location) {
				const redirectUrl = new URL(location, url).toString();
				response.destroy();
				clearTimeout(totalTimer);
				settled = true;
				void retrieveSourceOverHttp1(
					redirectUrl,
              {
                ...options,
                redirects: redirects + 1,
                originalUrl,
                resolveHost: options.resolveHost,
                destinationPolicy: options.destinationPolicy,
                maxResponseBytes,
                deadlineAt,
                startedAt,
                requestImpl: options.requestImpl,
              },
            ).then(resolve, reject);
            return;
          }
          if (status < 200 || status >= 300) {
            response.destroy();
            fail(
              new SourceFetchError(`HTTP ${status}`, {
                status,
                retryable: isRetryableStatus(status),
              }),
            );
            return;
          }

          assertContentLengthWithinLimit(
            response.headers['content-length'],
            maxResponseBytes,
          );
          const chunks: Buffer[] = [];
          let received = 0;
          response.on('error', fail);
          response.on('data', (chunk: Buffer | string) => {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            received += buffer.length;
            if (received > maxResponseBytes) {
              response.destroy(
                new SourceFetchError(
                  `Source response exceeds ${maxResponseBytes} byte limit`,
                  { retryable: false },
                ),
              );
              return;
            }
            chunks.push(buffer);
          });
          response.on('end', () => {
            try {
              const bodyBuffer = Buffer.concat(chunks, received);
              const contentType =
                headerValue(response.headers['content-type'])
                  ?.split(';')[0]
                  ?.trim() || 'application/octet-stream';
              const normalizedContentType = contentType.toLowerCase();
              const binaryDocument = shouldRetainBinaryBytes(
                bodyBuffer,
                normalizedContentType,
              );
              const body = binaryDocument ? '' : bodyBuffer.toString('utf8');
              assertUsableSource(body, normalizedContentType);
              const result: RetrievedSource = {
                body,
                bytes: binaryDocument ? bodyBuffer : undefined,
                durationMs: Date.now() - startedAt,
                evidence: {
                  url: canonicalizeSourceUrl(originalUrl),
                  finalUrl: canonicalizeSourceUrl(url),
                  retrievedAt: options.now().toISOString(),
                  contentType: normalizedContentType,
                  contentHash: stableHashContent(
                    bodyBuffer,
                    normalizedContentType,
                    url,
                  ),
                  etag: headerValue(response.headers.etag),
                  lastModified: headerValue(
                    response.headers['last-modified'],
                  ),
                },
              };
              assertExpectedSourceDestination(originalUrl, result);
              finish(resolve, result);
            } catch (error) {
              fail(error);
            }
          });
        } catch (error) {
          response.destroy();
          fail(error);
        }
      },
    );

    request.on('socket', (socket) => {
      socket.once('secureConnect', () => {
        const remoteAddress = socket.remoteAddress;
        if (
          !remoteAddress ||
          normalizedAddress(remoteAddress) !==
            normalizedAddress(pinnedAddress) ||
          isBlockedAddress(remoteAddress)
        ) {
          request.destroy(
            new SourceFetchError(
              'Connected socket address did not match validated DNS results',
              { retryable: false },
            ),
          );
        }
      });
    });
    request.setTimeout(addressTimeoutMs, () => {
      request.destroy(
        new SourceFetchError(`Timed out after ${options.timeoutMs}ms`, {
          retryable: true,
        }),
      );
    });
    const totalTimer = setTimeout(() => {
      request.destroy(
        new SourceFetchError(`Timed out after ${options.timeoutMs}ms`, {
          retryable: true,
        }),
      );
    }, attemptDeadlineMs);
    request.on('error', fail);
  });

  let lastError: SourceFetchError | null = null;
  for (let index = 0; index < addresses.length; index++) {
    const attemptRemainingMs = deadlineAt - Date.now();
    if (attemptRemainingMs <= 0) break;
    const addressesRemaining = addresses.length - index;
    const addressTimeoutMs = Math.max(
      1,
      Math.min(
        options.timeoutMs,
        Math.floor(attemptRemainingMs / addressesRemaining),
      ),
    );
    try {
      return await attemptAddress(addresses[index], addressTimeoutMs);
    } catch (error) {
      lastError =
        error instanceof SourceFetchError
          ? error
          : new SourceFetchError(errorMessage(error), {
              retryable: true,
              cause: error,
            });
      if (!lastError.retryable) {
        throw lastError;
      }
    }
  }

  throw (
    lastError ??
    new SourceFetchError(`Timed out after ${options.timeoutMs}ms`, {
      retryable: true,
    })
  );
}

export async function retrieveSource(
  url: string,
  options: RetrieveSourceOptions = {},
): Promise<RetrievedSource> {
  const fetchImpl = options.fetchImpl;
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxResponseBytes =
    options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const attempts = Math.max(1, options.attempts ?? DEFAULT_ATTEMPTS);
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const sleep = options.sleep ?? defaultSleep;
  const networkRetriever =
    options.http1Fallback ??
    ((fallbackUrl, fallbackOptions) =>
      retrieveSourceOverHttp1(fallbackUrl, fallbackOptions));
  const resolveHost =
    options.resolveHost ??
    (fetchImpl === undefined ? resolveHostAddresses : undefined);
  const destinationPolicy = options.destinationPolicy ?? 'official';
  let lastError: SourceFetchError | null = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const startedAt = Date.now();
    const deadlineAt = startedAt + timeoutMs;
    try {
      if (!fetchImpl) {
        const retrieved = await networkRetriever(url, {
          now,
          timeoutMs,
          maxResponseBytes,
          resolveHost,
          destinationPolicy,
          deadlineAt,
          startedAt,
        });
        return await addLinkedDocumentEvidence(retrieved, url, options);
      }

      let currentUrl = url;
      let response: Response;
      let redirectCount = 0;
      const deadlineSignal = AbortSignal.timeout(
        Math.max(1, deadlineAt - Date.now()),
      );
      while (true) {
        await withinRetrievalDeadline(
          assertSafeSourceUrl(
            currentUrl,
            resolveHost,
            destinationPolicy,
          ),
          deadlineAt,
          timeoutMs,
        );
        response = await fetchImpl(currentUrl, {
          headers: {
            'User-Agent': COLLECTOR_USER_AGENT,
            Accept:
              'text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml;q=0.9,application/pdf;q=0.8,*/*;q=0.5',
            'Accept-Language': 'en-AU,en;q=0.9',
          },
          redirect: 'manual',
          signal: deadlineSignal,
        });
        const location = response.headers.get('location');
        if (
          response.status >= 300 &&
          response.status < 400 &&
          location
        ) {
          if (redirectCount >= MAX_REDIRECTS) {
            throw new SourceFetchError('Too many redirects', {
              retryable: false,
            });
          }
          await response.body?.cancel();
          currentUrl = new URL(location, currentUrl).toString();
          redirectCount++;
          continue;
        }
        break;
      }

      if (!response.ok) {
        throw new SourceFetchError(`HTTP ${response.status}`, {
          status: response.status,
          retryable: isRetryableStatus(response.status),
        });
      }

      const finalUrl = response.url || currentUrl;
      await withinRetrievalDeadline(
        assertSafeSourceUrl(finalUrl, resolveHost, destinationPolicy),
        deadlineAt,
        timeoutMs,
      );
      const contentType =
        response.headers.get('content-type')?.split(';')[0]?.trim() ||
        'application/octet-stream';
      const normalizedContentType = contentType.toLowerCase();
      const bodyBuffer = await readResponseBytes(
        response,
        maxResponseBytes,
      );
      const binaryDocument = shouldRetainBinaryBytes(
        bodyBuffer,
        normalizedContentType,
      );
      const body = binaryDocument ? '' : bodyBuffer.toString('utf8');
      assertUsableSource(body, normalizedContentType);
      const retrievedAt = now().toISOString();

      const result: RetrievedSource = {
        body,
        bytes: binaryDocument ? bodyBuffer : undefined,
        durationMs: Date.now() - startedAt,
        evidence: {
          url: canonicalizeSourceUrl(url),
          finalUrl: canonicalizeSourceUrl(finalUrl),
          retrievedAt,
          contentType: normalizedContentType,
          contentHash: stableHashContent(
            bodyBuffer,
            normalizedContentType,
            finalUrl,
          ),
          etag: response.headers.get('etag') || undefined,
          lastModified: response.headers.get('last-modified') || undefined,
        },
      };
      assertExpectedSourceDestination(url, result);
      return await addLinkedDocumentEvidence(result, url, options);
    } catch (error) {
      lastError =
        error instanceof SourceFetchError
          ? error
          : new SourceFetchError(errorMessage(error), {
              retryable: true,
              cause: error,
            });

      if (!lastError.retryable || attempt === attempts) {
        throw lastError;
      }
      if (retryDelayMs > 0) {
        await sleep(retryDelayMs * attempt);
      }
    }
  }

  throw lastError ?? new SourceFetchError('Unknown source retrieval failure');
}
