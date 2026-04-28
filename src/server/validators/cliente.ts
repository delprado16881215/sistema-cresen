import { z } from 'zod';
import {
  normalizeOptionalPhone,
  normalizePhone,
  normalizePostalCode,
  toUppercaseValue,
} from '@/modules/clientes/cliente-normalizers';

const requiredUppercaseString = (min: number, max: number) =>
  z.string().min(min).max(max).transform((value) => toUppercaseValue(value) ?? '');

const optionalUppercaseString = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => toUppercaseValue(value));

const optionalCoordinate = (min: number, max: number, label: string) =>
  z
    .number({
      invalid_type_error: `${label} debe ser numérica`,
    })
    .min(min, `${label} fuera de rango`)
    .max(max, `${label} fuera de rango`)
    .optional()
    .nullable();

const clienteEditableFieldsSchemaBase = z.object({
  fullName: requiredUppercaseString(5, 140),
  phone: z
    .string()
    .transform((value) => normalizePhone(value))
    .refine((value) => value.length === 10, 'Captura un telefono de 10 digitos'),
  secondaryPhone: z
    .string()
    .optional()
    .nullable()
    .transform((value) => normalizeOptionalPhone(value))
    .refine((value) => value === null || value.length === 10, 'Captura un telefono secundario de 10 digitos'),
  address: requiredUppercaseString(5, 200),
  postalCode: z
    .string()
    .transform((value) => normalizePostalCode(value))
    .refine((value) => value.length === 5, 'Captura un codigo postal de 5 digitos'),
  neighborhood: optionalUppercaseString(120),
  city: optionalUppercaseString(120),
  state: optionalUppercaseString(120),
  betweenStreets: optionalUppercaseString(200),
  referencesNotes: optionalUppercaseString(400),
  observations: optionalUppercaseString(400),
  manualGeoLatitude: optionalCoordinate(-90, 90, 'Latitud'),
  manualGeoLongitude: optionalCoordinate(-180, 180, 'Longitud'),
  manualGeoIsApproximate: z.boolean().default(false),
  manualGeoObservation: optionalUppercaseString(160),
  isActive: z.boolean().default(true),
});

function withClienteGeoValidation<T extends z.ZodTypeAny>(schema: T) {
  return schema.refine((value) => {
    const candidate = value as {
      manualGeoLatitude?: number | null;
      manualGeoLongitude?: number | null;
    };
    const hasLat = typeof candidate.manualGeoLatitude === 'number';
    const hasLng = typeof candidate.manualGeoLongitude === 'number';
    return hasLat === hasLng;
  }, {
    message: 'Captura latitud y longitud juntas o deja ambas vacias',
    path: ['manualGeoLatitude'],
  });
}

const clienteEditableFieldsSchema = withClienteGeoValidation(clienteEditableFieldsSchemaBase);

export const createClienteSchema = clienteEditableFieldsSchema;

export const updateClienteSchema = withClienteGeoValidation(clienteEditableFieldsSchemaBase.partial().extend({
  id: z.string().cuid(),
}));

export const listClientesSchema = z.object({
  search: z.string().optional(),
  isActive: z.enum(['all', 'true', 'false']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(10),
});

export type CreateClienteInput = z.infer<typeof createClienteSchema>;
export type UpdateClienteInput = z.infer<typeof updateClienteSchema>;
export type ListClientesInput = z.infer<typeof listClientesSchema>;
