import 'server-only';

import { randomUUID } from 'node:crypto';
import { AppError } from '@/lib/errors';
import {
  getSupabaseServerClient,
  getSupabaseStorageBucket,
} from '@/server/storage/supabase-server-client';

export const CLIENTE_DOCUMENT_TYPES = [
  'ineFront',
  'ineBack',
  'pagareFront',
  'pagareBack',
  'proofOfAddress',
] as const;

export type ClienteDocumentType = (typeof CLIENTE_DOCUMENT_TYPES)[number];

export type ClienteDocumentUploadResult = {
  bucket: string;
  storageKey: string;
  documentType: ClienteDocumentType;
  contentType: string;
  size: number;
};

export type ClienteDocumentSignedUrlResult = {
  bucket: string;
  storageKey: string;
  signedUrl: string;
  expiresInSeconds: number;
};

const DOCUMENT_TYPE_CONFIG: Record<ClienteDocumentType, { label: string; filePrefix: string }> = {
  ineFront: { label: 'INE frente', filePrefix: 'ine-frente' },
  ineBack: { label: 'INE reverso', filePrefix: 'ine-reverso' },
  pagareFront: { label: 'Pagaré frente', filePrefix: 'pagare-frente' },
  pagareBack: { label: 'Pagaré reverso', filePrefix: 'pagare-reverso' },
  proofOfAddress: { label: 'Comprobante de domicilio', filePrefix: 'comprobante-domicilio' },
};

const ALLOWED_MIME_TYPES = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

const LEGACY_PUBLIC_UPLOAD_PREFIX = '/uploads/clientes/';
const STORAGE_KEY_PATTERN =
  /^clientes\/[A-Za-z0-9_-]+\/(ineFront|ineBack|pagareFront|pagareBack|proofOfAddress)\/[A-Za-z0-9._-]+\.(jpg|png|webp)$/;

function getMaxFileSizeBytes() {
  const configuredMb = process.env.CLIENT_DOCUMENT_MAX_SIZE_MB?.trim();
  const maxMb = configuredMb ? Number(configuredMb) : 5;

  if (!Number.isFinite(maxMb) || maxMb <= 0) {
    throw new AppError(
      'CLIENT_DOCUMENT_MAX_SIZE_MB debe ser un número mayor a 0.',
      'CLIENT_DOCUMENT_MAX_SIZE_INVALID',
      500,
    );
  }

  return maxMb * 1024 * 1024;
}

function getSignedUrlTtlSeconds(input?: number) {
  if (typeof input === 'number') {
    return input;
  }

  const configuredSeconds = process.env.CLIENT_DOCUMENT_SIGNED_URL_TTL_SECONDS?.trim();
  return configuredSeconds ? Number(configuredSeconds) : 120;
}

function assertValidClienteId(clienteId: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(clienteId)) {
    throw new AppError('El identificador del cliente no es válido para almacenar documentos.', 'INVALID_CLIENTE_ID', 422);
  }
}

export function isClienteDocumentType(value: unknown): value is ClienteDocumentType {
  return typeof value === 'string' && CLIENTE_DOCUMENT_TYPES.includes(value as ClienteDocumentType);
}

export function isLegacyPublicUploadPath(value: string | null | undefined) {
  return typeof value === 'string' && value.startsWith(LEGACY_PUBLIC_UPLOAD_PREFIX);
}

export function isStorageKey(value: string | null | undefined) {
  return typeof value === 'string' && STORAGE_KEY_PATTERN.test(value);
}

export function validateClienteDocumentFile(file: File, documentType: ClienteDocumentType) {
  const config = DOCUMENT_TYPE_CONFIG[documentType];
  const extension = ALLOWED_MIME_TYPES.get(file.type);

  if (!extension) {
    throw new AppError(
      `${config.label}: formato no permitido. Usa JPG, JPEG, PNG o WEBP.`,
      'INVALID_FILE_TYPE',
      422,
    );
  }

  if (file.size <= 0) {
    throw new AppError(`${config.label}: el archivo está vacío.`, 'EMPTY_FILE', 422);
  }

  if (file.size > getMaxFileSizeBytes()) {
    throw new AppError(
      `${config.label}: el archivo excede el tamaño máximo permitido.`,
      'FILE_TOO_LARGE',
      422,
    );
  }

  return {
    extension,
    contentType: file.type,
    size: file.size,
  };
}

export function buildClienteDocumentStorageKey(input: {
  clienteId: string;
  documentType: ClienteDocumentType;
  extension: string;
}) {
  assertValidClienteId(input.clienteId);

  const config = DOCUMENT_TYPE_CONFIG[input.documentType];
  const timestamp = Date.now();
  return `clientes/${input.clienteId}/${input.documentType}/${config.filePrefix}-${timestamp}-${randomUUID()}.${input.extension}`;
}

export async function uploadClienteDocument(input: {
  clienteId: string;
  documentType: ClienteDocumentType;
  file: File;
}): Promise<ClienteDocumentUploadResult> {
  const validation = validateClienteDocumentFile(input.file, input.documentType);
  const bucket = getSupabaseStorageBucket();
  const storageKey = buildClienteDocumentStorageKey({
    clienteId: input.clienteId,
    documentType: input.documentType,
    extension: validation.extension,
  });
  const bytes = Buffer.from(await input.file.arrayBuffer());

  const { error } = await getSupabaseServerClient()
    .storage
    .from(bucket)
    .upload(storageKey, bytes, {
      contentType: validation.contentType,
      cacheControl: '0',
      upsert: false,
    });

  if (error) {
    throw new AppError(
      `No se pudo subir el documento a Supabase Storage: ${error.message}`,
      'CLIENT_DOCUMENT_UPLOAD_FAILED',
      502,
    );
  }

  return {
    bucket,
    storageKey,
    documentType: input.documentType,
    contentType: validation.contentType,
    size: validation.size,
  };
}

export async function deleteClienteDocument(storageKey: string) {
  if (!isStorageKey(storageKey)) {
    throw new AppError('La referencia del documento no es una storageKey válida.', 'INVALID_STORAGE_KEY', 422);
  }

  const bucket = getSupabaseStorageBucket();
  const { error } = await getSupabaseServerClient().storage.from(bucket).remove([storageKey]);

  if (error) {
    throw new AppError(
      `No se pudo eliminar el documento de Supabase Storage: ${error.message}`,
      'CLIENT_DOCUMENT_DELETE_FAILED',
      502,
    );
  }

  return { bucket, storageKey, deleted: true };
}

export async function replaceClienteDocument(input: {
  clienteId: string;
  documentType: ClienteDocumentType;
  file: File;
  previousStorageKey?: string | null;
}) {
  const uploaded = await uploadClienteDocument({
    clienteId: input.clienteId,
    documentType: input.documentType,
    file: input.file,
  });

  if (
    input.previousStorageKey &&
    isStorageKey(input.previousStorageKey) &&
    input.previousStorageKey !== uploaded.storageKey
  ) {
    await deleteClienteDocument(input.previousStorageKey);
  }

  return uploaded;
}

export async function getClienteDocumentSignedUrl(input: {
  storageKey: string;
  expiresInSeconds?: number;
  download?: boolean;
}): Promise<ClienteDocumentSignedUrlResult> {
  if (!isStorageKey(input.storageKey)) {
    throw new AppError('La referencia del documento no es una storageKey válida.', 'INVALID_STORAGE_KEY', 422);
  }

  const expiresInSeconds = getSignedUrlTtlSeconds(input.expiresInSeconds);
  if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new AppError(
      'La expiración de la URL firmada debe ser mayor a 0 segundos.',
      'SIGNED_URL_TTL_INVALID',
      500,
    );
  }

  const bucket = getSupabaseStorageBucket();
  const { data, error } = await getSupabaseServerClient()
    .storage
    .from(bucket)
    .createSignedUrl(input.storageKey, expiresInSeconds, input.download ? { download: true } : undefined);

  if (error || !data?.signedUrl) {
    throw new AppError(
      `No se pudo generar la URL firmada del documento: ${error?.message ?? 'respuesta vacía'}`,
      'CLIENT_DOCUMENT_SIGNED_URL_FAILED',
      502,
    );
  }

  return {
    bucket,
    storageKey: input.storageKey,
    signedUrl: data.signedUrl,
    expiresInSeconds,
  };
}
