import * as XLSX from 'xlsx';
import { normalizeText } from '@/lib/utils';
import {
  normalizeOptionalPhone,
  normalizePhone,
  normalizePostalCode,
  toUppercaseValue,
} from '@/modules/clientes/cliente-normalizers';

export const CLIENT_EXPORT_COLUMNS = [
  'externalClientId',
  'code',
  'fullName',
  'phone',
  'secondaryPhone',
  'address',
  'postalCode',
  'neighborhood',
  'city',
  'state',
  'betweenStreets',
  'referencesNotes',
  'observations',
  'isActive',
] as const;

const COLUMN_ALIASES: Record<string, string[]> = {
  externalClientId: ['externalclientid', 'external_client_id', 'id_cliente', 'cliente_id', 'legacy_id'],
  code: ['code', 'codigo', 'cliente_code'],
  fullName: ['fullname', 'full_name', 'nombre', 'nombre_completo'],
  phone: ['phone', 'telefono', 'tel', 'celular'],
  secondaryPhone: ['secondaryphone', 'secondary_phone', 'telefono_secundario', 'telefono2', 'tel2'],
  address: ['address', 'direccion', 'domicilio'],
  postalCode: ['postalcode', 'postal_code', 'cp', 'codigo_postal'],
  neighborhood: ['neighborhood', 'colonia'],
  city: ['city', 'ciudad', 'municipio_ciudad'],
  state: ['state', 'estado'],
  betweenStreets: ['betweenstreets', 'between_streets', 'entre_calles'],
  referencesNotes: ['referencesnotes', 'references_notes', 'referencias'],
  observations: ['observations', 'observaciones'],
  isActive: ['isactive', 'is_active', 'activo'],
};

export type ParsedImportClienteRow = {
  rowNumber: number;
  raw: Record<string, string | number | boolean | null>;
  externalClientId: string | null;
  code: string | null;
  fullName: string;
  phone: string;
  secondaryPhone: string | null;
  address: string;
  postalCode: string;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  betweenStreets: string | null;
  referencesNotes: string | null;
  observations: string | null;
  isActive: boolean;
};

function normalizeHeader(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getCanonicalHeader(header: string) {
  const normalized = normalizeHeader(header);
  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
    if ([canonical.toLowerCase(), ...aliases].includes(normalized)) {
      return canonical;
    }
  }
  return normalized;
}

function toNullableString(value: unknown) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function toBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return true;
  return ['1', 'true', 'si', 'sí', 'activo', 'activa', 'yes'].includes(text);
}

export function parseImportWorkbook(buffer: Buffer, fileName: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('El archivo no contiene hojas para importar.');
  }

  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error(`No se pudo leer la hoja principal del archivo ${fileName}.`);
  }
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: null,
    raw: false,
  });

  return rows.map((row, index) => {
    const mapped = Object.entries(row).reduce<Record<string, unknown>>((acc, [key, value]) => {
      acc[getCanonicalHeader(key)] = value;
      return acc;
    }, {});

    return {
      rowNumber: index + 2,
      raw: Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, value == null ? null : (value as string | number | boolean)]),
      ) as Record<string, string | number | boolean | null>,
      externalClientId: toUppercaseValue(toNullableString(mapped.externalClientId)) ?? null,
      code: toUppercaseValue(toNullableString(mapped.code)) ?? null,
      fullName: toUppercaseValue(toNullableString(mapped.fullName)) ?? '',
      phone: normalizePhone(toNullableString(mapped.phone)),
      secondaryPhone: normalizeOptionalPhone(toNullableString(mapped.secondaryPhone)),
      address: toUppercaseValue(toNullableString(mapped.address)) ?? '',
      postalCode: normalizePostalCode(toNullableString(mapped.postalCode)),
      neighborhood: toUppercaseValue(toNullableString(mapped.neighborhood)) ?? null,
      city: toUppercaseValue(toNullableString(mapped.city)) ?? null,
      state: toUppercaseValue(toNullableString(mapped.state)) ?? null,
      betweenStreets: toUppercaseValue(toNullableString(mapped.betweenStreets)) ?? null,
      referencesNotes: toUppercaseValue(toNullableString(mapped.referencesNotes)) ?? null,
      observations: toUppercaseValue(toNullableString(mapped.observations)) ?? null,
      isActive: toBoolean(mapped.isActive),
    } satisfies ParsedImportClienteRow;
  });
}

export function exportClientesWorkbook(rows: Array<Record<string, string | boolean | null>>, format: 'csv' | 'xlsx') {
  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: [...CLIENT_EXPORT_COLUMNS],
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Clientes');

  if (format === 'csv') {
    return Buffer.from(XLSX.utils.sheet_to_csv(worksheet), 'utf8');
  }

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export function buildDuplicateSignature(input: { fullName: string; phone: string }) {
  return normalizeText(`${input.fullName}|${input.phone}`);
}
