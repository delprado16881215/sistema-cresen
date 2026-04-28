import { z } from 'zod';
import {
  createInteraccionSchema,
  createPromesaPagoSchema,
  createVisitaCampoSchema,
} from '@/server/validators/cobranza-operativa';

const syncTimestampSchema = z.string().datetime({ offset: true }).or(z.string().datetime());

export const offlineRouteSnapshotsSchema = z.object({
  occurredAt: z.string().min(1),
  creditoIds: z.array(z.string().cuid()).min(1).max(40),
});

export const cobranzaSyncEventSchema = z.discriminatedUnion('type', [
  z.object({
    eventId: z.string().uuid(),
    type: z.literal('INTERACTION'),
    createdAt: syncTimestampSchema,
    payload: createInteraccionSchema,
  }),
  z.object({
    eventId: z.string().uuid(),
    type: z.literal('PROMESA'),
    createdAt: syncTimestampSchema,
    payload: createPromesaPagoSchema,
  }),
  z.object({
    eventId: z.string().uuid(),
    type: z.literal('VISITA'),
    createdAt: syncTimestampSchema,
    payload: createVisitaCampoSchema,
  }),
]);

export const cobranzaSyncRequestSchema = z.object({
  events: z.array(cobranzaSyncEventSchema).min(1).max(100),
});

export type CobranzaSyncEvent = z.infer<typeof cobranzaSyncEventSchema>;
export type CobranzaSyncRequest = z.infer<typeof cobranzaSyncRequestSchema>;
