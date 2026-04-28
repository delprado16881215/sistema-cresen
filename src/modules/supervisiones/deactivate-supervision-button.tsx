'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

type Props = {
  supervisionId: string;
  disabled?: boolean;
};

export function DeactivateSupervisionButton({ supervisionId, disabled = false }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const onDeactivate = async () => {
    const confirmed = window.confirm('¿Confirmas la baja lógica de la supervisión?');
    if (!confirmed) return;

    setLoading(true);
    const response = await fetch(`/api/supervisiones/${supervisionId}`, { method: 'DELETE' });
    setLoading(false);

    if (!response.ok) {
      const body = (await response.json()) as { message?: string };
      window.alert(body.message ?? 'No se pudo dar de baja la supervisión.');
      return;
    }

    router.refresh();
  };

  return (
    <Button variant="destructive" size="sm" onClick={onDeactivate} disabled={disabled || loading}>
      {loading ? 'Procesando...' : 'Baja'}
    </Button>
  );
}
