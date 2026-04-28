import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PERMISSIONS } from '@/config/permissions';
import { AppError, toErrorMessage } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { requireApiPermission } from '@/server/policies/guard';
import {
  deleteClienteDocument,
  getClienteDocumentSignedUrl,
  isClienteDocumentType,
  isLegacyPublicUploadPath,
  isStorageKey,
  uploadClienteDocument,
  type ClienteDocumentType,
} from '@/server/uploads/cliente-document-storage';

export const runtime = 'nodejs';

const paramsSchema = z.object({
  clienteId: z.string().cuid(),
  documentType: z.string().refine(isClienteDocumentType, 'Tipo de documento no permitido.'),
});

const DOCUMENT_COLUMN_BY_TYPE = {
  ineFront: 'ineFrontPath',
  ineBack: 'ineBackPath',
  pagareFront: 'pagareFrontPath',
  pagareBack: 'pagareBackPath',
  proofOfAddress: 'proofOfAddressPath',
} as const satisfies Record<ClienteDocumentType, keyof ClienteDocumentFields>;

type ClienteDocumentFields = {
  ineFrontPath: string | null;
  ineBackPath: string | null;
  pagareFrontPath: string | null;
  pagareBackPath: string | null;
  proofOfAddressPath: string | null;
};

type RouteParams = {
  clienteId: string;
  documentType: string;
};

type ClienteDocumentRecord = ClienteDocumentFields & {
  id: string;
};

function parseDownloadFlag(request: Request) {
  const { searchParams } = new URL(request.url);
  return searchParams.get('download') === '1' || searchParams.get('download') === 'true';
}

async function parseParams(context: { params: Promise<RouteParams> }) {
  const parsed = paramsSchema.parse(await context.params);
  return {
    clienteId: parsed.clienteId,
    documentType: parsed.documentType as ClienteDocumentType,
  };
}

async function findClienteDocumentRecord(clienteId: string): Promise<ClienteDocumentRecord> {
  const cliente = await prisma.cliente.findFirst({
    where: { id: clienteId, deletedAt: null },
    select: {
      id: true,
      ineFrontPath: true,
      ineBackPath: true,
      pagareFrontPath: true,
      pagareBackPath: true,
      proofOfAddressPath: true,
    },
  });

  if (!cliente) {
    throw new AppError('Cliente no encontrado.', 'CLIENTE_NOT_FOUND', 404);
  }

  return cliente;
}

function getDocumentReference(cliente: ClienteDocumentRecord, documentType: ClienteDocumentType) {
  return cliente[DOCUMENT_COLUMN_BY_TYPE[documentType]];
}

function buildDocumentUpdate(documentType: ClienteDocumentType, value: string | null) {
  return {
    [DOCUMENT_COLUMN_BY_TYPE[documentType]]: value,
  };
}

function getRequiredStorageKey(reference: string | null, action: 'read' | 'delete') {
  if (!reference) {
    throw new AppError('No existe documento cargado para este cliente.', 'CLIENT_DOCUMENT_NOT_FOUND', 404);
  }

  if (isLegacyPublicUploadPath(reference)) {
    throw new AppError(
      action === 'read'
        ? 'Este documento aún está en almacenamiento legacy y requiere migración antes de poder consultarse por este endpoint.'
        : 'Este documento aún está en almacenamiento legacy. Migra el documento antes de eliminarlo desde este endpoint.',
      'CLIENT_DOCUMENT_MIGRATION_REQUIRED',
      409,
    );
  }

  if (!isStorageKey(reference)) {
    throw new AppError('La referencia del documento no es válida.', 'INVALID_CLIENT_DOCUMENT_REFERENCE', 422);
  }

  return reference;
}

async function getRequiredUploadFile(request: Request) {
  const formData = await request.formData();
  const file = formData.get('file') ?? formData.get('document');

  if (!(file instanceof File) || file.size <= 0) {
    throw new AppError('Adjunta un archivo en el campo "file".', 'CLIENT_DOCUMENT_FILE_REQUIRED', 422);
  }

  return file;
}

function handleError(error: unknown) {
  if (error instanceof z.ZodError) {
    return NextResponse.json({ message: 'Solicitud inválida', issues: error.flatten() }, { status: 422 });
  }

  if (error instanceof AppError) {
    return NextResponse.json({ message: error.message, code: error.code }, { status: error.status });
  }

  return NextResponse.json({ message: toErrorMessage(error) }, { status: 500 });
}

export async function GET(request: Request, context: { params: Promise<RouteParams> }) {
  try {
    await requireApiPermission(PERMISSIONS.CLIENTES_READ);
    const { clienteId, documentType } = await parseParams(context);
    const cliente = await findClienteDocumentRecord(clienteId);
    const storageKey = getRequiredStorageKey(getDocumentReference(cliente, documentType), 'read');
    const signedUrl = await getClienteDocumentSignedUrl({
      storageKey,
      download: parseDownloadFlag(request),
    });

    return NextResponse.json({
      documentType,
      signedUrl: signedUrl.signedUrl,
      expiresInSeconds: signedUrl.expiresInSeconds,
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request, context: { params: Promise<RouteParams> }) {
  return upsertClienteDocument(request, context);
}

export async function PUT(request: Request, context: { params: Promise<RouteParams> }) {
  return upsertClienteDocument(request, context);
}

async function upsertClienteDocument(request: Request, context: { params: Promise<RouteParams> }) {
  try {
    await requireApiPermission(PERMISSIONS.CLIENTES_WRITE);
    const { clienteId, documentType } = await parseParams(context);
    const [cliente, file] = await Promise.all([
      findClienteDocumentRecord(clienteId),
      getRequiredUploadFile(request),
    ]);
    const previousReference = getDocumentReference(cliente, documentType);
    const uploaded = await uploadClienteDocument({ clienteId, documentType, file });

    await prisma.cliente.update({
      where: { id: cliente.id },
      data: buildDocumentUpdate(documentType, uploaded.storageKey),
    });

    if (previousReference && isStorageKey(previousReference) && previousReference !== uploaded.storageKey) {
      await deleteClienteDocument(previousReference);
    }

    return NextResponse.json({
      documentType,
      storageKey: uploaded.storageKey,
      contentType: uploaded.contentType,
      size: uploaded.size,
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_: Request, context: { params: Promise<RouteParams> }) {
  try {
    await requireApiPermission(PERMISSIONS.CLIENTES_WRITE);
    const { clienteId, documentType } = await parseParams(context);
    const cliente = await findClienteDocumentRecord(clienteId);
    const storageKey = getRequiredStorageKey(getDocumentReference(cliente, documentType), 'delete');

    await prisma.cliente.update({
      where: { id: cliente.id },
      data: buildDocumentUpdate(documentType, null),
    });
    await deleteClienteDocument(storageKey);

    return NextResponse.json({
      documentType,
      deleted: true,
    });
  } catch (error) {
    return handleError(error);
  }
}
