import { z } from 'zod';

export const cobranzaRutasQuerySchema = z.object({
  occurredAt: z.string().trim().optional(),
  supervisionId: z.string().trim().min(1).optional(),
  promotoriaId: z.string().trim().min(1).optional(),
  zone: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(40).optional(),
  mode: z.enum(['balanced', 'urgent', 'verification']).optional(),
});
