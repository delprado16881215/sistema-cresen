import { z } from 'zod';
import {
  COMMUNICATION_CHANNELS,
  COMMUNICATION_SOURCE_CONTEXTS,
  MESSAGE_TYPES,
  findInvalidTemplateVariables,
} from '@/lib/communications';

function nullableTrimmedString(max: number) {
  return z.preprocess((value) => {
    if (value == null) return null;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }, z.string().max(max).nullable());
}

const communicationChannelSchema = z.enum(COMMUNICATION_CHANNELS);
const messageTypeSchema = z.enum(MESSAGE_TYPES);
const communicationSourceContextSchema = z.enum(COMMUNICATION_SOURCE_CONTEXTS);

function validateTemplateVariables(
  input: {
    subject?: string | null;
    content: string;
  },
  ctx: z.RefinementCtx,
) {
  const invalidVariables = findInvalidTemplateVariables(input);

  if (!invalidVariables.length) {
    return;
  }

  const message = `Variables no permitidas: ${invalidVariables.map((item) => `{{${item}}}`).join(', ')}`;

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message,
    path: ['content'],
  });
}

export const listMessageTemplatesSchema = z.object({
  activeOnly: z.preprocess((value) => {
    if (value === undefined || value === null || value === '') return true;
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  }, z.boolean()),
  type: messageTypeSchema.optional(),
  channel: communicationChannelSchema.optional(),
});

export const createMessageTemplateSchema = z
  .object({
    name: z.string().trim().min(3, 'Captura un nombre claro').max(120),
    type: messageTypeSchema,
    channel: communicationChannelSchema,
    subject: nullableTrimmedString(200),
    content: z.string().trim().min(3, 'Captura el contenido de la plantilla').max(4000),
    isActive: z.boolean().default(true),
  })
  .superRefine((value, ctx) => validateTemplateVariables(value, ctx));

export const updateMessageTemplateSchema = createMessageTemplateSchema;

const communicationDraftSchema = z
  .object({
    clienteId: z.string().cuid(),
    creditoId: z.string().cuid().optional().nullable(),
    sourceContext: communicationSourceContextSchema,
    templateId: z.string().cuid().optional().nullable(),
    type: messageTypeSchema.optional().nullable(),
    channel: communicationChannelSchema.optional().nullable(),
    recipient: z.string().trim().min(3, 'Captura un destinatario').max(200),
    subject: nullableTrimmedString(200),
    content: nullableTrimmedString(4000),
  })
  .superRefine((value, ctx) => {
    if (!value.templateId && (!value.type || !value.channel || !value.content)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Selecciona una plantilla o captura canal, tipo y contenido manual.',
        path: ['templateId'],
      });
    }

    if (value.content) {
      validateTemplateVariables(
        {
          subject: value.subject,
          content: value.content,
        },
        ctx,
      );
    }
  });

export const previewCommunicationSchema = communicationDraftSchema;

export const sendCommunicationSchema = communicationDraftSchema;

export type ListMessageTemplatesInput = z.infer<typeof listMessageTemplatesSchema>;
export type CreateMessageTemplateInput = z.infer<typeof createMessageTemplateSchema>;
export type UpdateMessageTemplateInput = z.infer<typeof updateMessageTemplateSchema>;
export type PreviewCommunicationInput = z.infer<typeof previewCommunicationSchema>;
export type SendCommunicationInput = z.infer<typeof sendCommunicationSchema>;
