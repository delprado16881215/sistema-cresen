import { notFound } from 'next/navigation';
import { PERMISSIONS } from '@/config/permissions';
import { requirePermission } from '@/lib/rbac';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/page-header';
import { ClienteForm } from '@/modules/clientes/cliente-form';
import { findClienteById } from '@/server/repositories/cliente-repository';
import { getClienteGeoReferenceFormState } from '@/server/services/cliente-geo-reference-service';

export default async function EditarClientePage({
  params,
}: {
  params: Promise<{ clienteId: string }>;
}) {
  await requirePermission(PERMISSIONS.CLIENTES_WRITE);
  const { clienteId } = await params;

  const [cliente, geoFormState] = await Promise.all([
    findClienteById(clienteId),
    getClienteGeoReferenceFormState(clienteId),
  ]);

  if (!cliente) notFound();

  return (
    <section>
      <PageHeader
        title="Editar cliente"
        description={cliente.fullName}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Clientes', href: '/clientes' },
          { label: cliente.code, href: `/clientes/${cliente.id}` },
          { label: 'Editar' },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Actualización de cliente</CardTitle>
        </CardHeader>
        <CardContent>
          <ClienteForm
            mode="edit"
            clienteId={cliente.id}
            defaultValues={{
              code: cliente.code,
              fullName: cliente.fullName,
              phone: cliente.phone,
              secondaryPhone: cliente.secondaryPhone ?? undefined,
              address: cliente.address,
              postalCode: cliente.postalCode,
              neighborhood: cliente.neighborhood ?? undefined,
              city: cliente.city ?? undefined,
              state: cliente.state ?? undefined,
              betweenStreets: cliente.betweenStreets ?? undefined,
              referencesNotes: cliente.referencesNotes ?? undefined,
              observations: cliente.observations ?? undefined,
              manualGeoLatitude: geoFormState.manualReference?.latitude,
              manualGeoLongitude: geoFormState.manualReference?.longitude,
              manualGeoIsApproximate: geoFormState.manualReference?.isApproximate ?? false,
              manualGeoObservation: geoFormState.manualReference?.provider ?? undefined,
              ineFrontPath: cliente.ineFrontPath,
              ineBackPath: cliente.ineBackPath,
              pagareFrontPath: cliente.pagareFrontPath,
              pagareBackPath: cliente.pagareBackPath,
              proofOfAddressPath: cliente.proofOfAddressPath,
              isActive: cliente.isActive,
              currentGeoResolution: {
                latitude: geoFormState.current.latitude,
                longitude: geoFormState.current.longitude,
                source: geoFormState.current.source,
                isApproximate: geoFormState.current.isApproximate,
                isReliable: geoFormState.current.isReliable,
                resolvedFrom: geoFormState.current.resolvedFrom,
                updatedAt: geoFormState.current.updatedAt,
                provider: geoFormState.current.provider,
              },
            }}
          />
        </CardContent>
      </Card>
    </section>
  );
}
