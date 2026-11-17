'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

export function CopyTextButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      }}
      className="inline-flex min-h-11 shrink-0 items-center gap-2 border border-border px-3 text-xs text-muted-foreground hover:text-foreground"
    >
      {copied ? <Check aria-hidden className="h-4 w-4 text-[var(--trust)]" /> : <Copy aria-hidden className="h-4 w-4" />}
      <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}
