import { prisma } from '@/lib/prisma';
import { normalizeText } from '@/lib/utils';
import { AppError } from '@/lib/errors';
import { writeAuditLog } from '@/lib/audit';
import type { Prisma } from '@prisma/client';
import type { CreateClienteInput, UpdateClienteInput } from '@/server/validators/cliente';
import {
  deleteReplacedClienteDocuments,
  persistClienteDocuments,
  validateClienteDocumentFiles,
} from '@/server/uploads/cliente-documents';
import { generateNextClienteCode } from '@/server/services/cliente-code-sequence';
import { upsertClienteGeoReferenceFromClienteManualCapture } from '@/server/services/cliente-geo-reference-service';
import {
  normalizeOptionalPhone,
  normalizePhone,
  normalizePostalCode,
  toUppercaseValue,
} from '@/modules/clientes/cliente-normalizers';

function normalizeCliente(input: {
  fullName?: string;
  phone?: string;
  secondaryPhone?: string | null;
  address?: string;
}) {
  return {
    searchableName: input.fullName ? normalizeText(input.fullName) : undefined,
    searchablePhone: normalizeText([input.phone, input.secondaryPhone].filter(Boolean).join(' ')),
    searchableAddress: input.address ? normalizeText(input.address) : undefined,
  };
}

function normalizeClientePayload(input: CreateClienteInput): CreateClienteInput;
function normalizeClientePayload(input: UpdateClienteInput): UpdateClienteInput;
function normalizeClientePayload(input: CreateClienteInput | UpdateClienteInput) {
  return {
    ...input,
    fullName: input.fullName ? toUppercaseValue(input.fullName) ?? input.fullName : input.fullName,
    phone: input.phone ? normalizePhone(input.phone) : input.phone,
    secondaryPhone:
      'secondaryPhone' in input ? normalizeOptionalPhone(input.secondaryPhone) : input.secondaryPhone,
    address: input.address ? toUppercaseValue(input.address) ?? input.address : input.address,
    postalCode: input.postalCode ? normalizePostalCode(input.postalCode) : input.postalCode,
    neighborhood:
      'neighborhood' in input ? toUppercaseValue(input.neighborhood) : input.neighborhood,
    city: 'city' in input ? toUppercaseValue(input.city) : input.city,
    state: 'state' in input ? toUppercaseValue(input.state) : input.state,
    betweenStreets:
      'betweenStreets' in input ? toUppercaseValue(input.betweenStreets) : input.betweenStreets,
    referencesNotes:
      'referencesNotes' in input ? toUppercaseValue(input.referencesNotes) : input.referencesNotes,
    observations:
      'observations' in input ? toUppercaseValue(input.observations) : input.observations,
  };
}

function buildClienteGeoAddressQuery(input: {
  address?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
}) {
  const parts = [input.address, input.neighborhood, input.city, input.state]
    .map((value) => value?.trim())
    .filter(Boolean);

  return parts.length ? parts.join(', ') : null;
}

async function getDefaultClientTypeId(tx: Prisma.TransactionClient): Promise<string> {
  const defaultClientType = await tx.clientTypeCatalog.findUnique({
    where: { code: 'NUEVO' },
    select: { id: true },
  });

  if (!defaultClientType) {
    throw new AppError('No existe el tipo de cliente NUEVO configurado en el catalogo.', 'CONFIGURATION_ERROR', 500);
  }

  return defaultClientType.id;
}

type ClienteDocumentInput = {
  ineFrontFile?: File | null;
  ineBackFile?: File | null;
  pagareFrontFile?: File | null;
  pagareBackFile?: File | null;
  proofOfAddressFile?: File | null;
};

export async function createCliente(input: CreateClienteInput & ClienteDocumentInput, userId: string) {
  const { ineFrontFile, ineBackFile, pagareFrontFile, pagareBackFile, proofOfAddressFile, ...domainInput } = input;
  const sanitizedInput = normalizeClientePayload(domainInput);
  const {
    manualGeoLatitude,
    manualGeoLongitude,
    manualGeoIsApproximate,
    manualGeoObservation,
    ...clienteInput
  } = sanitizedInput;
  const normalized = normalizeCliente(clienteInput);
  const documents = { ineFrontFile, ineBackFile, pagareFrontFile, pagareBackFile, proofOfAddressFile };
  validateClienteDocumentFiles(documents);

  const created = await prisma.$transaction(async (tx) => {
    const code = await generateNextClienteCode(tx);
    const defaultClientTypeId = await getDefaultClientTypeId(tx);

    return tx.cliente.create({
      data: {
        code,
        ...clienteInput,
        secondaryPhone: clienteInput.secondaryPhone ?? null,
        neighborhood: clienteInput.neighborhood ?? null,
        city: clienteInput.city ?? null,
        state: clienteInput.state ?? null,
        betweenStreets: clienteInput.betweenStreets ?? null,
        referencesNotes: clienteInput.referencesNotes ?? null,
        observations: clienteInput.observations ?? null,
        clientTypeId: defaultClientTypeId,
        ...normalized,
      },
    });
  });

  let cliente = created;

  try {
    const documentPaths = await persistClienteDocuments({
      clienteId: created.id,
      files: documents,
    });

    cliente =
      documentPaths.ineFrontPath ||
      documentPaths.ineBackPath ||
      documentPaths.pagareFrontPath ||
      documentPaths.pagareBackPath ||
      documentPaths.proofOfAddressPath
        ? await prisma.cliente.update({
            where: { id: created.id },
            data: {
              ineFrontPath: documentPaths.ineFrontPath,
              ineBackPath: documentPaths.ineBackPath,
              pagareFrontPath: documentPaths.pagareFrontPath,
              pagareBackPath: documentPaths.pagareBackPath,
              proofOfAddressPath: documentPaths.proofOfAddressPath,
            },
          })
        : created;
  } catch (error) {
    await prisma.cliente.delete({ where: { id: created.id } });
    throw error;
  }

  await upsertClienteGeoReferenceFromClienteManualCapture(
    {
      clienteId: cliente.id,
      latitud: manualGeoLatitude ?? null,
      longitud: manualGeoLongitude ?? null,
      isApproximate: manualGeoIsApproximate ?? false,
      observation: manualGeoObservation ?? null,
      normalizedAddressQuery: buildClienteGeoAddressQuery(cliente),
    },
    {
      userId,
    },
  );

  await writeAuditLog({
    userId,
    module: 'clientes',
    entity: 'Cliente',
    entityId: cliente.id,
    action: 'CREATE',
    afterJson: cliente,
  });

  return cliente;
}

export async function updateCliente(input: UpdateClienteInput & ClienteDocumentInput, userId: string) {
  const { ineFrontFile, ineBackFile, pagareFrontFile, pagareBackFile, proofOfAddressFile, ...domainInput } = input;
  const sanitizedInput = normalizeClientePayload(domainInput);
  const {
    manualGeoLatitude,
    manualGeoLongitude,
    manualGeoIsApproximate,
    manualGeoObservation,
    ...clienteInput
  } = sanitizedInput;
  const current = await prisma.cliente.findFirst({ where: { id: input.id, deletedAt: null } });
  if (!current) {
    throw new AppError('Cliente no encontrado.', 'NOT_FOUND', 404);
  }
  const documents = { ineFrontFile, ineBackFile, pagareFrontFile, pagareBackFile, proofOfAddressFile };
  validateClienteDocumentFiles(documents);

  const normalized = normalizeCliente({
    fullName: clienteInput.fullName ?? current.fullName,
    phone: clienteInput.phone ?? current.phone,
    secondaryPhone: clienteInput.secondaryPhone ?? current.secondaryPhone,
    address: clienteInput.address ?? current.address,
  });

  const updated = await prisma.cliente.update({
    where: { id: current.id },
    data: {
      ...clienteInput,
      id: undefined,
      secondaryPhone: clienteInput.secondaryPhone ?? null,
      neighborhood: clienteInput.neighborhood ?? null,
      city: clienteInput.city ?? null,
      state: clienteInput.state ?? null,
      betweenStreets: clienteInput.betweenStreets ?? null,
      referencesNotes: clienteInput.referencesNotes ?? null,
      observations: clienteInput.observations ?? null,
      ...normalized,
    },
  });

  const documentPaths = await persistClienteDocuments({
    clienteId: current.id,
    files: {
      ineFrontFile: documents.ineFrontFile,
      ineBackFile: documents.ineBackFile,
      pagareFrontFile: documents.pagareFrontFile,
      pagareBackFile: documents.pagareBackFile,
      proofOfAddressFile: documents.proofOfAddressFile,
    },
    currentPaths: {
      ineFrontPath: current.ineFrontPath,
      ineBackPath: current.ineBackPath,
      pagareFrontPath: current.pagareFrontPath,
      pagareBackPath: current.pagareBackPath,
      proofOfAddressPath: current.proofOfAddressPath,
    },
  });

  const updatedWithDocuments =
    documentPaths.ineFrontPath ||
    documentPaths.ineBackPath ||
    documentPaths.pagareFrontPath ||
    documentPaths.pagareBackPath ||
    documentPaths.proofOfAddressPath
      ? await prisma.cliente.update({
          where: { id: current.id },
          data: {
            ...(documentPaths.ineFrontPath ? { ineFrontPath: documentPaths.ineFrontPath } : {}),
            ...(documentPaths.ineBackPath ? { ineBackPath: documentPaths.ineBackPath } : {}),
            ...(documentPaths.pagareFrontPath ? { pagareFrontPath: documentPaths.pagareFrontPath } : {}),
            ...(documentPaths.pagareBackPath ? { pagareBackPath: documentPaths.pagareBackPath } : {}),
            ...(documentPaths.proofOfAddressPath
              ? { proofOfAddressPath: documentPaths.proofOfAddressPath }
              : {}),
          },
        })
      : updated;

  await deleteReplacedClienteDocuments(documentPaths.storageKeysToDelete);

  await upsertClienteGeoReferenceFromClienteManualCapture(
    {
      clienteId: updatedWithDocuments.id,
      latitud: manualGeoLatitude ?? null,
      longitud: manualGeoLongitude ?? null,
      isApproximate: manualGeoIsApproximate ?? false,
      observation: manualGeoObservation ?? null,
      normalizedAddressQuery: buildClienteGeoAddressQuery(updatedWithDocuments),
    },
    {
      userId,
    },
  );

  await writeAuditLog({
    userId,
    module: 'clientes',
    entity: 'Cliente',
    entityId: updatedWithDocuments.id,
    action: 'UPDATE',
    beforeJson: current,
    afterJson: updatedWithDocuments,
  });

  return updatedWithDocuments;
}

export async function deactivateCliente(id: string, userId: string) {
  const current = await prisma.cliente.findFirst({ where: { id, deletedAt: null } });
  if (!current) {
    throw new AppError('Cliente no encontrado.', 'NOT_FOUND', 404);
  }

  const updated = await prisma.cliente.update({
    where: { id },
    data: {
      isActive: false,
      deletedAt: new Date(),
    },
  });

  await writeAuditLog({
    userId,
    module: 'clientes',
    entity: 'Cliente',
    entityId: updated.id,
    action: 'SOFT_DELETE',
    beforeJson: current,
    afterJson: updated,
  });

  return updated;
}
