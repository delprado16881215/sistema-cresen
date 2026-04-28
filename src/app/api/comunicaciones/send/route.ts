import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AppError, toErrorMessage } from '@/lib/errors';
import { requireCommunicationWritePermission } from '@/server/policies/communications-guard';
import { sendCommunication } from '@/server/services/communications-service';
import { sendCommunicationSchema } from '@/server/validators/comunicaciones';

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = sendCommunicationSchema.parse(payload);
    const session = await requireCommunicationWritePermission(parsed.sourceContext);

    const result = await sendCommunication(parsed, session.user.id);
    return NextResponse.json(result);
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
