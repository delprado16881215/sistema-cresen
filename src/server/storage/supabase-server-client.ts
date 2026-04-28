import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '@/lib/errors';

let supabaseServerClient: SupabaseClient | null = null;

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new AppError(
      `Falta configurar ${name} para usar Supabase Storage.`,
      'SUPABASE_STORAGE_ENV_MISSING',
      500,
    );
  }

  return value;
}

export function getSupabaseStorageBucket() {
  return process.env.SUPABASE_STORAGE_BUCKET?.trim() || 'cliente-documentos';
}

export function getSupabaseServerClient() {
  if (supabaseServerClient) {
    return supabaseServerClient;
  }

  const supabaseUrl = getRequiredEnv('SUPABASE_URL');
  const serviceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');

  supabaseServerClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabaseServerClient;
}
