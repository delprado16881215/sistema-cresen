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

const optionalIsoDateString = () =>
  z.string().transform((value, ctx) => {
    if (!value) return value;
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

export const createPagoSchema = z.object({
  creditoId: z.string().cuid(),
  receivedAt: isoDateString('Captura la fecha del pago'),
  amountReceived: z.coerce.number().positive('Captura un monto mayor a 0').max(999999.99),
  penaltyChargeIds: z.array(z.string().cuid()).default([]),
  notes: z.string().max(500).optional().nullable(),
});

export const createFallaSchema = z.object({
  creditoId: z.string().cuid(),
  occurredAt: isoDateString('Captura la fecha de la falla'),
  notes: z.string().max(500).optional().nullable(),
});

export const reversePagoSchema = z.object({
  paymentEventId: z.string().cuid(),
  reason: z.string().trim().min(5, 'Captura un motivo más claro').max(240),
  notes: z.string().max(500).optional().nullable(),
});

export const reverseFallaSchema = z.object({
  defaultEventId: z.string().cuid(),
  reason: z.string().trim().min(5, 'Captura un motivo más claro').max(240),
  notes: z.string().max(500).optional().nullable(),
});

export const listPagosSchema = z.object({
  search: z.string().trim().max(100).optional(),
  promotoriaId: z.string().cuid().optional(),
  occurredAt: optionalIsoDateString().optional(),
  scope: z.enum(['active', 'active_with_extra_week', 'overdue', 'all']).default('active'),
});

export const impactPagoGrupoSchema = z.object({
  promotoriaId: z.string().cuid(),
  occurredAt: isoDateString('Captura la fecha de cobranza'),
  scope: z.enum(['active', 'active_with_extra_week', 'overdue', 'all']).default('active'),
  notes: z.string().max(500).optional().nullable(),
  liquidation: z.object({
    saleAmount: z.coerce.number().min(0).max(99999999.99),
    bonusAmount: z.coerce.number().min(0).max(99999999.99).default(0),
    commissionBase: z.enum(['SALE', 'TOTAL_TO_DELIVER']),
    commissionRate: z.enum(['10', '12.5', '15']),
  }),
  items: z
    .array(
      z.object({
        creditoId: z.string().cuid(),
        action: z.enum(['PAY', 'FAIL']),
        recoveryAmount: z.coerce.number().min(0).max(999999.99).default(0),
        advanceAmount: z.coerce.number().min(0).max(999999.99).default(0),
        extraWeekAmount: z.coerce.number().min(0).max(999999.99).default(0),
        partialFailureAmount: z.coerce.number().min(0).max(999999.99).default(0),
      }),
    )
    .min(1, 'No hay créditos para impactar.'),
});

export const saveGrupoLiquidacionSchema = z.object({
  promotoriaId: z.string().cuid(),
  occurredAt: isoDateString('Captura la fecha de cobranza'),
  scope: z.enum(['active', 'active_with_extra_week', 'overdue', 'all']).default('active'),
  saleAmount: z.coerce.number().min(0).max(99999999.99),
  bonusAmount: z.coerce.number().min(0).max(99999999.99).default(0),
  commissionBase: z.enum(['SALE', 'TOTAL_TO_DELIVER']),
  commissionRate: z.enum(['10', '12.5', '15']),
});

export type CreatePagoInput = z.infer<typeof createPagoSchema>;
export type CreateFallaInput = z.infer<typeof createFallaSchema>;
export type ReversePagoInput = z.infer<typeof reversePagoSchema>;
export type ReverseFallaInput = z.infer<typeof reverseFallaSchema>;
export type ListPagosInput = z.infer<typeof listPagosSchema>;
export type ImpactPagoGrupoInput = z.infer<typeof impactPagoGrupoSchema>;
export type SaveGrupoLiquidacionInput = z.infer<typeof saveGrupoLiquidacionSchema>;
