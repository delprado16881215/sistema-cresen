'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

type CopyValueButtonProps = {
  label: string;
  value: string | null;
};

export function CopyValueButton({ label, value }: CopyValueButtonProps) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={!value}
      onClick={async () => {
        if (!value) return;
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? 'Copiado' : label}
    </Button>
  );
}
