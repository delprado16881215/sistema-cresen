import { z } from 'zod';
import { normalizeToIsoDate } from '@/lib/date-input';

const optionalIsoDateString = () =>
  z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (!value) return undefined;
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

export const cobranzaRiskQuerySchema = z
  .object({
    creditoId: z.string().cuid().optional(),
    clienteId: z.string().cuid().optional(),
    occurredAt: optionalIsoDateString(),
  })
  .refine((value) => Boolean(value.creditoId || value.clienteId), {
    message: 'Indica un crédito o un cliente para calcular el riesgo',
    path: ['creditoId'],
  })
  .refine((value) => !(value.creditoId && value.clienteId), {
    message: 'Consulta el riesgo por crédito o por cliente, no ambos a la vez',
    path: ['creditoId'],
  });

export type CobranzaRiskQueryInput = z.infer<typeof cobranzaRiskQuerySchema>;
