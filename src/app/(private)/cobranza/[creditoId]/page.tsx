import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PERMISSIONS } from '@/config/permissions';
import { getServerSessionOrThrow, hasPermission, requirePermission } from '@/lib/rbac';
import { normalizeToIsoDate } from '@/lib/date-input';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CobranzaAlertasPanel } from '@/modules/cobranza/cobranza-alertas-panel';
import { CobranzaCaseOfflineShell } from '@/modules/cobranza/cobranza-case-offline-shell';
import { CreditoLegalPanel } from '@/modules/creditos/credito-legal-panel';
import { formatCobranzaDate } from '@/lib/cobranza-operativa-display';
import { OfflineRestrictedLinkButton } from '@/offline/offline-restricted-link-button';
import { getCobranzaExpedienteCorto } from '@/server/services/cobranza-expediente-service';
import {
  isCommunicationStorageAvailable,
  listCommunicationHistory,
} from '@/server/services/communications-service';
import { syncExpedienteAlertasForCredito } from '@/server/services/expediente-alert-engine';

type Params = Promise<{ creditoId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function getDefaultDate() {
  return normalizeToIsoDate(new Date()) ?? new Date().toISOString().slice(0, 10);
}

function resolveReturnToRoute(value: string | undefined) {
  if (!value) return null;
  if (!value.startsWith('/cobranza/rutas')) return null;
  return value;
}

export default async function CobranzaCasePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  await requirePermission(PERMISSIONS.PAGOS_READ);
  const session = await getServerSessionOrThrow();

  const { creditoId } = await params;
  const raw = await searchParams;
  const occurredAt =
    normalizeToIsoDate(typeof raw.occurredAt === 'string' ? raw.occurredAt : undefined) ?? getDefaultDate();
  const returnToRoute = resolveReturnToRoute(
    typeof raw.returnTo === 'string' ? raw.returnTo : undefined,
  );

  const expediente = await getCobranzaExpedienteCorto({ creditoId, occurredAt });
  if (!expediente) {
    notFound();
  }

  const alertas = (
    await syncExpedienteAlertasForCredito({
      creditoId,
      occurredAt,
    })
  ).currentAlerts;
  const canReviewAlertas = hasPermission(
    PERMISSIONS.PAGOS_WRITE,
    (session.user.permissions as string[]) ?? [],
  );
  const canSendToLegal = hasPermission(
    PERMISSIONS.CREDITOS_WRITE,
    (session.user.permissions as string[]) ?? [],
  );
  const canSendMessage = hasPermission(
    PERMISSIONS.PAGOS_WRITE,
    (session.user.permissions as string[]) ?? [],
  );
  const communicationStorageAvailable = await isCommunicationStorageAvailable();
  const communicationHistory = communicationStorageAvailable
    ? await listCommunicationHistory({
        clienteId: expediente.operativaPanel.cliente.id,
        creditoId,
        limit: 10,
      })
    : [];

  return (
    <section>
      <PageHeader
        title="Expediente corto de cobranza"
        description={`${expediente.header.clientLabel} · ${expediente.header.creditFolio}`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Cobranza', href: `/cobranza?occurredAt=${expediente.occurredAt}` },
          ...(returnToRoute ? [{ label: 'Rutas', href: returnToRoute }] : []),
          { label: expediente.header.creditFolio },
        ]}
        action={
          <div className="flex flex-wrap gap-2">
            {returnToRoute ? (
              <Button asChild variant="outline">
                <Link href={returnToRoute}>Volver a ruta</Link>
              </Button>
            ) : null}
            <OfflineRestrictedLinkButton
              href={expediente.links.paymentHref}
              variant="accent"
              offlineLabel="Los pagos siguen bloqueados cuando el dispositivo está sin conexión."
            >
              Registrar pago
            </OfflineRestrictedLinkButton>
            <Button asChild variant="outline">
              <Link href={expediente.links.creditHref}>Expediente del crédito</Link>
            </Button>
          </div>
        }
      />

      {!expediente.hasActionableRow ? (
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <CardContent className="py-4 text-sm text-amber-900">
            Este crédito no aparece con saldo accionable en la cartera operativa para la fecha{' '}
            {formatCobranzaDate(expediente.occurredAt)}. Se muestra el expediente corto de apoyo con
            la información vigente del crédito.
          </CardContent>
        </Card>
      ) : null}

      <CobranzaCaseOfflineShell
        initialExpediente={expediente}
        communicationHistory={communicationHistory}
        communicationFeatureAvailable={communicationStorageAvailable}
        canSendMessage={canSendMessage}
        >
          <div className="mt-8">
            <CobranzaAlertasPanel
              alerts={alertas}
              canReview={canReviewAlertas}
              emptyMessage="No hay alertas activas de revisión para este expediente."
            />
          </div>
        </CobranzaCaseOfflineShell>

      <div className="mt-8">
        <CreditoLegalPanel
          creditoId={creditoId}
          canSendToLegal={canSendToLegal}
          legal={expediente.legal}
        />
      </div>
    </section>
  );
}
