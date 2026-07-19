/* @vitest-environment node */

import { describe, expect, it } from 'vitest';
import {
  extractPdfDocument,
  extractRetrievedDocument,
} from './content';

function buildTextPdf(text: string): Uint8Array {
  const stream = `BT\n/F1 18 Tf\n72 720 Td\n(${text}) Tj\nET`;
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += object;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf));
}

function buildStoredDocx(text: string): Uint8Array {
  const entries = [
    {
      name: '[Content_Types].xml',
      data: Buffer.from('<Types></Types>'),
    },
    {
      name: 'word/document.xml',
      data: Buffer.from(
        `<w:document><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
      ),
    },
  ];
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt32LE(entry.data.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localParts.push(localHeader, name, entry.data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt32LE(entry.data.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, name);
    localOffset += localHeader.length + name.length + entry.data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(localOffset, 16);
  return new Uint8Array(
    Buffer.concat([...localParts, centralDirectory, eocd]),
  );
}

describe('PDF content extraction', () => {
  it('extracts readable text and a title from an official-style PDF', async () => {
    const result = await extractPdfDocument(
      buildTextPdf('AI Assurance Framework'),
      'https://example.gov.au/ai-assurance-framework.pdf',
      'Fallback title',
    );

    expect(result.text).toContain('AI Assurance Framework');
    expect(result.title).toBe('AI Assurance Framework');
  });

  it('detects PDF bytes even when the server uses a generic content type', async () => {
    const bytes = buildTextPdf('AI Policy PDF');
    const result = await extractRetrievedDocument(
      {
        body: Buffer.from(bytes).toString('utf8'),
        bytes,
        durationMs: 1,
        evidence: {
          url: 'https://example.gov.au/download',
          contentType: 'application/octet-stream',
        },
      },
      'https://example.gov.au/download',
      'Fallback title',
    );

    expect(result.text).toContain('AI Policy PDF');
  });

  it('detects extensionless DOCX bytes served with a generic content type', async () => {
    const bytes = buildStoredDocx('AI procurement assurance standard');
    const result = await extractRetrievedDocument(
      {
        body: Buffer.from(bytes).toString('utf8'),
        bytes,
        durationMs: 1,
        evidence: {
          url: 'https://example.gov.au/media/123/download',
          contentType: 'application/octet-stream',
        },
      },
      'https://example.gov.au/media/123/download',
      'Fallback title',
    );

    expect(result.text).toContain('AI procurement assurance standard');
  });

  it('treats a PDF URL as a PDF when the content type is missing', async () => {
    await expect(
      extractRetrievedDocument(
        {
          body: '%PDF-broken',
          bytes: Uint8Array.from(Buffer.from('%PDF-broken')),
          durationMs: 1,
          evidence: {
            url: 'https://example.gov.au/policy.pdf',
          },
        },
        'https://example.gov.au/policy.pdf',
        'Fallback title',
      ),
    ).rejects.toThrow();
  });

  it('rejects malformed DOCX responses before HTML extraction', async () => {
    await expect(
      extractRetrievedDocument(
        {
          body: 'PK binary payload that is long enough to look readable',
          bytes: Uint8Array.from(
            Buffer.from('PK binary payload that is long enough to look readable'),
          ),
          durationMs: 1,
          evidence: {
            url: 'https://example.gov.au/policy.docx',
            contentType:
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          },
        },
        'https://example.gov.au/policy.docx',
        'Fallback title',
      ),
    ).rejects.toThrow('DOCX central directory is missing');
  });

  it('rejects empty HTML shells as unreadable documents', async () => {
    await expect(
      extractRetrievedDocument(
        {
          body: '<html><head><title>Loading</title></head><body></body></html>',
          durationMs: 1,
          evidence: {
            url: 'https://example.gov.au/empty-policy',
            contentType: 'text/html',
          },
        },
        'https://example.gov.au/empty-policy',
        'Fallback title',
      ),
    ).rejects.toThrow('no readable document text');
  });

  it('does not treat navigation and footer chrome as readable policy content', async () => {
    await expect(
      extractRetrievedDocument(
        {
          body: `<html><body>
            <header><nav>Government services and extensive navigation links</nav></header>
            <main><div aria-live="polite"></div></main>
            <footer>Copyright, accessibility, privacy, contact, and site information</footer>
          </body></html>`,
          durationMs: 1,
          evidence: {
            url: 'https://example.gov.au/empty-policy',
            contentType: 'text/html',
          },
        },
        'https://example.gov.au/empty-policy',
        'Fallback title',
      ),
    ).rejects.toThrow('no readable document text');
  });

  it('extracts linked instrument bytes together with a landing page', async () => {
    const bytes = buildTextPdf('Binding AI procurement standard');
    const result = await extractRetrievedDocument(
      {
        body: '<html><body><main><h1>AI procurement</h1><p>Official landing page for the policy instrument.</p></main></body></html>',
        durationMs: 1,
        evidence: {
          url: 'https://example.gov.au/ai-procurement',
          contentType: 'text/html',
        },
        linkedSources: [{
          body: Buffer.from(bytes).toString('utf8'),
          bytes,
          durationMs: 1,
          evidence: {
            url: 'https://example.gov.au/ai-procurement.pdf',
            contentType: 'application/pdf',
          },
        }],
      },
      'https://example.gov.au/ai-procurement',
      'Fallback title',
    );

    expect(result.text).toContain('Official landing page');
    expect(result.text).toContain('Binding AI procurement standard');
  });

  it('keeps every linked instrument inside the classification excerpt', async () => {
    const firstBytes = buildTextPdf(
      'Mandatory AI impact assessments for every high-risk system.',
    );
    const secondBytes = buildTextPdf(
      'Binding independent assurance requirements for automated decisions.',
    );
    const result = await extractRetrievedDocument(
      {
        body: `<html><body><main><h1>Publications</h1><p>${'Generic landing-page material. '.repeat(500)}</p></main></body></html>`,
        durationMs: 1,
        evidence: {
          url: 'https://example.gov.au/publications/ai-governance',
          contentType: 'text/html',
        },
        linkedSources: [
          {
            body: Buffer.from(firstBytes).toString('utf8'),
            bytes: firstBytes,
            durationMs: 1,
            evidence: {
              url: 'https://example.gov.au/files/impact-assessment.pdf',
              contentType: 'application/pdf',
            },
          },
          {
            body: Buffer.from(secondBytes).toString('utf8'),
            bytes: secondBytes,
            durationMs: 1,
            evidence: {
              url: 'https://example.gov.au/files/assurance-standard.pdf',
              contentType: 'application/pdf',
            },
          },
        ],
      },
      'https://example.gov.au/publications/ai-governance',
      'Fallback title',
    );

    const classificationExcerpt = result.text.slice(0, 4_000);
    expect(classificationExcerpt).toContain('Mandatory AI impact assessments');
    expect(classificationExcerpt).toContain(
      'Binding independent assurance requirements',
    );
  });

  it('rejects a readable landing page when its linked PDF is corrupt', async () => {
    const bytes = Uint8Array.from(Buffer.from('%PDF-1.4\nnot a document'));
    await expect(
      extractRetrievedDocument(
        {
          body: '<html><body><main><h1>AI policy</h1><p>This landing page is readable and otherwise valid.</p></main></body></html>',
          durationMs: 1,
          evidence: {
            url: 'https://example.gov.au/ai-policy',
            contentType: 'text/html',
          },
          linkedSources: [{
            body: Buffer.from(bytes).toString('utf8'),
            bytes,
            durationMs: 1,
            evidence: {
              url: 'https://example.gov.au/ai-policy.pdf',
              contentType: 'application/pdf',
            },
          }],
        },
        'https://example.gov.au/ai-policy',
        'Fallback title',
      ),
    ).rejects.toThrow();
  });
});
