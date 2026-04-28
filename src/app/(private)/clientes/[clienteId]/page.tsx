import { notFound } from 'next/navigation';
import { PERMISSIONS } from '@/config/permissions';
import { getServerSessionOrThrow, hasPermission, requirePermission } from '@/lib/rbac';
import { ClienteBitacoraView } from '@/modules/clientes/cliente-bitacora-view';
import { getClienteBitacora } from '@/server/services/cliente-bitacora-service';
import { listCommunicationHistory } from '@/server/services/communications-service';

export default async function ClienteDetailPage({
  params,
}: {
  params: Promise<{ clienteId: string }>;
}) {
  await requirePermission(PERMISSIONS.CLIENTES_READ);
  const session = await getServerSessionOrThrow();
  const { clienteId } = await params;

  const bitacora = await getClienteBitacora({ clienteId });
  if (!bitacora) notFound();

  const communicationHistory = await listCommunicationHistory({
    clienteId,
    limit: 10,
  });
  const canSendMessage = hasPermission(
    PERMISSIONS.CLIENTES_WRITE,
    (session.user.permissions as string[]) ?? [],
  );

  return (
    <ClienteBitacoraView
      bitacora={bitacora}
      communicationHistory={communicationHistory}
      canSendMessage={canSendMessage}
    />
  );
}
