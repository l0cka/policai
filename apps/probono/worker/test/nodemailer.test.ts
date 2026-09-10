import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nodemailer from 'nodemailer';
import { describe, expect, it } from 'vitest';
import { renderDigest } from '../src/lib/render-digest.js';

// Compile messages in memory only: never connect to SMTP or send a digest.
describe('Nodemailer dependency boundary', () => {
  it('honours disableFileAccess for message-level raw content', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'probono-mail-'));
    const path = join(directory, 'raw.eml');
    const transport = nodemailer.createTransport({
      streamTransport: true, buffer: true, disableFileAccess: true,
    });
    try {
      await writeFile(path, 'Subject: private fixture\r\n\r\nnot for delivery');
      await expect(transport.sendMail({
        from: 'radar@example.test', to: 'reader@example.test', raw: { path },
      })).rejects.toThrow(/file access rejected/i);
    } finally {
      transport.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('preserves digest recipients and rendered HTML through the mail API', async () => {
    const transport = nodemailer.createTransport({
      streamTransport: true, buffer: true, newline: 'windows',
    });
    const html = renderDigest({
      periodStart: new Date('2026-08-03T00:00:00Z'),
      periodEnd: new Date('2026-08-09T23:59:59Z'),
      dashboardUrl: 'https://dashboard.example.test',
      opportunities: [], byStream: {}, deadlines: [], failedSources: [],
    });
    try {
      const message = await transport.sendMail({
        from: 'Pro Bono Radar <radar@example.test>',
        to: 'Reader <reader@example.test>, second@example.test',
        subject: 'Pro Bono Radar — 0 developments this week',
        html,
        textEncoding: 'base64',
      });
      expect(message.envelope).toEqual({
        from: 'radar@example.test', to: ['reader@example.test', 'second@example.test'],
      });
      const raw = message.message.toString();
      expect(raw).toContain('Content-Type: text/html; charset=utf-8');
      expect(raw).toContain('Content-Transfer-Encoding: base64');
      const body = raw.slice(raw.indexOf('\r\n\r\n') + 4);
      expect(Buffer.from(body, 'base64').toString()).toBe(html);
    } finally {
      transport.close();
    }
  });
});
