import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/errors';
import { writeAuditLog } from '@/lib/audit';
import JSZip from 'jszip';
import { createClienteSchema } from '@/server/validators/cliente';
import { generateNextClienteCode } from '@/server/services/cliente-code-sequence';
import {
  buildDuplicateSignature,
  parseImportWorkbook,
  type ParsedImportClienteRow,
  exportClientesWorkbook,
} from '@/modules/clientes/import/clientes-import-utils';
import { normalizeText } from '@/lib/utils';

const IMPORT_BATCH_SIZE = 100;
const IMPORT_TRANSACTION_OPTIONS = {
  timeout: 60_000,
  maxWait: 10_000,
} as const;

export type ImportPreviewRow = {
  rowNumber: number;
  payload: ParsedImportClienteRow;
  duplicateReason: string | null;
  errors: string[];
};

export type ImportPreviewResult = {
  totalRows: number;
  validRows: ImportPreviewRow[];
  duplicateRows: ImportPreviewRow[];
  errorRows: ImportPreviewRow[];
};

export type ImportCommitErrorRow = {
  rowNumber: number;
  externalClientId: string | null;
  code: string | null;
  fullName: string;
  message: string;
};

export type ImportCommitResult = {
  imported: Array<{ id: string; code: string; fullName: string }>;
  importedCount: number;
  failedRows: ImportCommitErrorRow[];
  failedCount: number;
  batchSize: number;
};

function normalizeClienteSearch(input: {
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

function chunkRows<T>(rows: T[], batchSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += batchSize) {
    chunks.push(rows.slice(index, index + batchSize));
  }
  return chunks;
}

function toCommitErrorMessage(error: unknown) {
  if (error instanceof AppError) {
    return error.message;
  }
  if (error instanceof Error) {
    if ('code' in error && error.code === 'P2002') {
      return 'Cliente duplicado: el código o los datos únicos ya existen en la base.';
    }
    return error.message;
  }
  return 'Ocurrió un error al importar la fila.';
}

export async function previewClienteImport(file: File): Promise<ImportPreviewResult> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const rows = parseImportWorkbook(buffer, file.name);
  if (!rows.length) {
    return {
      totalRows: 0,
      validRows: [],
      duplicateRows: [],
      errorRows: [],
    };
  }

  const [existingByCode, existingByExternalId, existingRows] = await Promise.all([
    prisma.cliente.findMany({
      where: { code: { in: rows.map((row) => row.code).filter((value): value is string => Boolean(value)) } },
      select: { code: true },
    }),
    prisma.cliente.findMany({
      where: {
        externalClientId: { in: rows.map((row) => row.externalClientId).filter((value): value is string => Boolean(value)) },
      },
      select: { externalClientId: true },
    }),
    prisma.cliente.findMany({
      where: {
        OR: rows.map((row) => ({
          fullName: row.fullName,
          phone: row.phone,
        })),
      },
      select: { fullName: true, phone: true },
    }),
  ]);

  const existingCodes = new Set(existingByCode.map((row) => row.code.toUpperCase()));
  const existingExternalIds = new Set(
    existingByExternalId
      .map((row) => row.externalClientId)
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toUpperCase()),
  );
  const existingSignatures = new Set(existingRows.map((row) => buildDuplicateSignature(row)));
  const seenCodes = new Set<string>();
  const seenExternalIds = new Set<string>();
  const seenSignatures = new Set<string>();

  const previewRows: ImportPreviewRow[] = rows.map((row) => {
    const errors: string[] = [];
    let duplicateReason: string | null = null;

    const validation = createClienteSchema.safeParse({
      fullName: row.fullName,
      phone: row.phone,
      secondaryPhone: row.secondaryPhone,
      address: row.address,
      postalCode: row.postalCode,
      neighborhood: row.neighborhood,
      city: row.city,
      state: row.state,
      betweenStreets: row.betweenStreets,
      referencesNotes: row.referencesNotes,
      observations: row.observations,
      promotoriaId: null,
      isActive: row.isActive,
    });

    if (!validation.success) {
      errors.push(...validation.error.issues.map((issue) => issue.message));
    }

    if (row.code) {
      const normalizedCode = row.code.toUpperCase();
      if (existingCodes.has(normalizedCode)) {
        duplicateReason = 'Código ya existe en la base.';
      } else if (seenCodes.has(normalizedCode)) {
        duplicateReason = 'Código duplicado dentro del archivo.';
      }
      seenCodes.add(normalizedCode);
    }

    if (!duplicateReason && row.externalClientId) {
      const normalizedExternalId = row.externalClientId.toUpperCase();
      if (existingExternalIds.has(normalizedExternalId)) {
        duplicateReason = 'ID externo ya existe en la base.';
      } else if (seenExternalIds.has(normalizedExternalId)) {
        duplicateReason = 'ID externo duplicado dentro del archivo.';
      }
      seenExternalIds.add(normalizedExternalId);
    }

    const signature = buildDuplicateSignature({ fullName: row.fullName, phone: row.phone });
    if (!duplicateReason) {
      if (existingSignatures.has(signature)) {
        duplicateReason = 'Cliente duplicado por nombre y teléfono en la base.';
      } else if (seenSignatures.has(signature)) {
        duplicateReason = 'Cliente duplicado por nombre y teléfono dentro del archivo.';
      }
    }
    seenSignatures.add(signature);

    return {
      rowNumber: row.rowNumber,
      payload: row,
      duplicateReason,
      errors,
    };
  });

  return {
    totalRows: previewRows.length,
    validRows: previewRows.filter((row) => !row.errors.length && !row.duplicateReason),
    duplicateRows: previewRows.filter((row) => !row.errors.length && Boolean(row.duplicateReason)),
    errorRows: previewRows.filter((row) => row.errors.length > 0),
  };
}

async function importSingleRow(row: ImportPreviewRow, defaultClientTypeId: string) {
  const payload = row.payload;

  return prisma.$transaction(async (tx) => {
    const code = payload.code || (await generateNextClienteCode(tx));
    const normalized = normalizeClienteSearch({
      fullName: payload.fullName,
      phone: payload.phone,
      secondaryPhone: payload.secondaryPhone,
      address: payload.address,
    });

    const created = await tx.cliente.create({
      data: {
        externalClientId: payload.externalClientId,
        code,
        fullName: payload.fullName,
        phone: payload.phone,
        secondaryPhone: payload.secondaryPhone,
        address: payload.address,
        postalCode: payload.postalCode,
        neighborhood: payload.neighborhood,
        city: payload.city,
        state: payload.state,
        betweenStreets: payload.betweenStreets,
        referencesNotes: payload.referencesNotes,
        observations: payload.observations,
        clientTypeId: defaultClientTypeId,
        isActive: payload.isActive,
        ...normalized,
      },
    });

    return { id: created.id, code: created.code, fullName: created.fullName };
  }, IMPORT_TRANSACTION_OPTIONS);
}

export async function commitClienteImport(validRows: ImportPreviewRow[], userId: string): Promise<ImportCommitResult> {
  const imported: Array<{ id: string; code: string; fullName: string }> = [];
  const failedRows: ImportCommitErrorRow[] = [];

  if (!validRows.length) {
    return {
      imported,
      importedCount: 0,
      failedRows,
      failedCount: 0,
      batchSize: IMPORT_BATCH_SIZE,
    };
  }

  const defaultClientTypeRow = await prisma.clientTypeCatalog.findUnique({
    where: { code: 'NUEVO' },
    select: { id: true },
  });

  if (!defaultClientTypeRow) {
    throw new AppError('No existe el tipo de cliente NUEVO configurado.', 'CONFIGURATION_ERROR', 500);
  }

  const batches = chunkRows(validRows, IMPORT_BATCH_SIZE);

  for (const batch of batches) {
    for (const row of batch) {
      try {
        const created = await importSingleRow(row, defaultClientTypeRow.id);
        imported.push(created);
      } catch (error) {
        failedRows.push({
          rowNumber: row.rowNumber,
          externalClientId: row.payload.externalClientId,
          code: row.payload.code,
          fullName: row.payload.fullName,
          message: toCommitErrorMessage(error),
        });
      }
    }
  }

  for (const row of imported) {
    await writeAuditLog({
      userId,
      module: 'clientes',
      entity: 'Cliente',
      entityId: row.id,
      action: 'IMPORT',
      afterJson: row,
    });
  }

  return {
    imported,
    importedCount: imported.length,
    failedRows,
    failedCount: failedRows.length,
    batchSize: IMPORT_BATCH_SIZE,
  };
}

export async function exportClientes(format: 'csv' | 'xlsx') {
  const rows = await prisma.cliente.findMany({
    where: { deletedAt: null },
    orderBy: [{ createdAt: 'desc' }],
  });

  const exportRows = rows.map((row) => ({
    externalClientId: row.externalClientId,
    code: row.code,
    fullName: row.fullName,
    phone: row.phone,
    secondaryPhone: row.secondaryPhone,
    address: row.address,
    postalCode: row.postalCode,
    neighborhood: row.neighborhood,
    city: row.city,
    state: row.state,
    betweenStreets: row.betweenStreets,
    referencesNotes: row.referencesNotes,
    observations: row.observations,
    isActive: row.isActive,
  }));

  return exportClientesWorkbook(exportRows, format);
}

function escapeVCardValue(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function buildVCardAddress(input: {
  address: string;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  postalCode: string;
}) {
  const street = [input.address, input.neighborhood].filter(Boolean).join(', ');
  return `;;${escapeVCardValue(street)};${escapeVCardValue(input.city ?? '')};${escapeVCardValue(input.state ?? '')};${escapeVCardValue(input.postalCode)};MEXICO`;
}

export async function exportClientesVcf() {
  const rows = await prisma.cliente.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: [{ fullName: 'asc' }],
  });

  const cards = rows.map((row) => {
    const lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${escapeVCardValue(row.fullName)}`,
      `N:${escapeVCardValue(row.fullName)};;;;`,
      `TEL;TYPE=CELL:${escapeVCardValue(row.phone)}`,
    ];

    if (row.secondaryPhone) {
      lines.push(`TEL;TYPE=HOME:${escapeVCardValue(row.secondaryPhone)}`);
    }

    if (row.address || row.postalCode) {
      lines.push(`ADR;TYPE=HOME:${buildVCardAddress({
        address: row.address,
        neighborhood: row.neighborhood,
        city: row.city,
        state: row.state,
        postalCode: row.postalCode,
      })}`);
    }

    const noteParts = [
      row.code ? `Código: ${row.code}` : null,
      row.betweenStreets ? `Entre calles: ${row.betweenStreets}` : null,
      row.referencesNotes ? `Referencias: ${row.referencesNotes}` : null,
      row.observations ? `Observaciones: ${row.observations}` : null,
    ].filter(Boolean);

    if (noteParts.length > 0) {
      lines.push(`NOTE:${escapeVCardValue(noteParts.join(' | '))}`);
    }

    lines.push('END:VCARD');
    return lines.join('\r\n');
  });

  return Buffer.from(cards.join('\r\n'), 'utf8');
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function exportClientesVcfZip(batchSize = 500) {
  const rows = await prisma.cliente.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: [{ fullName: 'asc' }],
  });

  const zip = new JSZip();
  const groups = chunkArray(rows, batchSize);

  groups.forEach((group, index) => {
    const cards = group.map((row) => {
      const lines = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${escapeVCardValue(row.fullName)}`,
        `N:${escapeVCardValue(row.fullName)};;;;`,
        `TEL;TYPE=CELL:${escapeVCardValue(row.phone)}`,
      ];

      if (row.secondaryPhone) {
        lines.push(`TEL;TYPE=HOME:${escapeVCardValue(row.secondaryPhone)}`);
      }

      if (row.address || row.postalCode) {
        lines.push(`ADR;TYPE=HOME:${buildVCardAddress({
          address: row.address,
          neighborhood: row.neighborhood,
          city: row.city,
          state: row.state,
          postalCode: row.postalCode,
        })}`);
      }

      const noteParts = [
        row.code ? `Código: ${row.code}` : null,
        row.betweenStreets ? `Entre calles: ${row.betweenStreets}` : null,
        row.referencesNotes ? `Referencias: ${row.referencesNotes}` : null,
        row.observations ? `Observaciones: ${row.observations}` : null,
      ].filter(Boolean);

      if (noteParts.length > 0) {
        lines.push(`NOTE:${escapeVCardValue(noteParts.join(' | '))}`);
      }

      lines.push('END:VCARD');
      return lines.join('\r\n');
    });

    zip.file(`clientes-cresen-${String(index + 1).padStart(3, '0')}.vcf`, cards.join('\r\n'));
  });

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
