'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  ClienteSearchField,
  type ClienteSearchOption,
} from '@/modules/creditos/cliente-search-field';

type PartySummary = {
  id: string;
  code: string;
  fullName: string;
  phone: string | null;
};

type CorrectCreditPartyButtonProps = {
  mode: 'holder' | 'aval';
  creditoId: string;
  folio: string;
  currentHolder: PartySummary;
  currentAval: PartySummary | null;
};

function getModeConfig(mode: CorrectCreditPartyButtonProps['mode']) {
  if (mode === 'aval') {
    return {
      buttonLabel: 'Corregir aval',
      title: 'Corregir aval',
      currentLabel: 'Aval actual',
      nextLabel: 'Aval nuevo',
      searchLabel: 'Buscar aval correcto',
      placeholder: 'Buscar por ID, nombre o teléfono',
      emptyMessage: 'No encontré clientes con ese criterio.',
      successMessage: 'Aval corregido correctamente. El expediente se actualizará ahora.',
      endpointSuffix: 'aval',
      invalidCrossMessage: 'El acreditado no puede quedar seleccionado como aval.',
      samePartyMessage: 'Selecciona un aval nuevo antes de guardar.',
      reasonPlaceholder: 'Ejemplo: corrección de importación del aval.',
      summaryLines: [
        'Se actualizará la relación real del crédito al nuevo aval.',
        'Pagos, cronograma, historial y expediente seguirán ligados al mismo crédito.',
        'El cambio quedará registrado en auditoría con el antes y el después.',
      ],
    };
  }

  return {
    buttonLabel: 'Corregir acreditado',
    title: 'Corregir acreditado',
    currentLabel: 'Acreditado actual',
    nextLabel: 'Acreditado nuevo',
    searchLabel: 'Buscar cliente correcto',
    placeholder: 'Buscar por ID, nombre o teléfono',
    emptyMessage: 'No encontré clientes con ese criterio.',
    successMessage: 'Acreditado corregido correctamente. El expediente se actualizará ahora.',
    endpointSuffix: 'acreditado',
    invalidCrossMessage: 'El aval no puede quedar seleccionado como acreditado.',
    samePartyMessage: 'Selecciona el acreditado correcto antes de guardar.',
    reasonPlaceholder: 'Ejemplo: corrección de importación del acreditado.',
    summaryLines: [
      'Se actualizará la relación real del crédito al nuevo acreditado.',
      'Pagos, cronograma, aval y expediente seguirán ligados al mismo crédito.',
      'El cambio quedará registrado en auditoría con el antes y el después.',
    ],
  };
}

export function CorrectCreditPartyButton({
  mode,
  creditoId,
  folio,
  currentHolder,
  currentAval,
}: CorrectCreditPartyButtonProps) {
  const router = useRouter();
  const config = getModeConfig(mode);
  const currentParty = mode === 'holder' ? currentHolder : currentAval;
  const [open, setOpen] = useState(false);
  const [selectedParty, setSelectedParty] = useState<ClienteSearchOption | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedMatchesCounterparty = useMemo(() => {
    if (!selectedParty) return false;
    return selectedParty.id === (mode === 'holder' ? currentAval?.id : currentHolder.id);
  }, [currentAval?.id, currentHolder.id, mode, selectedParty]);

  const selectedMatchesSameParty = useMemo(() => {
    if (!selectedParty || !currentParty) return false;
    return selectedParty.id === currentParty.id;
  }, [currentParty, selectedParty]);

  const summaryReady = Boolean(selectedParty) && !selectedMatchesCounterparty && !selectedMatchesSameParty;

  async function handleSubmit() {
    if (!selectedParty) {
      setError(config.samePartyMessage);
      return;
    }

    if (selectedMatchesCounterparty) {
      setError(config.invalidCrossMessage);
      return;
    }

    if (selectedMatchesSameParty) {
      setError(mode === 'holder' ? 'Ese cliente ya es el acreditado actual.' : 'Ese cliente ya es el aval actual.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/creditos/${creditoId}/${config.endpointSuffix}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId: selectedParty.id,
          reason: reason.trim() || undefined,
        }),
      });

      const body = (await response.json()) as { message?: string };

      if (!response.ok) {
        setError(body.message ?? `No se pudo corregir ${mode === 'holder' ? 'el acreditado' : 'el aval'}.`);
        return;
      }

      setOpen(false);
      setSelectedParty(null);
      setReason('');
      window.alert(config.successMessage);
      router.refresh();
    } catch {
      setError('No se pudo guardar el cambio. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        {config.buttonLabel}
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
          onClick={() => {
            if (!loading) {
              setOpen(false);
              setError(null);
            }
          }}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-border bg-background p-6 shadow-soft"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-primary">{config.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Crédito {folio}. Este cambio actualiza la relación real del crédito sin tocar pagos,
                  cronograma ni historial.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setOpen(false);
                  setError(null);
                }}
                disabled={loading}
              >
                Cerrar
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {config.currentLabel}
                </p>
                {currentParty ? (
                  <>
                    <p className="mt-2 text-sm font-semibold text-foreground">
                      {currentParty.code} · {currentParty.fullName}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {currentParty.phone || 'Sin teléfono'}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">Sin registro actual.</p>
                )}
              </div>

              <div className="rounded-xl border border-border/70 bg-primary/5 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {config.nextLabel}
                </p>
                {selectedParty ? (
                  <>
                    <p className="mt-2 text-sm font-semibold text-foreground">
                      {selectedParty.code} · {selectedParty.fullName}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selectedParty.phone || 'Sin teléfono'}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Busca y selecciona el cliente correcto para ver el resumen.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div className="space-y-2">
                <Label>{config.searchLabel}</Label>
                <ClienteSearchField
                  value={selectedParty}
                  onSelect={setSelectedParty}
                  excludeId={mode === 'aval' ? currentHolder.id : currentParty?.id}
                  placeholder={config.placeholder}
                  emptyMessage={config.emptyMessage}
                  disabled={loading}
                  error={
                    selectedMatchesCounterparty
                      ? config.invalidCrossMessage
                      : selectedMatchesSameParty
                        ? mode === 'holder'
                          ? 'Ese cliente ya es el acreditado actual.'
                          : 'Ese cliente ya es el aval actual.'
                        : undefined
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`credit-party-reason-${mode}`}>Motivo del cambio</Label>
                <Textarea
                  id={`credit-party-reason-${mode}`}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={config.reasonPlaceholder}
                  disabled={loading}
                />
              </div>

              <div className="rounded-xl border border-border/70 bg-secondary/20 p-4 text-sm">
                <p className="font-medium text-foreground">Resumen antes de guardar</p>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  {config.summaryLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>

              {error ? (
                <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  setError(null);
                }}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button type="button" variant="accent" onClick={handleSubmit} disabled={loading || !summaryReady}>
                {loading ? 'Guardando...' : 'Confirmar cambio'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
