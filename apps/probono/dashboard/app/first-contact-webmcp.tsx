'use client';

import { useEffect } from 'react';
import { TOOL_DEFINITION } from '../lib/first-contact';

type ModelContext = {
  registerTool: (tool: unknown, options?: { signal?: AbortSignal }) => unknown;
};

export default function FirstContactWebMcp() {
  useEffect(() => {
    const modelContext = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!modelContext) return;
    const controller = new AbortController();
    const tool = {
      ...TOOL_DEFINITION,
      execute: async (input: Record<string, unknown>) => {
        const params = new URLSearchParams();
        for (const key of ['state', 'postcode', 'lga', 'problem']) {
          if (typeof input[key] === 'string') params.set(key, input[key] as string);
        }
        const c = input.circumstances as Record<string, unknown> | undefined;
        for (const [k, v] of Object.entries(c ?? {})) params.set(k, String(v));
        const res = await fetch(`/api/first-contact?${params}`, { signal: controller.signal });
        try {
          const body = await res.json();
          return { content: [{ type: 'text', text: JSON.stringify(body) }], isError: !res.ok };
        } catch {
          return { content: [{ type: 'text', text: 'Lookup failed.' }], isError: true };
        }
      },
    };
    try {
      void Promise.resolve(modelContext.registerTool(tool, { signal: controller.signal })).catch((error) => console.warn('first-contact WebMCP registration failed', error));
    } catch (error) {
      console.warn('first-contact WebMCP registration failed', error);
    }
    return () => controller.abort();
  }, []);
  return null;
}
