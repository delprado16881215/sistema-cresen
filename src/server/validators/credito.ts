import { z } from 'zod';
import { normalizeToIsoDate } from '@/lib/date-input';

const isoDateString = (requiredMessage: string) =>
  z.string().min(1, requiredMessage).transform((value, ctx) => {
    const normalized = normalizeToIsoDate(value);
    if (!normalized) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Captura una fecha válida',
      });
      return z.NEVER;
    }
    return normalized;
  });

export const createCreditoSchema = z.object({
  clienteId: z.string().cuid(),
  avalClienteId: z.string().cuid().nullable().optional(),
  principalAmount: z.coerce.number().positive('Captura un monto mayor a 0').max(999999.99),
  planCode: z.enum(['PLAN_12', 'PLAN_15']),
  promotoriaId: z.string().cuid(),
  startDate: isoDateString('Captura la fecha del crédito'),
  notes: z.string().max(500).optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.avalClienteId && data.avalClienteId === data.clienteId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['avalClienteId'],
      message: 'El aval debe ser diferente al cliente acreditado.',
    });
  }
});

export const createCreditoGroupItemSchema = z.object({
  clienteId: z.string().cuid(),
  avalClienteId: z.string().cuid().nullable().optional(),
  principalAmount: z.coerce.number().positive('Captura un monto mayor a 0').max(999999.99),
  planCode: z.enum(['PLAN_12', 'PLAN_15']),
  notes: z.string().max(500).optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.avalClienteId && data.avalClienteId === data.clienteId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['avalClienteId'],
      message: 'El aval debe ser diferente al cliente acreditado.',
    });
  }
});

export const createCreditoGroupSchema = z.object({
  promotoriaId: z.string().cuid(),
  startDate: isoDateString('Captura la fecha de la venta'),
  items: z.array(createCreditoGroupItemSchema).min(1, 'Agrega al menos un cliente a la venta.'),
});

export const listCreditosSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(50).default(10),
  filter: z.enum(['all', 'active', 'with_failures', 'pending_today', 'paid', 'overdue']).default('all'),
  saleDate: z
    .string()
    .trim()
    .optional()
    .transform((value, ctx) => {
      if (!value) return undefined;
      const normalized = normalizeToIsoDate(value);
      if (!normalized) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Captura una fecha de venta válida',
        });
        return z.NEVER;
      }
      return normalized;
    }),
});

export const correctCreditoAcreditadoSchema = z.object({
  creditoId: z.string().cuid(),
  clienteId: z.string().cuid(),
  reason: z.string().trim().max(500).optional().nullable(),
});

export const correctCreditoAvalSchema = z.object({
  creditoId: z.string().cuid(),
  clienteId: z.string().cuid(),
  reason: z.string().trim().max(500).optional().nullable(),
});

export const sendCreditoToLegalSchema = z.object({
  fecha: isoDateString('Captura la fecha de envío a jurídico'),
  motivo: z.string().trim().min(3, 'Captura un motivo claro').max(300),
  observaciones: z.string().trim().max(1000).optional().nullable(),
});

export type CreateCreditoInput = z.infer<typeof createCreditoSchema>;
export type CreateCreditoGroupInput = z.infer<typeof createCreditoGroupSchema>;
export type ListCreditosInput = z.infer<typeof listCreditosSchema>;
export type CorrectCreditoAcreditadoInput = z.infer<typeof correctCreditoAcreditadoSchema>;
export type CorrectCreditoAvalInput = z.infer<typeof correctCreditoAvalSchema>;
export type SendCreditoToLegalInput = z.infer<typeof sendCreditoToLegalSchema>;
