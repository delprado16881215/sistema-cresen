import { z } from 'zod';
import {
  EXPEDIENTE_ALERTA_SEVERIDADES,
  EXPEDIENTE_ALERTA_STATUS,
  EXPEDIENTE_ALERTA_TIPOS,
} from '@/server/services/expediente-alert-engine';

export const listExpedienteAlertasSchema = z.object({
  clienteId: z.string().trim().min(1).optional(),
  creditoId: z.string().trim().min(1).optional(),
  promotoriaId: z.string().trim().min(1).optional(),
  supervisionId: z.string().trim().min(1).optional(),
  tipoAlerta: z.enum(EXPEDIENTE_ALERTA_TIPOS).optional(),
  severidad: z.enum(EXPEDIENTE_ALERTA_SEVERIDADES).optional(),
  status: z.enum(EXPEDIENTE_ALERTA_STATUS).optional(),
  occurredAt: z.string().trim().optional(),
  refresh: z
    .union([z.literal('1'), z.literal('true'), z.literal('0'), z.literal('false')])
    .optional()
    .transform((value) => {
      if (value == null) return undefined;
      return value === '1' || value === 'true';
    }),
});

export const updateExpedienteAlertaSchema = z.object({
  status: z.enum(EXPEDIENTE_ALERTA_STATUS),
  reviewNotes: z.string().trim().max(1000).optional().nullable(),
});
