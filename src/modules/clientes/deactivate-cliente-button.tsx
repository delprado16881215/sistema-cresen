'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

type Props = {
  clienteId: string;
};

export function DeactivateClienteButton({ clienteId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const onDeactivate = async () => {
    const confirmAction = window.confirm('¿Confirmas la baja lógica del cliente?');
    if (!confirmAction) return;

    setLoading(true);
    const response = await fetch(`/api/clientes/${clienteId}`, { method: 'DELETE' });
    setLoading(false);

    if (!response.ok) {
      const body = (await response.json()) as { message?: string };
      window.alert(body.message ?? 'No se pudo realizar la baja lógica.');
      return;
    }

    router.push('/clientes');
    router.refresh();
  };

  return (
    <Button variant="destructive" onClick={onDeactivate} disabled={loading}>
      {loading ? 'Procesando...' : 'Baja lógica'}
    </Button>
  );
}
