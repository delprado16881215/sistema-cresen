import { z } from 'zod';

const promotoriaFieldsSchema = z.object({
  code: z.string().trim().min(2, 'Captura una clave válida').max(40).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(3, 'Captura un nombre válido').max(140).transform((value) => value.toUpperCase()),
  supervisionId: z.string().cuid('Selecciona una supervisión válida'),
  isActive: z.boolean().default(true),
});

export const createPromotoriaSchema = promotoriaFieldsSchema;

export const updatePromotoriaSchema = promotoriaFieldsSchema.extend({
  id: z.string().cuid(),
});

export const listPromotoriasSchema = z.object({
  search: z.string().optional(),
  isActive: z.enum(['all', 'true', 'false']).default('all'),
});

export type CreatePromotoriaInput = z.infer<typeof createPromotoriaSchema>;
export type UpdatePromotoriaInput = z.infer<typeof updatePromotoriaSchema>;
