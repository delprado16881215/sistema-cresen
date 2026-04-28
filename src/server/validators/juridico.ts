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

export const juridicoWorkbenchStatusSchema = z.enum([
  'all',
  'PRELEGAL',
  'LEGAL_REVIEW',
  'IN_LAWSUIT',
]);

export const listJuridicoCasesSchema = z.object({
  promotoriaId: z.string().cuid().optional(),
  supervisionId: z.string().cuid().optional(),
  legalStatus: juridicoWorkbenchStatusSchema.default('all'),
  sentToLegalDate: z
    .string()
    .trim()
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
    }),
});

export const changeCreditoLegalStatusSchema = z.object({
  fecha: isoDateString('Captura la fecha del movimiento jurídico'),
  nextStatus: z.enum(['LEGAL_REVIEW', 'IN_LAWSUIT', 'LEGAL_CLOSED']),
  motivo: z.string().trim().min(3, 'Captura un motivo claro').max(300),
  observaciones: z.string().trim().max(1000).optional().nullable(),
});

export const createCreditoLegalNoteSchema = z.object({
  fecha: isoDateString('Captura la fecha de la nota jurídica'),
  motivo: z.string().trim().min(3, 'Captura un asunto claro').max(300),
  observaciones: z.string().trim().max(2000).optional().nullable(),
});

export type ListJuridicoCasesInput = z.infer<typeof listJuridicoCasesSchema>;
export type ChangeCreditoLegalStatusInput = z.infer<typeof changeCreditoLegalStatusSchema>;
export type CreateCreditoLegalNoteInput = z.infer<typeof createCreditoLegalNoteSchema>;
