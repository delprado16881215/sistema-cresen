import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AppError, toErrorMessage } from '@/lib/errors';
import {
  requireCommunicationTemplateReadPermission,
  requireCommunicationTemplateWritePermission,
} from '@/server/policies/communications-guard';
import {
  createMessageTemplate,
  listMessageTemplates,
} from '@/server/services/communications-service';
import {
  createMessageTemplateSchema,
  listMessageTemplatesSchema,
} from '@/server/validators/comunicaciones';

export async function GET(request: Request) {
  try {
    await requireCommunicationTemplateReadPermission();
    const { searchParams } = new URL(request.url);
    const parsed = listMessageTemplatesSchema.parse({
      activeOnly: searchParams.get('activeOnly') ?? undefined,
      type: searchParams.get('type') ?? undefined,
      channel: searchParams.get('channel') ?? undefined,
    });

    const rows = await listMessageTemplates(parsed);
    return NextResponse.json({ rows });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: 'Parámetros inválidos', issues: error.flatten() }, { status: 422 });
    }
    if (error instanceof AppError) {
      return NextResponse.json({ message: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ message: toErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireCommunicationTemplateWritePermission();
    const payload = await request.json();
    const parsed = createMessageTemplateSchema.parse(payload);

    const created = await createMessageTemplate(parsed, session.user.id);
    return NextResponse.json(created, { status: 201 });
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
