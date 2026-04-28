'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

type ReversalButtonProps = {
  endpoint: string;
  payload: Record<string, string>;
  label: string;
  confirmMessage: string;
};

export function ReversalButton({ endpoint, payload, label, confirmMessage }: ReversalButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={loading}
      onClick={async () => {
        const reason = window.prompt(confirmMessage);
        if (!reason) return;

        setLoading(true);
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            reason,
          }),
        });
        setLoading(false);

        if (!response.ok) {
          const body = (await response.json()) as { message?: string };
          window.alert(body.message ?? 'No se pudo completar la reversa.');
          return;
        }

        router.refresh();
      }}
    >
      {loading ? 'Procesando...' : label}
    </Button>
  );
}
