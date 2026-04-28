import { z } from 'zod';
import { parseFlexibleDateInput } from '@/lib/date-input';
import { normalizeOptionalPhone } from '@/modules/clientes/cliente-normalizers';

export const INTERACCION_TIPOS = ['CALL', 'WHATSAPP', 'SMS', 'VISIT', 'NOTE'] as const;
export const INTERACCION_CANALES = ['PHONE', 'WHATSAPP', 'SMS', 'IN_PERSON', 'OTHER'] as const;
export const INTERACCION_RESULTADOS = [
  'NO_ANSWER',
  'CONTACTED',
  'PROMISE_REGISTERED',
  'PAID_REPORTED',
  'REFUSED',
  'WRONG_NUMBER',
  'NOT_AVAILABLE',
  'FOLLOW_UP_REQUIRED',
  'OTHER',
] as const;
export const PROMESA_PAGO_ESTADOS = ['PENDING', 'FULFILLED', 'BROKEN', 'CANCELLED'] as const;
export const VISITA_CAMPO_RESULTADOS = [
  'VISIT_SUCCESSFUL',
  'CLIENT_NOT_HOME',
  'ADDRESS_NOT_FOUND',
  'PAYMENT_COLLECTED_REPORTED',
  'FOLLOW_UP_REQUIRED',
  'REFUSED_CONTACT',
  'OTHER',
] as const;

function buildDateTime(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  seconds: number,
) {
  const date = new Date(year, month - 1, day, hours, minutes, seconds, 0);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hours ||
    date.getMinutes() !== minutes ||
    date.getSeconds() !== seconds
  ) {
    return null;
  }
  return date;
}

function parseDateTimeInput(value: string | Date | null | undefined) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  const localMatch = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (localMatch) {
    const [, year, month, day, hours, minutes, secondsRaw] = localMatch;
    return buildDateTime(
      Number(year),
      Number(month),
      Number(day),
      Number(hours),
      Number(minutes),
      Number(secondsRaw ?? '0'),
    );
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function nullableTrimmedString(max: number) {
  return z.preprocess((value) => {
    if (value == null) return null;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }, z.string().max(max).nullable());
}

function optionalInteger(min: number, max: number) {
  return z.preprocess((value) => {
    if (value === '' || value == null) return undefined;
    return value;
  }, z.coerce.number().int().min(min).max(max).optional());
}

function optionalDecimal(min: number, max: number) {
  return z.preprocess((value) => {
    if (value === '' || value == null) return undefined;
    return value;
  }, z.coerce.number().min(min).max(max).optional());
}

function optionalPhone() {
  return z.preprocess((value) => {
    if (value == null) return null;
    if (typeof value !== 'string') return value;
    return normalizeOptionalPhone(value);
  }, z.string().length(10, 'Captura un telefono de 10 digitos').nullable());
}

function requiredDateTime(message: string) {
  return z.string().min(1, message).transform((value, ctx) => {
    const parsed = parseDateTimeInput(value);
    if (!parsed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Captura una fecha y hora válidas',
      });
      return z.NEVER;
    }
    return parsed;
  });
}

function requiredDate(message: string) {
  return z.string().min(1, message).transform((value, ctx) => {
    const parsed = parseFlexibleDateInput(value);
    if (!parsed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Captura una fecha válida',
      });
      return z.NEVER;
    }
    return parsed;
  });
}

export const createInteraccionSchema = z.object({
  clienteId: z.string().cuid(),
  creditoId: z.string().cuid().optional().nullable(),
  tipo: z.enum(INTERACCION_TIPOS),
  canal: z.enum(INTERACCION_CANALES).optional().nullable(),
  resultado: z.enum(INTERACCION_RESULTADOS),
  fechaHora: requiredDateTime('Captura la fecha y hora de la interacción'),
  duracionSegundos: optionalInteger(0, 86400),
  notas: nullableTrimmedString(1000),
  telefonoUsado: optionalPhone(),
});

export const listInteraccionesSchema = z
  .object({
    clienteId: z.string().cuid().optional(),
    creditoId: z.string().cuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((value) => Boolean(value.clienteId || value.creditoId), {
    message: 'Indica un cliente o un crédito para consultar interacciones',
    path: ['clienteId'],
  });

export const createPromesaPagoSchema = z.object({
  clienteId: z.string().cuid(),
  creditoId: z.string().cuid().optional().nullable(),
  interaccionId: z.string().cuid().optional().nullable(),
  fechaPromesa: requiredDate('Captura la fecha de la promesa'),
  montoPrometido: optionalDecimal(0.01, 999999.99).nullable().optional(),
  notas: nullableTrimmedString(1000),
});

export const listPromesasPagoSchema = z
  .object({
    clienteId: z.string().cuid().optional(),
    creditoId: z.string().cuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((value) => Boolean(value.clienteId || value.creditoId), {
    message: 'Indica un cliente o un crédito para consultar promesas',
    path: ['clienteId'],
  });

export const updatePromesaPagoEstadoSchema = z.object({
  estado: z.enum(PROMESA_PAGO_ESTADOS).refine((value) => value !== 'PENDING', {
    message: 'Selecciona un estado final válido para la promesa',
  }),
  notas: nullableTrimmedString(1000),
});

export const createVisitaCampoSchema = z
  .object({
    clienteId: z.string().cuid(),
    creditoId: z.string().cuid().optional().nullable(),
    interaccionId: z.string().cuid().optional().nullable(),
    fechaHora: requiredDateTime('Captura la fecha y hora de la visita'),
    resultado: z.enum(VISITA_CAMPO_RESULTADOS),
    notas: nullableTrimmedString(1000),
    direccionTexto: nullableTrimmedString(400),
    referenciaLugar: nullableTrimmedString(400),
    latitud: optionalDecimal(-90, 90),
    longitud: optionalDecimal(-180, 180),
  })
  .superRefine((value, ctx) => {
    const hasLat = typeof value.latitud === 'number';
    const hasLng = typeof value.longitud === 'number';

    if (hasLat !== hasLng) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Captura latitud y longitud juntas o deja ambas vacías',
        path: hasLat ? ['longitud'] : ['latitud'],
      });
    }
  });

export const listVisitasCampoSchema = z
  .object({
    clienteId: z.string().cuid().optional(),
    creditoId: z.string().cuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((value) => Boolean(value.clienteId || value.creditoId), {
    message: 'Indica un cliente o un crédito para consultar visitas',
    path: ['clienteId'],
  });

export type CreateInteraccionInput = z.infer<typeof createInteraccionSchema>;
export type ListInteraccionesInput = z.infer<typeof listInteraccionesSchema>;
export type CreatePromesaPagoInput = z.infer<typeof createPromesaPagoSchema>;
export type ListPromesasPagoInput = z.infer<typeof listPromesasPagoSchema>;
export type UpdatePromesaPagoEstadoInput = z.infer<typeof updatePromesaPagoEstadoSchema>;
export type CreateVisitaCampoInput = z.infer<typeof createVisitaCampoSchema>;
export type ListVisitasCampoInput = z.infer<typeof listVisitasCampoSchema>;
