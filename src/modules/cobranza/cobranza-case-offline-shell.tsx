'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CobranzaExpedienteCortoView } from '@/modules/cobranza/cobranza-expediente-corto';
import { CobranzaOperativaPanel } from '@/modules/cobranza/cobranza-operativa-panel';
import { CommunicationComposerCard } from '@/modules/comunicaciones/communication-composer-card';
import { CommunicationHistoryCard } from '@/modules/comunicaciones/communication-history-card';
import { OfflineSyncPanel } from '@/modules/cobranza/offline-sync-panel';
import {
  getOfflineCaseSnapshot,
  saveOfflineCaseSnapshot,
} from '@/offline/offline-case-store';
import { useOfflineMode } from '@/offline/offline-mode-provider';
import type { CobranzaExpedienteCorto } from '@/server/services/cobranza-expediente-service';
import type { CommunicationLogItem } from '@/server/services/communications-service';

export function CobranzaCaseOfflineShell({
  initialExpediente,
  communicationHistory,
  communicationFeatureAvailable,
  canSendMessage,
  children,
}: {
  initialExpediente: CobranzaExpedienteCorto;
  communicationHistory: CommunicationLogItem[];
  communicationFeatureAvailable: boolean;
  canSendMessage: boolean;
  children?: React.ReactNode;
}) {
  const { isOfflineMode } = useOfflineMode();
  const [activeExpediente, setActiveExpediente] = useState(initialExpediente);
  const [offlineMessage, setOfflineMessage] = useState<string | null>(null);
  const [isOperativeModalOpen, setIsOperativeModalOpen] = useState(false);

  useEffect(() => {
    setActiveExpediente(initialExpediente);
    void saveOfflineCaseSnapshot(initialExpediente);
  }, [initialExpediente]);

  useEffect(() => {
    let cancelled = false;

    const hydrateSnapshot = async () => {
      if (!isOfflineMode) {
        setActiveExpediente(initialExpediente);
        setOfflineMessage(null);
        return;
      }

      const cached = await getOfflineCaseSnapshot(
        initialExpediente.operativaPanel.credito.id,
        initialExpediente.occurredAt,
      );

      if (cancelled) return;

      if (cached?.expediente) {
        setActiveExpediente(cached.expediente);
        setOfflineMessage('Expediente corto cargado desde el cache local del dispositivo.');
        return;
      }

      setActiveExpediente(initialExpediente);
      setOfflineMessage(
        'No existe un expediente corto descargado para esta fecha. Se muestra la última vista cargada en memoria.',
      );
    };

    void hydrateSnapshot();

    return () => {
      cancelled = true;
    };
  }, [initialExpediente, isOfflineMode]);

  useEffect(() => {
    if (!isOperativeModalOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOperativeModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOperativeModalOpen]);

  return (
    <>
      {offlineMessage ? (
        <div className="mb-6 rounded-xl border border-border/70 bg-secondary/20 px-4 py-3 text-sm text-muted-foreground">
          {offlineMessage}
        </div>
      ) : null}

      <CobranzaExpedienteCortoView
        expediente={activeExpediente}
        extraActions={
          <Button type="button" variant="accent" onClick={() => setIsOperativeModalOpen(true)}>
            Registro operativo
          </Button>
        }
      />

      {isOperativeModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
          onClick={() => setIsOperativeModalOpen(false)}
        >
          <div
            className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-border bg-background p-6 shadow-soft"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-primary">Registro operativo</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Captura llamada, promesa o visita desde una sola ventana, sin tocar la lógica financiera.
                </p>
              </div>
              <Button type="button" variant="ghost" onClick={() => setIsOperativeModalOpen(false)}>
                Cerrar
              </Button>
            </div>

            <CobranzaOperativaPanel
              cliente={activeExpediente.operativaPanel.cliente}
              credito={activeExpediente.operativaPanel.credito}
              interacciones={activeExpediente.operativaPanel.interacciones}
              promesasPago={activeExpediente.operativaPanel.promesasPago}
              visitasCampo={activeExpediente.operativaPanel.visitasCampo}
              operationalHoldMessage={activeExpediente.legal.operationalHoldMessage}
              showCaptureForms
              showRecentLists={false}
            />
          </div>
        </div>
      ) : null}

      {children}

      <div className="mt-8 space-y-6">
        {communicationFeatureAvailable ? (
          <div className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
            <CommunicationComposerCard
              sourceContext="COBRANZA"
              title="Comunicaciones de cobranza"
              description="Contacto manual trazable desde el expediente corto, desacoplado de pagos y planner."
              cliente={{
                id: activeExpediente.operativaPanel.cliente.id,
                code: activeExpediente.operativaPanel.cliente.code,
                fullName: activeExpediente.operativaPanel.cliente.fullName,
                phone: activeExpediente.operativaPanel.cliente.phone,
                secondaryPhone: activeExpediente.operativaPanel.cliente.secondaryPhone,
              }}
              credito={{
                id: activeExpediente.operativaPanel.credito.id,
                folio: activeExpediente.operativaPanel.credito.folio,
                loanNumber: activeExpediente.operativaPanel.credito.loanNumber,
              }}
              canSend={canSendMessage}
              notice={activeExpediente.legal.operationalHoldMessage}
            />
            <CommunicationHistoryCard
              logs={communicationHistory}
              emptyMessage="Aún no hay mensajes registrados para este caso de cobranza."
            />
          </div>
        ) : (
          <div className="rounded-xl border border-border/70 bg-muted/15 px-4 py-4 text-sm text-muted-foreground">
            El bloque de comunicaciones todavía no está disponible en esta base activa. El expediente
            corto sigue funcionando sin historial ni envío de mensajes.
          </div>
        )}

        <div>
          <h2 className="text-lg font-semibold text-foreground">Bitácora operativa</h2>
          <p className="text-sm text-muted-foreground">
            Consulta rápida del historial reciente de interacciones, promesas y visitas del expediente.
          </p>
        </div>

        <OfflineSyncPanel
          clienteId={activeExpediente.operativaPanel.cliente.id}
          creditoId={activeExpediente.operativaPanel.credito.id}
        />

        <CobranzaOperativaPanel
          cliente={activeExpediente.operativaPanel.cliente}
          credito={activeExpediente.operativaPanel.credito}
          interacciones={activeExpediente.operativaPanel.interacciones}
          promesasPago={activeExpediente.operativaPanel.promesasPago}
          visitasCampo={activeExpediente.operativaPanel.visitasCampo}
          operationalHoldMessage={activeExpediente.legal.operationalHoldMessage}
          showCaptureForms={false}
          showRecentLists
        />
      </div>
    </>
  );
}
