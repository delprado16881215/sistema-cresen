import * as XLSX from 'xlsx';

const CREDIT_IMPORT_HEADERS = [
  'ID_VENTA',
  'NRO_CONTROL',
  'FECHA',
  'ID_CLIENTE',
  'ID_AVAL',
  'MONTO_VENTA',
  'MONTO_CUOTAS',
  'NRO_SEMANA',
  'MONTO_PAGAR',
  'ID_PROMOTORA',
  'ESTADO',
  'OBSERVACIONES',
] as const;

const COLUMN_ALIASES: Record<string, string[]> = {
  ID_VENTA: ['id_venta', 'sale_id', 'venta_id'],
  NRO_CONTROL: ['nro_control', 'numero_control', 'control_number'],
  FECHA: ['fecha', 'start_date'],
  ID_CLIENTE: ['id_cliente', 'cliente_id'],
  ID_AVAL: ['id_aval', 'aval_id'],
  MONTO_VENTA: ['monto_venta', 'principal', 'monto_prestado'],
  MONTO_CUOTAS: ['monto_cuotas', 'monto_cuota', 'weekly_amount'],
  NRO_SEMANA: ['nro_semana', 'numero_semana', 'weeks'],
  MONTO_PAGAR: ['monto_pagar', 'total_pagar', 'total_amount'],
  ID_PROMOTORA: ['id_promotora', 'promotoria_id'],
  ESTADO: ['estado', 'status'],
  OBSERVACIONES: ['observaciones', 'notes'],
};

export type ParsedImportCreditoRow = {
  rowNumber: number;
  raw: Record<string, string | number | boolean | null>;
  saleId: string;
  controlNumber: number;
  startDate: string;
  receivedStartDate: string | number | boolean | null;
  clientExternalId: string;
  receivedClientExternalId: string | number | boolean | null;
  avalExternalId: string | null;
  receivedAvalExternalId: string | number | boolean | null;
  principalAmount: number;
  weeklyAmount: number;
  totalWeeks: number;
  totalPayableAmount: number;
  promotoriaExternalId: string;
  receivedPromotoriaExternalId: string | number | boolean | null;
  statusCode: string;
  notes: string | null;
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

function toRequiredString(value: unknown) {
  return toNullableString(value)?.toUpperCase() ?? '';
}

function formatDateParts(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return '';
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function toDateString(value: unknown) {
  if (value === undefined || value === null || value === '') return '';

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return '';
    return formatDateParts(parsed.y, parsed.m, parsed.d);
  }

  const text = String(value).trim();
  if (!text) return '';

  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (slashMatch) {
    const [, dayText = '', monthText = '', yearText = ''] = slashMatch;
    const day = Number.parseInt(dayText, 10);
    const month = Number.parseInt(monthText, 10);
    const rawYear = Number.parseInt(yearText, 10);
    const year = yearText.length === 2 ? 2000 + rawYear : rawYear;
    return formatDateParts(year, month, day) || text;
  }

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, yearText = '', monthText = '', dayText = ''] = isoMatch;
    const year = Number.parseInt(yearText, 10);
    const month = Number.parseInt(monthText, 10);
    const day = Number.parseInt(dayText, 10);
    return formatDateParts(year, month, day) || text;
  }

  const parsed = new Date(text.includes('T') ? text : `${text}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toISOString().slice(0, 10);
}

function toNumber(value: unknown) {
  if (typeof value === 'number') return value;
  const text = String(value ?? '').replace(/,/g, '').trim();
  if (!text) return NaN;
  return Number(text);
}

export function parseCreditoImportWorkbook(buffer: Buffer, fileName: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
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
    raw: true,
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
      saleId: toRequiredString(mapped.ID_VENTA),
      controlNumber: Math.trunc(toNumber(mapped.NRO_CONTROL)),
      startDate: toDateString(mapped.FECHA),
      receivedStartDate: (mapped.FECHA ?? null) as string | number | boolean | null,
      clientExternalId: toRequiredString(mapped.ID_CLIENTE),
      receivedClientExternalId: (mapped.ID_CLIENTE ?? null) as string | number | boolean | null,
      avalExternalId: toNullableString(mapped.ID_AVAL)?.toUpperCase() ?? null,
      receivedAvalExternalId: (mapped.ID_AVAL ?? null) as string | number | boolean | null,
      principalAmount: toNumber(mapped.MONTO_VENTA),
      weeklyAmount: toNumber(mapped.MONTO_CUOTAS),
      totalWeeks: Math.trunc(toNumber(mapped.NRO_SEMANA)),
      totalPayableAmount: toNumber(mapped.MONTO_PAGAR),
      promotoriaExternalId: toRequiredString(mapped.ID_PROMOTORA),
      receivedPromotoriaExternalId: (mapped.ID_PROMOTORA ?? null) as string | number | boolean | null,
      statusCode: toRequiredString(mapped.ESTADO),
      notes: toNullableString(mapped.OBSERVACIONES)?.toUpperCase() ?? null,
    } satisfies ParsedImportCreditoRow;
  });
}

export function exportCreditosImportWorkbook(format: 'csv' | 'xlsx') {
  const worksheet = XLSX.utils.json_to_sheet([
    {
      ID_VENTA: 1,
      NRO_CONTROL: 11,
      FECHA: '17/03/2026',
      ID_CLIENTE: 1,
      ID_AVAL: 2,
      MONTO_VENTA: 2000,
      MONTO_CUOTAS: 250,
      NRO_SEMANA: 12,
      MONTO_PAGAR: 3000,
      ID_PROMOTORA: 'VICTORIA GUTIERREZ MORALES',
      ESTADO: 'ACTIVE',
      OBSERVACIONES: 'COLOCACION INICIAL',
    },
    {
      ID_VENTA: 2,
      NRO_CONTROL: 11,
      FECHA: '17/03/2026',
      ID_CLIENTE: 34,
      ID_AVAL: '',
      MONTO_VENTA: 2000,
      MONTO_CUOTAS: 250,
      NRO_SEMANA: 12,
      MONTO_PAGAR: 3000,
      ID_PROMOTORA: 'VICTORIA GUTIERREZ MORALES',
      ESTADO: 'ACTIVE',
      OBSERVACIONES: 'SIN AVAL',
    },
    {
      ID_VENTA: 35,
      NRO_CONTROL: 12,
      FECHA: '24/03/2026',
      ID_CLIENTE: 885,
      ID_AVAL: 912,
      MONTO_VENTA: 1800,
      MONTO_CUOTAS: 225,
      NRO_SEMANA: 12,
      MONTO_PAGAR: 2700,
      ID_PROMOTORA: 'VICTORIA GUTIERREZ MORALES',
      ESTADO: 'ACTIVE',
      OBSERVACIONES: 'RENOVACION',
    },
  ], { header: [...CREDIT_IMPORT_HEADERS] });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Creditos');

  if (format === 'csv') {
    return Buffer.from(XLSX.utils.sheet_to_csv(worksheet), 'utf8');
  }

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
