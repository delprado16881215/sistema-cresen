import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PERMISSIONS } from '@/config/permissions';
import { requireApiPermission } from '@/server/policies/guard';
import { updateClienteSchema } from '@/server/validators/cliente';
import { deactivateCliente, updateCliente } from '@/server/services/clientes-service';
import { toErrorMessage, AppError } from '@/lib/errors';
import { parseClienteDocumentFiles } from '@/server/uploads/cliente-documents';

const idSchema = z.object({ clienteId: z.string().cuid() });
export const runtime = 'nodejs';

function parseNullableString(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') return null;
  return value.trim() === '' ? null : value;
}

function parseNullableNumber(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export async function PATCH(request: Request, context: { params: Promise<{ clienteId: string }> }) {
  try {
    const session = await requireApiPermission(PERMISSIONS.CLIENTES_WRITE);
    const { clienteId } = idSchema.parse(await context.params);
    const formData = await request.formData();
    const payload = {
      id: clienteId,
      fullName: String(formData.get('fullName') ?? ''),
      phone: String(formData.get('phone') ?? ''),
      secondaryPhone: parseNullableString(formData.get('secondaryPhone')),
      address: String(formData.get('address') ?? ''),
      postalCode: String(formData.get('postalCode') ?? ''),
      neighborhood: parseNullableString(formData.get('neighborhood')),
      city: parseNullableString(formData.get('city')),
      state: parseNullableString(formData.get('state')),
      betweenStreets: parseNullableString(formData.get('betweenStreets')),
      referencesNotes: parseNullableString(formData.get('referencesNotes')),
      observations: parseNullableString(formData.get('observations')),
      manualGeoLatitude: parseNullableNumber(formData.get('manualGeoLatitude')),
      manualGeoLongitude: parseNullableNumber(formData.get('manualGeoLongitude')),
      manualGeoIsApproximate: String(formData.get('manualGeoIsApproximate') ?? 'false') === 'true',
      manualGeoObservation: parseNullableString(formData.get('manualGeoObservation')),
      promotoriaId: parseNullableString(formData.get('promotoriaId')),
      isActive: String(formData.get('isActive') ?? 'true') === 'true',
    };
    const parsed = updateClienteSchema.parse(payload);
    const updated = await updateCliente(
      {
        ...parsed,
        ...parseClienteDocumentFiles(formData),
      },
      session.user.id,
    );
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: 'Datos inválidos', issues: error.flatten() }, { status: 422 });
    }
    if (error instanceof AppError) {
      return NextResponse.json({ message: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ message: toErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ clienteId: string }> }) {
  try {
    const session = await requireApiPermission(PERMISSIONS.CLIENTES_DEACTIVATE);
    const { clienteId } = idSchema.parse(await context.params);
    const deleted = await deactivateCliente(clienteId, session.user.id);
    return NextResponse.json(deleted);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: 'Solicitud inválida', issues: error.flatten() }, { status: 422 });
    }
    if (error instanceof AppError) {
      return NextResponse.json({ message: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ message: toErrorMessage(error) }, { status: 500 });
  }
}
