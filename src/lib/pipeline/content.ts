import {
  extractDocumentCandidate,
  extractSemanticDocumentText,
} from './extract';
import { inflateRawSync } from 'node:zlib';
import { Worker } from 'node:worker_threads';
import {
  documentKindFromBytes,
  type RetrievedSource,
} from './fetch';
import type { DatePrecision } from '@/types';

const MAX_PDF_PAGES = 300;
const MAX_EXTRACTED_CHARACTERS = 200_000;
const CLASSIFICATION_EXCERPT_CHARACTERS = 4_000;
const MIN_READABLE_HTML_CHARACTERS = 20;
const MAX_DOCX_XML_BYTES = 4 * 1024 * 1024;
const PDF_EXTRACTION_TIMEOUT_MS = 15_000;
const PDF_WORKER_MAX_OLD_GENERATION_MB = 96;
const PDF_WORKER_SOURCE = String.raw`
const { parentPort, workerData } = require('node:worker_threads');

function normalizePdfText(value) {
  return value
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

(async () => {
  let pdf;
  try {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = getDocument({
      data: new Uint8Array(workerData.bytes),
      isEvalSupported: false,
      useSystemFonts: true,
      stopAtErrors: true,
    });
    pdf = await loadingTask.promise;
    const metadata = await pdf.getMetadata().catch(() => null);
    const metadataTitle =
      typeof metadata?.info?.Title === 'string'
        ? metadata.info.Title.trim()
        : '';
    const pages = [];
    let characterCount = 0;
    const pageLimit = Math.min(pdf.numPages, workerData.maxPages);
    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        let pageText = '';
        for (const item of content.items) {
          if (!('str' in item)) continue;
          pageText += item.str;
          pageText += item.hasEOL ? '\n' : ' ';
          if (pageText.length >= workerData.maxCharacters) break;
        }
        const normalizedPage = normalizePdfText(pageText);
        if (normalizedPage) {
          pages.push(normalizedPage);
          characterCount += normalizedPage.length;
        }
      } finally {
        page.cleanup();
      }
      if (characterCount >= workerData.maxCharacters) break;
    }
    const text = normalizePdfText(pages.join('\n\n')).slice(
      0,
      workerData.maxCharacters,
    );
    await pdf.destroy();
    pdf = undefined;
    parentPort.postMessage({ ok: true, metadataTitle, text });
  } catch (error) {
    if (pdf) await pdf.destroy().catch(() => undefined);
    parentPort.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
})().catch((error) => {
  parentPort.postMessage({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  });
});
`;

export interface ExtractedDocument {
  title: string;
  text: string;
  publishedAt?: string;
  publishedAtPrecision?: DatePrecision;
}

function buildBalancedClassificationExcerpt(
  documents: ExtractedDocument[],
): string {
  const markers = documents.map(
    (document, index) =>
      `[Document ${index + 1}: ${document.title.slice(0, 120)}]\n`,
  );
  const contentBudget = Math.max(
    0,
    CLASSIFICATION_EXCERPT_CHARACTERS -
      markers.reduce((total, marker) => total + marker.length + 2, 0),
  );
  const perDocumentBudget = Math.floor(contentBudget / documents.length);
  return documents
    .map(
      (document, index) =>
        `${markers[index]}${document.text.slice(0, perDocumentBudget)}`,
    )
    .join('\n\n')
    .slice(0, CLASSIFICATION_EXCERPT_CHARACTERS);
}

function titleFromUrl(url: string, fallbackTitle: string): string {
  try {
    const filename = decodeURIComponent(
      new URL(url).pathname.split('/').filter(Boolean).at(-1) ?? '',
    )
      .replace(/\.(?:pdf|docx?|rtf)$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim();
    return filename || fallbackTitle;
  } catch {
    return fallbackTitle;
  }
}

function decodeXmlEntities(value: string): string {
  return value.replace(
    /&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi,
    (entity) => {
      const named: Record<string, string> = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&apos;': "'",
      };
      const normalized = entity.toLowerCase();
      if (named[normalized]) return named[normalized];
      const hexadecimal = normalized.startsWith('&#x');
      const numeric = Number.parseInt(
        normalized.slice(hexadecimal ? 3 : 2, -1),
        hexadecimal ? 16 : 10,
      );
      return Number.isFinite(numeric)
        ? String.fromCodePoint(numeric)
        : entity;
    },
  );
}

function docxDocumentXml(bytes: Uint8Array): string {
  const archive = Buffer.from(bytes);
  if (archive.length < 22) {
    throw new Error('DOCX central directory is missing');
  }
  const minimumEocdOffset = Math.max(0, archive.length - 65_557);
  let eocdOffset = -1;
  for (let offset = archive.length - 22; offset >= minimumEocdOffset; offset--) {
    if (archive.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error('DOCX central directory is missing');

  const entryCount = archive.readUInt16LE(eocdOffset + 10);
  let offset = archive.readUInt32LE(eocdOffset + 16);
  for (let index = 0; index < entryCount; index++) {
    if (
      offset + 46 > archive.length ||
      archive.readUInt32LE(offset) !== 0x02014b50
    ) {
      throw new Error('DOCX central directory is malformed');
    }
    const flags = archive.readUInt16LE(offset + 8);
    const method = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const filenameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localHeaderOffset = archive.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + filenameLength;
    if (nameEnd > archive.length) {
      throw new Error('DOCX entry name is truncated');
    }
    const filename = archive.subarray(nameStart, nameEnd).toString('utf8');
    offset = nameEnd + extraLength + commentLength;
    if (filename !== 'word/document.xml') continue;
    if ((flags & 0x1) !== 0) throw new Error('Encrypted DOCX is unsupported');
    if (uncompressedSize > MAX_DOCX_XML_BYTES) {
      throw new Error('DOCX document XML exceeds the extraction limit');
    }
    if (
      localHeaderOffset + 30 > archive.length ||
      archive.readUInt32LE(localHeaderOffset) !== 0x04034b50
    ) {
      throw new Error('DOCX document entry is malformed');
    }
    const localNameLength = archive.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = archive.readUInt16LE(localHeaderOffset + 28);
    const dataStart =
      localHeaderOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > archive.length) {
      throw new Error('DOCX document entry is truncated');
    }
    const compressed = archive.subarray(dataStart, dataEnd);
    const xml = method === 0
      ? compressed
      : method === 8
        ? inflateRawSync(compressed, {
            maxOutputLength: MAX_DOCX_XML_BYTES,
          })
        : null;
    if (!xml) throw new Error(`Unsupported DOCX compression method ${method}`);
    return xml.toString('utf8');
  }
  throw new Error('DOCX does not contain word/document.xml');
}

function normalizeDocxText(xml: string): string {
  return decodeXmlEntities(
    xml
      .replace(/<w:tab\b[^>]*\/?\s*>/gi, '\t')
      .replace(/<w:(?:br|cr)\b[^>]*\/?\s*>/gi, '\n')
      .replace(/<\/w:(?:p|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function extractDocxDocument(
  bytes: Uint8Array,
  url: string,
  fallbackTitle: string,
): ExtractedDocument {
  const text = normalizeDocxText(docxDocumentXml(bytes)).slice(
    0,
    MAX_EXTRACTED_CHARACTERS,
  );
  if (!text) {
    throw new Error(
      'DOCX contains no extractable text; manual review is required',
    );
  }
  const firstLine = text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length >= 4 && line.length <= 240);
  return {
    title: firstLine || titleFromUrl(url, fallbackTitle),
    text,
  };
}

function normalizePdfText(value: string): string {
  return value
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

interface PdfWorkerResult {
  metadataTitle: string;
  text: string;
}

function extractPdfInWorker(bytes: Uint8Array): Promise<PdfWorkerResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(PDF_WORKER_SOURCE, {
      eval: true,
      workerData: {
        bytes: Uint8Array.from(bytes),
        maxPages: MAX_PDF_PAGES,
        maxCharacters: MAX_EXTRACTED_CHARACTERS,
      },
      resourceLimits: {
        maxOldGenerationSizeMb: PDF_WORKER_MAX_OLD_GENERATION_MB,
        maxYoungGenerationSizeMb: 24,
        codeRangeSizeMb: 16,
        stackSizeMb: 4,
      },
    });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      void worker.terminate();
      reject(
        new Error(
          `PDF extraction exceeded the ${PDF_EXTRACTION_TIMEOUT_MS}ms isolated-worker limit`,
        ),
      );
    }, PDF_EXTRACTION_TIMEOUT_MS);
    const finish = (
      callback: () => void,
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      callback();
    };
    worker.once('message', (message: unknown) => {
      finish(() => {
        if (
          message &&
          typeof message === 'object' &&
          'ok' in message &&
          message.ok === true &&
          'metadataTitle' in message &&
          typeof message.metadataTitle === 'string' &&
          'text' in message &&
          typeof message.text === 'string'
        ) {
          resolve({
            metadataTitle: message.metadataTitle,
            text: message.text,
          });
          return;
        }
        const detail =
          message &&
          typeof message === 'object' &&
          'error' in message &&
          typeof message.error === 'string'
            ? message.error
            : 'PDF worker returned an invalid result';
        reject(new Error(detail));
      });
    });
    worker.once('error', (error) => {
      finish(() => reject(error));
    });
    worker.once('exit', (code) => {
      if (settled) return;
      finish(() =>
        reject(
          new Error(
            `PDF extraction worker exited before producing a result (code ${code})`,
          ),
        ),
      );
    });
  });
}

export async function extractPdfDocument(
  bytes: Uint8Array,
  url: string,
  fallbackTitle: string,
): Promise<ExtractedDocument> {
  const extracted = await extractPdfInWorker(bytes);
  const text = normalizePdfText(extracted.text).slice(
    0,
    MAX_EXTRACTED_CHARACTERS,
  );
  if (!text) {
    throw new Error(
      'PDF contains no extractable text; OCR or manual transcription is required',
    );
  }
  const firstLine =
    text
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length >= 4 && line.length <= 240) ?? '';
  return {
    title:
      extracted.metadataTitle ||
      firstLine ||
      titleFromUrl(url, fallbackTitle),
    text,
  };
}

async function extractSingleRetrievedDocument(
  retrieved: RetrievedSource,
  url: string,
  fallbackTitle: string,
): Promise<ExtractedDocument> {
  const contentType = retrieved.evidence.contentType?.toLowerCase() ?? '';
  const finalUrl = retrieved.evidence.finalUrl ?? url;
  const byteKind = retrieved.bytes
    ? documentKindFromBytes(retrieved.bytes)
    : null;
  const isPdf =
    contentType.includes('pdf') ||
    /\.pdf(?:$|[?#])/i.test(finalUrl) ||
    byteKind === 'pdf';

  const isDocx =
    contentType.includes(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ) || /\.docx(?:$|[?#])/i.test(finalUrl) || byteKind === 'docx';
  const isLegacyWord =
    contentType.includes('application/msword') ||
    /\.doc(?:$|[?#])/i.test(finalUrl) || byteKind === 'doc';
  const isRtf =
    contentType.includes('rtf') ||
    /\.rtf(?:$|[?#])/i.test(finalUrl) || byteKind === 'rtf';

  if (isPdf) {
    if (!retrieved.bytes) {
      throw new Error('PDF retrieval did not retain the original document bytes');
    }
    return extractPdfDocument(retrieved.bytes, url, fallbackTitle);
  }

  if (isDocx) {
    if (!retrieved.bytes) {
      throw new Error('DOCX retrieval did not retain the original document bytes');
    }
    return extractDocxDocument(retrieved.bytes, url, fallbackTitle);
  }

  if (isLegacyWord || isRtf) {
    throw new Error(
      `${isRtf ? 'RTF' : 'Legacy Word'} extraction requires manual review or a verified transcription`,
    );
  }

  const normalizedBody = retrieved.body.replace(/^\uFEFF/, '').trimStart();
  const hasHtmlMarkup =
    /^(?:<!doctype\s+html\b|<html\b|<head\b|<body\b|<main\b|<article\b)/i.test(
      normalizedBody,
    );
  const isSupportedText =
    contentType === 'text/html' ||
    contentType === 'application/xhtml+xml' ||
    contentType === 'text/plain' ||
    contentType === 'text/xml' ||
    contentType === 'application/xml';
  if (!isSupportedText && !hasHtmlMarkup) {
    throw new Error(
      `Unsupported source content type ${contentType || 'unknown'}; only HTML, plain text, XML, and text-bearing PDFs can be extracted`,
    );
  }

  const candidate = extractDocumentCandidate(
    retrieved.body,
    url,
    fallbackTitle,
  );
  const text = extractSemanticDocumentText(retrieved.body).slice(
    0,
    MAX_EXTRACTED_CHARACTERS,
  );
  if (text.length < MIN_READABLE_HTML_CHARACTERS) {
    throw new Error(
      'HTML source contains no readable document text',
    );
  }
  return {
    title: candidate.title,
    text,
    publishedAt: candidate.dateHint,
    publishedAtPrecision: candidate.dateHintPrecision,
  };
}

export async function extractRetrievedDocument(
  retrieved: RetrievedSource,
  url: string,
  fallbackTitle: string,
): Promise<ExtractedDocument> {
  const linkedSources = retrieved.linkedSources ?? [];
  if (linkedSources.length === 0) {
    return extractSingleRetrievedDocument(retrieved, url, fallbackTitle);
  }

  // Every attachment must be readable. A valid landing page must not make a
  // corrupt, scanned, or unsupported canonical instrument look healthy.
  const linkedDocuments: ExtractedDocument[] = [];
  for (const source of linkedSources) {
    const linkedUrl = source.evidence.finalUrl ?? source.evidence.url;
    linkedDocuments.push(
      await extractSingleRetrievedDocument(
        source,
        linkedUrl,
        titleFromUrl(linkedUrl, fallbackTitle),
      ),
    );
  }

  let primary: ExtractedDocument | null = null;
  try {
    primary = await extractSingleRetrievedDocument(
      retrieved,
      url,
      fallbackTitle,
    );
  } catch {
    // An attachment may be the complete document behind a minimal landing
    // shell. Its successful extraction is sufficient; attachment failures
    // above are never ignored.
  }
  const documents = primary
    ? [primary, ...linkedDocuments]
    : linkedDocuments;
  const classificationExcerpt = buildBalancedClassificationExcerpt(documents);
  const fullText = [
    ...linkedDocuments.map((document) => document.text),
    ...(primary ? [primary.text] : []),
  ].join('\n\n');
  return {
    title: primary?.title ?? linkedDocuments[0].title,
    // Keep a balanced prefix for the 4,000-character relevance prompt so a
    // long landing shell cannot crowd any linked canonical instrument out of
    // classification. The complete instrument-first text follows for review.
    text: `${classificationExcerpt}\n\n${fullText}`.slice(
      0,
      MAX_EXTRACTED_CHARACTERS,
    ),
    publishedAt: primary?.publishedAt,
    publishedAtPrecision: primary?.publishedAtPrecision,
  };
}
