'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const DISMISS_KEY = 'policai-dismissed-site-disclaimer';
const GITHUB_URL = 'https://github.com/l0cka/policai';

export function SiteDisclaimerBanner() {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return window.localStorage.getItem(DISMISS_KEY) === 'true';
  });

  const handleDismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, 'true');
    setDismissed(true);
  };

  if (dismissed) {
    return null;
  }

  return (
    <div className="border-b border-foreground/20 bg-muted/60">
      <div className="container mx-auto flex items-start gap-3 px-4 py-3 sm:items-center">
        <p className="flex-1 text-sm leading-6 text-foreground/85">
          Policai is a work in progress and is not regularly maintained. It is open source, and
          contributions are encouraged via{' '}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline underline-offset-4 transition-colors hover:text-foreground"
          >
            GitHub
          </a>
          .
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={handleDismiss}
          className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground sm:mt-0"
          aria-label="Dismiss site disclaimer"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
