'use client';

import { useState, type MouseEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  buildClienteDocumentEndpoint,
  type ClienteDocumentType,
} from '@/modules/clientes/cliente-document-utils';

type ClienteDocumentLinkProps = {
  clienteId: string;
  documentType: ClienteDocumentType;
  className?: string;
  children?: ReactNode;
};

export function ClienteDocumentLink({
  clienteId,
  documentType,
  className,
  children = 'Ver documento',
}: ClienteDocumentLinkProps) {
  const [error, setError] = useState<string | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const endpoint = buildClienteDocumentEndpoint(clienteId, documentType);

  async function handleOpen(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    setError(null);
    setIsOpening(true);

    try {
      const response = await fetch(endpoint);
      const payload = (await response.json()) as { signedUrl?: string; message?: string };

      if (!response.ok || !payload.signedUrl) {
        throw new Error(payload.message ?? 'No se pudo abrir el documento.');
      }

      window.open(payload.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'No se pudo abrir el documento.');
    } finally {
      setIsOpening(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button asChild variant="outline" size="sm" className={className}>
        <a href={endpoint} onClick={handleOpen} target="_blank" rel="noreferrer">
          {isOpening ? 'Abriendo...' : children}
        </a>
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
