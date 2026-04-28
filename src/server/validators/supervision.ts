import { z } from 'zod';

const supervisionFieldsSchema = z.object({
  code: z.string().trim().min(2, 'Captura una clave válida').max(40).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(3, 'Captura un nombre válido').max(140).transform((value) => value.toUpperCase()),
  isActive: z.boolean().default(true),
});

export const createSupervisionSchema = supervisionFieldsSchema;

export const updateSupervisionSchema = supervisionFieldsSchema.extend({
  id: z.string().cuid(),
});

export const listSupervisionesSchema = z.object({
  search: z.string().optional(),
  isActive: z.enum(['all', 'true', 'false']).default('all'),
});

export type CreateSupervisionInput = z.infer<typeof createSupervisionSchema>;
export type UpdateSupervisionInput = z.infer<typeof updateSupervisionSchema>;
