import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const ADMIN_EMAIL = 'admin@cresen.local';

function getDatabaseUrlInfo() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    return {
      configured: false,
      host: null,
      port: null,
      database: null,
      usesSupabasePooler: false,
    };
  }

  const parsed = new URL(databaseUrl);

  return {
    configured: true,
    host: parsed.hostname,
    port: parsed.port || null,
    database: parsed.pathname.replace(/^\//, '') || null,
    usesSupabasePooler: parsed.hostname.includes('pooler.supabase.com'),
  };
}

export async function GET() {
  try {
    const admin = await prisma.$queryRaw<Array<{ email: string; isActive: boolean }>>`
      SELECT email, "isActive"
      FROM "User"
      WHERE email = ${ADMIN_EMAIL}
      LIMIT 1
    `;

    return NextResponse.json({
      databaseUrl: getDatabaseUrlInfo(),
      admin: admin[0] ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        databaseUrl: getDatabaseUrlInfo(),
        admin: null,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 },
    );
  }
}
