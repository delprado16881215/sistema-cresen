import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AppError, toErrorMessage } from '@/lib/errors';
import { requireCommunicationTemplateWritePermission } from '@/server/policies/communications-guard';
import { updateMessageTemplate } from '@/server/services/communications-service';
import { updateMessageTemplateSchema } from '@/server/validators/comunicaciones';

type Params = Promise<{ templateId: string }>;

export async function PATCH(
  request: Request,
  context: { params: Params },
) {
  try {
    const session = await requireCommunicationTemplateWritePermission();
    const { templateId } = await context.params;
    const payload = await request.json();
    const parsed = updateMessageTemplateSchema.parse(payload);

    const updated = await updateMessageTemplate(templateId, parsed, session.user.id);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: 'Datos inválidos', issues: error.flatten() }, { status: 422 });
    }
    if (error instanceof AppError) {
      return NextResponse.json({ message: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ message: toErrorMessage(error) }, { status: 500 });
  }
}
