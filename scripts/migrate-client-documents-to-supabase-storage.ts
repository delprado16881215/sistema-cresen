import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type ClienteDocumentType = 'ineFront' | 'ineBack' | 'pagareFront' | 'pagareBack' | 'proofOfAddress';
type ClienteDocumentColumn =
  | 'ineFrontPath'
  | 'ineBackPath'
  | 'pagareFrontPath'
  | 'pagareBackPath'
  | 'proofOfAddressPath';

type ClienteDocumentConfig = {
  column: ClienteDocumentColumn;
  documentType: ClienteDocumentType;
  filePrefix: string;
};

type ManifestStatus =
  | 'DRY_RUN_READY'
  | 'MIGRATED'
  | 'MIGRATED_EXISTING_OBJECT'
  | 'SKIPPED_ALREADY_STORAGE_KEY'
  | 'ERROR_FILE_MISSING'
  | 'ERROR_FILE_NOT_SUPPORTED'
  | 'ERROR_INVALID_REFERENCE'
  | 'ERROR_UPLOAD_FAILED'
  | 'ERROR_DB_UPDATE_FAILED'
  | 'ERROR_REFERENCE_CHANGED';

type ManifestEntry = {
  clienteId: string;
  documentType: ClienteDocumentType;
  oldPath: string | null;
  newStorageKey: string | null;
  fileSize: number | null;
  checksum: string | null;
  status: ManifestStatus;
  message?: string;
};

type MigrationOptions = {
  dryRun: boolean;
  manifestDir: string;
  limit?: number;
};

const DOCUMENTS: ClienteDocumentConfig[] = [
  { column: 'ineFrontPath', documentType: 'ineFront', filePrefix: 'ine-frente' },
  { column: 'ineBackPath', documentType: 'ineBack', filePrefix: 'ine-reverso' },
  { column: 'pagareFrontPath', documentType: 'pagareFront', filePrefix: 'pagare-frente' },
  { column: 'pagareBackPath', documentType: 'pagareBack', filePrefix: 'pagare-reverso' },
  { column: 'proofOfAddressPath', documentType: 'proofOfAddress', filePrefix: 'comprobante-domicilio' },
];

const LEGACY_PUBLIC_UPLOAD_PREFIX = '/uploads/clientes/';
const STORAGE_KEY_PATTERN =
  /^clientes\/[A-Za-z0-9_-]+\/(ineFront|ineBack|pagareFront|pagareBack|proofOfAddress)\/[A-Za-z0-9._-]+\.(jpg|png|webp)$/;
const PUBLIC_CLIENT_UPLOADS_ROOT = path.join(process.cwd(), 'public', 'uploads', 'clientes');
const DEFAULT_MANIFEST_DIR = path.join(process.cwd(), 'migration-manifests', 'client-documents');

const CONTENT_TYPES_BY_EXTENSION = new Map<string, { extension: 'jpg' | 'png' | 'webp'; contentType: string }>([
  ['.jpg', { extension: 'jpg', contentType: 'image/jpeg' }],
  ['.jpeg', { extension: 'jpg', contentType: 'image/jpeg' }],
  ['.png', { extension: 'png', contentType: 'image/png' }],
  ['.webp', { extension: 'webp', contentType: 'image/webp' }],
]);

function loadEnvFile(fileName: string) {
  const filePath = path.join(process.cwd(), fileName);

  try {
    const contents = readFileSync(filePath, 'utf8');

    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const separatorIndex = line.indexOf('=');
      if (separatorIndex <= 0) continue;

      const key = line.slice(0, separatorIndex).trim();
      let value = line.slice(separatorIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
    if (code !== 'ENOENT') {
      throw error;
    }
  }
}

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Falta configurar ${name}.`);
  }
  return value;
}

function parseOptions(argv: string[]): MigrationOptions & { help: boolean } {
  const options: MigrationOptions & { help: boolean } = {
    dryRun: false,
    manifestDir: DEFAULT_MANIFEST_DIR,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg.startsWith('--manifest-dir=')) {
      options.manifestDir = path.resolve(process.cwd(), arg.slice('--manifest-dir='.length));
      continue;
    }

    if (arg.startsWith('--limit=')) {
      const limit = Number(arg.slice('--limit='.length));
      if (!Number.isInteger(limit) || limit <= 0) {
        throw new Error('--limit debe ser un entero mayor a 0.');
      }
      options.limit = limit;
      continue;
    }

    throw new Error(`Argumento no soportado: ${arg}`);
  }

  return options;
}

function printHelp() {
  console.log(`
Uso:
  tsx scripts/migrate-client-documents-to-supabase-storage.ts --dry-run
  tsx scripts/migrate-client-documents-to-supabase-storage.ts

Opciones:
  --dry-run                 Genera manifest sin subir archivos ni actualizar DB.
  --manifest-dir=<ruta>     Carpeta de salida del manifest.
  --limit=<numero>          Limita la cantidad de clientes leídos.
  --help                    Muestra esta ayuda.
`.trim());
}

function isLegacyPublicUploadPath(value: string | null | undefined) {
  return typeof value === 'string' && value.startsWith(LEGACY_PUBLIC_UPLOAD_PREFIX);
}

function isStorageKey(value: string | null | undefined) {
  return typeof value === 'string' && STORAGE_KEY_PATTERN.test(value);
}

function resolveLegacyFilePath(oldPath: string) {
  const relativePath = oldPath.slice(LEGACY_PUBLIC_UPLOAD_PREFIX.length);
  const absolutePath = path.resolve(PUBLIC_CLIENT_UPLOADS_ROOT, relativePath);

  if (
    absolutePath !== PUBLIC_CLIENT_UPLOADS_ROOT &&
    !absolutePath.startsWith(`${PUBLIC_CLIENT_UPLOADS_ROOT}${path.sep}`)
  ) {
    throw new Error('La ruta legacy apunta fuera de public/uploads/clientes.');
  }

  return absolutePath;
}

function getFileMetadata(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  const metadata = CONTENT_TYPES_BY_EXTENSION.get(extension);
  if (!metadata) {
    throw new Error(`Extensión no soportada: ${extension || '(sin extensión)'}.`);
  }
  return metadata;
}

function checksumSha256(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function buildStorageKey(input: {
  clienteId: string;
  documentType: ClienteDocumentType;
  filePrefix: string;
  extension: 'jpg' | 'png' | 'webp';
  checksum: string;
}) {
  return `clientes/${input.clienteId}/${input.documentType}/${input.filePrefix}-legacy-${input.checksum.slice(
    0,
    20,
  )}.${input.extension}`;
}

function isAlreadyExistsSupabaseError(errorMessage: string) {
  const normalized = errorMessage.toLowerCase();
  return normalized.includes('already exists') || normalized.includes('resource already exists');
}

async function uploadObject(input: {
  supabase: SupabaseClient;
  bucket: string;
  storageKey: string;
  buffer: Buffer;
  contentType: string;
}) {
  const { error } = await input.supabase.storage.from(input.bucket).upload(input.storageKey, input.buffer, {
    contentType: input.contentType,
    cacheControl: '0',
    upsert: false,
  });

  if (!error) {
    return 'uploaded' as const;
  }

  if (isAlreadyExistsSupabaseError(error.message)) {
    return 'already-exists' as const;
  }

  throw new Error(error.message);
}

async function writeManifest(input: {
  options: MigrationOptions;
  bucket: string;
  entries: ManifestEntry[];
}) {
  await mkdir(input.options.manifestDir, { recursive: true });

  const generatedAt = new Date();
  const suffix = input.options.dryRun ? 'dry-run' : 'migration';
  const timestamp = generatedAt.toISOString().replace(/[:.]/g, '-');
  const manifestPath = path.join(input.options.manifestDir, `client-documents-${timestamp}-${suffix}.json`);
  const counts = input.entries.reduce<Record<string, number>>((accumulator, entry) => {
    accumulator[entry.status] = (accumulator[entry.status] ?? 0) + 1;
    return accumulator;
  }, {});

  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        generatedAt: generatedAt.toISOString(),
        dryRun: input.options.dryRun,
        bucket: input.bucket,
        counts,
        entries: input.entries,
      },
      null,
      2,
    ),
    'utf8',
  );

  return { manifestPath, counts };
}

async function processLegacyDocument(input: {
  prisma: PrismaClient;
  supabase: SupabaseClient;
  bucket: string;
  options: MigrationOptions;
  clienteId: string;
  config: ClienteDocumentConfig;
  oldPath: string;
}): Promise<ManifestEntry> {
  let absolutePath: string;

  try {
    absolutePath = resolveLegacyFilePath(input.oldPath);
  } catch (error) {
    return {
      clienteId: input.clienteId,
      documentType: input.config.documentType,
      oldPath: input.oldPath,
      newStorageKey: null,
      fileSize: null,
      checksum: null,
      status: 'ERROR_INVALID_REFERENCE',
      message: error instanceof Error ? error.message : String(error),
    };
  }

  let fileStat: Awaited<ReturnType<typeof stat>>;
  try {
    fileStat = await stat(absolutePath);
  } catch {
    return {
      clienteId: input.clienteId,
      documentType: input.config.documentType,
      oldPath: input.oldPath,
      newStorageKey: null,
      fileSize: null,
      checksum: null,
      status: 'ERROR_FILE_MISSING',
      message: `No existe el archivo físico: ${absolutePath}`,
    };
  }

  if (!fileStat.isFile()) {
    return {
      clienteId: input.clienteId,
      documentType: input.config.documentType,
      oldPath: input.oldPath,
      newStorageKey: null,
      fileSize: fileStat.size,
      checksum: null,
      status: 'ERROR_FILE_NOT_SUPPORTED',
      message: `La ruta no apunta a un archivo regular: ${absolutePath}`,
    };
  }

  let fileMetadata: ReturnType<typeof getFileMetadata>;
  try {
    fileMetadata = getFileMetadata(absolutePath);
  } catch (error) {
    return {
      clienteId: input.clienteId,
      documentType: input.config.documentType,
      oldPath: input.oldPath,
      newStorageKey: null,
      fileSize: fileStat.size,
      checksum: null,
      status: 'ERROR_FILE_NOT_SUPPORTED',
      message: error instanceof Error ? error.message : String(error),
    };
  }

  const buffer = await readFile(absolutePath);
  const checksum = checksumSha256(buffer);
  const newStorageKey = buildStorageKey({
    clienteId: input.clienteId,
    documentType: input.config.documentType,
    filePrefix: input.config.filePrefix,
    extension: fileMetadata.extension,
    checksum,
  });

  if (input.options.dryRun) {
    return {
      clienteId: input.clienteId,
      documentType: input.config.documentType,
      oldPath: input.oldPath,
      newStorageKey,
      fileSize: fileStat.size,
      checksum,
      status: 'DRY_RUN_READY',
    };
  }

  let uploadStatus: Awaited<ReturnType<typeof uploadObject>>;
  try {
    uploadStatus = await uploadObject({
      supabase: input.supabase,
      bucket: input.bucket,
      storageKey: newStorageKey,
      buffer,
      contentType: fileMetadata.contentType,
    });
  } catch (error) {
    return {
      clienteId: input.clienteId,
      documentType: input.config.documentType,
      oldPath: input.oldPath,
      newStorageKey,
      fileSize: fileStat.size,
      checksum,
      status: 'ERROR_UPLOAD_FAILED',
      message: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    const result = await input.prisma.cliente.updateMany({
      where: {
        id: input.clienteId,
        [input.config.column]: input.oldPath,
      },
      data: {
        [input.config.column]: newStorageKey,
      },
    });

    if (result.count !== 1) {
      return {
        clienteId: input.clienteId,
        documentType: input.config.documentType,
        oldPath: input.oldPath,
        newStorageKey,
        fileSize: fileStat.size,
        checksum,
        status: 'ERROR_REFERENCE_CHANGED',
        message: 'La referencia en DB cambió antes de actualizar la columna.',
      };
    }
  } catch (error) {
    return {
      clienteId: input.clienteId,
      documentType: input.config.documentType,
      oldPath: input.oldPath,
      newStorageKey,
      fileSize: fileStat.size,
      checksum,
      status: 'ERROR_DB_UPDATE_FAILED',
      message: error instanceof Error ? error.message : String(error),
    };
  }

  return {
    clienteId: input.clienteId,
    documentType: input.config.documentType,
    oldPath: input.oldPath,
    newStorageKey,
    fileSize: fileStat.size,
    checksum,
    status: uploadStatus === 'already-exists' ? 'MIGRATED_EXISTING_OBJECT' : 'MIGRATED',
  };
}

async function runMigration(options: MigrationOptions) {
  loadEnvFile('.env');
  loadEnvFile('.env.local');

  const prisma = new PrismaClient();
  const supabaseUrl = getRequiredEnv('SUPABASE_URL');
  const serviceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || 'cliente-documentos';
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const entries: ManifestEntry[] = [];

  try {
    const clientes = await prisma.cliente.findMany({
      where: {
        OR: DOCUMENTS.map((config) => ({
          [config.column]: { not: null },
        })),
      },
      select: {
        id: true,
        ineFrontPath: true,
        ineBackPath: true,
        pagareFrontPath: true,
        pagareBackPath: true,
        proofOfAddressPath: true,
      },
      orderBy: { id: 'asc' },
      ...(options.limit ? { take: options.limit } : {}),
    });

    for (const cliente of clientes) {
      for (const config of DOCUMENTS) {
        const oldPath = cliente[config.column];
        if (!oldPath) continue;

        if (isStorageKey(oldPath)) {
          entries.push({
            clienteId: cliente.id,
            documentType: config.documentType,
            oldPath,
            newStorageKey: oldPath,
            fileSize: null,
            checksum: null,
            status: 'SKIPPED_ALREADY_STORAGE_KEY',
          });
          continue;
        }

        if (!isLegacyPublicUploadPath(oldPath)) {
          entries.push({
            clienteId: cliente.id,
            documentType: config.documentType,
            oldPath,
            newStorageKey: null,
            fileSize: null,
            checksum: null,
            status: 'ERROR_INVALID_REFERENCE',
            message: 'La referencia no es legacy ni storageKey.',
          });
          continue;
        }

        entries.push(
          await processLegacyDocument({
            prisma,
            supabase,
            bucket,
            options,
            clienteId: cliente.id,
            config,
            oldPath,
          }),
        );
      }
    }

    const { manifestPath, counts } = await writeManifest({ options, bucket, entries });

    console.log(
      JSON.stringify(
        {
          dryRun: options.dryRun,
          clientesRead: clientes.length,
          documentReferencesProcessed: entries.length,
          bucket,
          manifestPath,
          counts,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  await runMigration(options);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
