import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AppError, toErrorMessage } from '@/lib/errors';
import { requireCommunicationWritePermission } from '@/server/policies/communications-guard';
import { previewCommunication } from '@/server/services/communications-service';
import { previewCommunicationSchema } from '@/server/validators/comunicaciones';

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = previewCommunicationSchema.parse(payload);
    await requireCommunicationWritePermission(parsed.sourceContext);

    const preview = await previewCommunication(parsed);
    return NextResponse.json(preview);
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
