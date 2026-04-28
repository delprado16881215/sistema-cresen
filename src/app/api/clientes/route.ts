import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PERMISSIONS } from '@/config/permissions';
import { requireApiPermission } from '@/server/policies/guard';
import { createClienteSchema } from '@/server/validators/cliente';
import { createCliente } from '@/server/services/clientes-service';
import { toErrorMessage, AppError } from '@/lib/errors';
import { parseClienteDocumentFiles } from '@/server/uploads/cliente-documents';

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

export async function POST(request: Request) {
  try {
    const session = await requireApiPermission(PERMISSIONS.CLIENTES_WRITE);
    const formData = await request.formData();
    const payload = {
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

    const parsed = createClienteSchema.parse(payload);
    const created = await createCliente(
      {
        ...parsed,
        ...parseClienteDocumentFiles(formData),
      },
      session.user.id,
    );
    return NextResponse.json(created, { status: 201 });
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
