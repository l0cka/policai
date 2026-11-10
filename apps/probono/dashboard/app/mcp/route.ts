import { NextResponse } from 'next/server';
import { TOOL_DEFINITION, TOOL_NAME } from '../../lib/first-contact';
import { lookup } from '../../lib/first-contact-data';

export const dynamic = 'force-dynamic';

const MAX_BODY = 16_384;
const PROTOCOL_VERSION = '2025-06-18';

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

function reply(id: Rpc['id'], result: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, result });
}

function fail(id: Rpc['id'], code: number, message: string) {
  return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
}

async function readCapped(request: Request): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

export async function POST(request: Request) {
  let body: Rpc;
  try {
    if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) return fail(null, -32600, 'Request too large');
    const text = await readCapped(request);
    if (text === null) return fail(null, -32600, 'Request too large');
    body = JSON.parse(text) as Rpc;
  } catch {
    return fail(null, -32700, 'Parse error');
  }
  if (!body || typeof body !== 'object' || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
    return fail(body?.id, -32600, 'Invalid request');
  }
  if (body.id === undefined) return new NextResponse(null, { status: 202 });

  switch (body.method) {
    case 'initialize':
      return reply(body.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'policai-a2j-first-contact', version: '1.0.0' },
      });
    case 'ping':
      return reply(body.id, {});
    case 'tools/list':
      return reply(body.id, { tools: [TOOL_DEFINITION] });
    case 'tools/call': {
      if (body.params?.name !== TOOL_NAME) return fail(body.id, -32602, 'Unknown tool');
      const out = lookup(body.params.arguments);
      if ('error' in out) {
        return reply(body.id, { isError: true, content: [{ type: 'text', text: out.error }] });
      }
      return reply(body.id, {
        content: [{ type: 'text', text: JSON.stringify(out.result) }],
        structuredContent: out.result,
      });
    }
    default:
      return fail(body.id, -32601, 'Method not found');
  }
}
