import { Prisma, type ClienteGeoReferenceSource } from '@prisma/client';
import { writeAuditLog } from '@/lib/audit';
import { prisma } from '@/lib/prisma';
import { listVisitaCampoRecords } from '@/server/repositories/cobranza-operativa-repository';
import {
  createClienteGeoReferenceRecord,
  findClienteGeoReferenceRecordByExactScope,
  listClienteGeoReferenceRecordsForContext,
  updateClienteGeoReferenceRecord,
  type ClienteGeoReferenceRecord,
} from '@/server/repositories/cliente-geo-reference-repository';

type PersistedGeoSource = Exclude<ClienteGeoReferenceSource, 'NONE'>;

type GeoVisitFallbackInput = {
  fechaHora: string;
  latitud: number | null;
  longitud: number | null;
};

export type ClienteGeoReferenceSnapshot = {
  id: string;
  clienteId: string;
  creditoId: string | null;
  latitude: number;
  longitude: number;
  source: ClienteGeoReferenceSource;
  isApproximate: boolean;
  confidence: number;
  provider: string | null;
  placeId: string | null;
  normalizedAddressQuery: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CobranzaGeoResolution = {
  referenceId: string | null;
  clienteId: string;
  creditoId: string | null;
  latitude: number | null;
  longitude: number | null;
  source: ClienteGeoReferenceSource;
  isApproximate: boolean;
  confidence: number;
  provider: string | null;
  placeId: string | null;
  normalizedAddressQuery: string | null;
  isReliable: boolean;
  resolvedFrom: 'PERSISTED_CREDITO' | 'PERSISTED_CLIENTE' | 'VISIT_FALLBACK' | 'NONE';
  resolvedFromVisitAt: string | null;
  updatedAt: string | null;
};

export type ClienteGeoReferenceFormState = {
  current: CobranzaGeoResolution;
  manualReference: ClienteGeoReferenceSnapshot | null;
};

export type UpsertClienteGeoReferenceCandidateInput = {
  clienteId: string;
  creditoId?: string | null;
  latitude: number;
  longitude: number;
  source: PersistedGeoSource;
  isApproximate?: boolean;
  confidence?: number;
  provider?: string | null;
  placeId?: string | null;
  normalizedAddressQuery?: string | null;
  observedAt?: string | Date | null;
  mirrorToClientScope?: boolean;
};

type UpsertClienteGeoReferenceResult = {
  changed: boolean;
  action: 'CREATED' | 'UPDATED' | 'KEPT';
  scope: 'CREDITO' | 'CLIENTE';
  reason: string;
  record: ClienteGeoReferenceSnapshot;
};

const GEO_QUALITY_RANK: Record<ClienteGeoReferenceSource, { exact: number; approximate: number }> = {
  MANUAL: { exact: 400, approximate: 180 },
  VISIT_GPS: { exact: 350, approximate: 150 },
  GEOCODE: { exact: 250, approximate: 100 },
  NONE: { exact: 0, approximate: 0 },
};

let geoReferenceStorageUnavailableDetected = false;
let hasWarnedGeoReferenceStorageUnavailable = false;
let geoReferenceStorageAvailabilityPromise: Promise<boolean> | null = null;

function isGeoReferenceStorageUnavailable(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2021') return true;
    if (error.code === 'P2022' && error.message.includes('ClienteGeoReference')) return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('ClienteGeoReference') &&
    (message.includes('does not exist') || message.includes('does not exist in the current database'))
  );
}

function warnGeoReferenceStorageUnavailable(error: unknown) {
  geoReferenceStorageUnavailableDetected = true;

  if (hasWarnedGeoReferenceStorageUnavailable) {
    return;
  }

  hasWarnedGeoReferenceStorageUnavailable = true;
  const detail = error instanceof Error ? error.message : String(error);
  console.warn(
    'ClienteGeoReference no está disponible todavía en la base activa. Se usará el fallback por GPS de visitas.',
    detail,
  );
}

async function isGeoReferenceStorageAvailable() {
  if (geoReferenceStorageUnavailableDetected) {
    return false;
  }

  if (!geoReferenceStorageAvailabilityPromise) {
    geoReferenceStorageAvailabilityPromise = (async () => {
      try {
        const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = 'ClienteGeoReference'
          ) AS "exists"
        `;
        const exists = Boolean(rows[0]?.exists);

        if (!exists) {
          warnGeoReferenceStorageUnavailable(new Error('La tabla public.ClienteGeoReference aún no existe.'));
        }

        return exists;
      } catch (error) {
        geoReferenceStorageAvailabilityPromise = null;

        if (!isGeoReferenceStorageUnavailable(error)) {
          throw error;
        }

        warnGeoReferenceStorageUnavailable(error);
        return false;
      }
    })();
  }

  return geoReferenceStorageAvailabilityPromise;
}

function serializeGeoReference(record: ClienteGeoReferenceRecord): ClienteGeoReferenceSnapshot {
  return {
    id: record.id,
    clienteId: record.clienteId,
    creditoId: record.creditoId ?? null,
    latitude: Number(record.latitud),
    longitude: Number(record.longitud),
    source: record.source,
    isApproximate: record.isApproximate,
    confidence: record.confidence,
    provider: record.provider ?? null,
    placeId: record.placeId ?? null,
    normalizedAddressQuery: record.normalizedAddressQuery ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function clampConfidence(value: number | undefined, source: PersistedGeoSource, isApproximate: boolean) {
  if (Number.isFinite(value)) {
    return Math.max(0, Math.min(100, Math.round(value ?? 0)));
  }

  if (source === 'VISIT_GPS') return isApproximate ? 80 : 95;
  if (source === 'MANUAL') return isApproximate ? 75 : 90;
  return isApproximate ? 60 : 75;
}

function normalizeObservedAt(value: string | Date | null | undefined) {
  if (value == null) return new Date();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function buildGeoQualityScore(input: {
  source: ClienteGeoReferenceSource;
  isApproximate: boolean;
  confidence: number;
}) {
  const tier = GEO_QUALITY_RANK[input.source];
  const base = input.isApproximate ? tier.approximate : tier.exact;
  return base + Math.max(0, Math.min(100, Math.round(input.confidence)));
}

function hasValidCoordinates(latitude: number | null | undefined, longitude: number | null | undefined) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  return Math.abs(Number(latitude)) <= 90 && Math.abs(Number(longitude)) <= 180;
}

function shouldReplaceGeoReference(
  current: ClienteGeoReferenceSnapshot,
  candidate: {
    source: PersistedGeoSource;
    isApproximate: boolean;
    confidence: number;
    observedAt: Date;
    latitude: number;
    longitude: number;
    normalizedAddressQuery: string | null;
    provider: string | null;
    placeId: string | null;
  },
) {
  const currentScore = buildGeoQualityScore(current);
  const candidateScore = buildGeoQualityScore(candidate);

  if (candidateScore !== currentScore) {
    return candidateScore > currentScore;
  }

  const sameCoordinates =
    Math.abs(current.latitude - candidate.latitude) < 0.0000005 &&
    Math.abs(current.longitude - candidate.longitude) < 0.0000005;

  if (sameCoordinates) {
    const candidateMetadataScore =
      Number(Boolean(candidate.normalizedAddressQuery)) +
      Number(Boolean(candidate.provider)) +
      Number(Boolean(candidate.placeId));
    const currentMetadataScore =
      Number(Boolean(current.normalizedAddressQuery)) +
      Number(Boolean(current.provider)) +
      Number(Boolean(current.placeId));

    if (candidateMetadataScore !== currentMetadataScore) {
      return candidateMetadataScore > currentMetadataScore;
    }
  }

  const currentUpdatedAt = new Date(current.updatedAt);
  return candidate.observedAt.getTime() > currentUpdatedAt.getTime();
}

function compareReadPreference(
  left: ClienteGeoReferenceSnapshot,
  right: ClienteGeoReferenceSnapshot,
  input: {
    creditoId?: string | null;
  },
) {
  const leftScopeBonus = input.creditoId && left.creditoId === input.creditoId ? 15 : 0;
  const rightScopeBonus = input.creditoId && right.creditoId === input.creditoId ? 15 : 0;
  const leftScore = buildGeoQualityScore(left) + leftScopeBonus;
  const rightScore = buildGeoQualityScore(right) + rightScopeBonus;

  if (leftScore !== rightScore) return rightScore - leftScore;
  return right.updatedAt.localeCompare(left.updatedAt);
}

function buildFallbackVisitGeo(input: {
  clienteId: string;
  creditoId?: string | null;
  visits?: GeoVisitFallbackInput[];
}): CobranzaGeoResolution {
  const visitWithCoordinates =
    input.visits?.find((item) => hasValidCoordinates(item.latitud, item.longitud)) ?? null;

  if (!visitWithCoordinates) {
    return {
      referenceId: null,
      clienteId: input.clienteId,
      creditoId: input.creditoId ?? null,
      latitude: null,
      longitude: null,
      source: 'NONE',
      isApproximate: false,
      confidence: 0,
      provider: null,
      placeId: null,
      normalizedAddressQuery: null,
      isReliable: false,
      resolvedFrom: 'NONE',
      resolvedFromVisitAt: null,
      updatedAt: null,
    };
  }

  return {
    referenceId: null,
    clienteId: input.clienteId,
    creditoId: input.creditoId ?? null,
    latitude: visitWithCoordinates.latitud,
    longitude: visitWithCoordinates.longitud,
    source: 'VISIT_GPS',
    isApproximate: false,
    confidence: 95,
    provider: null,
    placeId: null,
    normalizedAddressQuery: null,
    isReliable: true,
    resolvedFrom: 'VISIT_FALLBACK',
    resolvedFromVisitAt: visitWithCoordinates.fechaHora,
    updatedAt: visitWithCoordinates.fechaHora,
  };
}

async function upsertGeoReferenceForScope(
  input: UpsertClienteGeoReferenceCandidateInput & {
    scope: 'CREDITO' | 'CLIENTE';
    userId?: string;
  },
): Promise<UpsertClienteGeoReferenceResult> {
  const scopedCreditoId = input.scope === 'CREDITO' ? input.creditoId ?? null : null;
  const observedAt = normalizeObservedAt(input.observedAt);
  const isApproximate = input.isApproximate ?? false;
  const confidence = clampConfidence(input.confidence, input.source, isApproximate);
  const normalizedAddressQuery = input.normalizedAddressQuery?.trim() || null;
  const provider = input.provider?.trim() || null;
  const placeId = input.placeId?.trim() || null;

  const existingRaw = await findClienteGeoReferenceRecordByExactScope({
    clienteId: input.clienteId,
    creditoId: scopedCreditoId,
  });

  if (!existingRaw) {
    const created = serializeGeoReference(
      await createClienteGeoReferenceRecord({
        clienteId: input.clienteId,
        creditoId: scopedCreditoId,
        latitud: input.latitude,
        longitud: input.longitude,
        source: input.source,
        isApproximate,
        confidence,
        provider,
        placeId,
        normalizedAddressQuery,
        createdAt: observedAt,
        updatedAt: observedAt,
      }),
    );

    await writeAuditLog({
      userId: input.userId,
      module: 'cliente-geo-reference',
      entity: 'ClienteGeoReference',
      entityId: created.id,
      action: 'CREATE',
      afterJson: created,
    });

    return {
      changed: true,
      action: 'CREATED',
      scope: input.scope,
      reason: 'No existía referencia previa para este alcance.',
      record: created,
    };
  }

  const existing = serializeGeoReference(existingRaw);
  const shouldReplace = shouldReplaceGeoReference(existing, {
    source: input.source,
    isApproximate,
    confidence,
    observedAt,
    latitude: input.latitude,
    longitude: input.longitude,
    normalizedAddressQuery,
    provider,
    placeId,
  });

  if (!shouldReplace) {
    return {
      changed: false,
      action: 'KEPT',
      scope: input.scope,
      reason: 'La referencia actual sigue siendo igual o mejor que la candidata.',
      record: existing,
    };
  }

  const updated = serializeGeoReference(
    await updateClienteGeoReferenceRecord(existing.id, {
      latitud: input.latitude,
      longitud: input.longitude,
      source: input.source,
      isApproximate,
      confidence,
      provider,
      placeId,
      normalizedAddressQuery,
      updatedAt: observedAt,
    }),
  );

  await writeAuditLog({
    userId: input.userId,
    module: 'cliente-geo-reference',
    entity: 'ClienteGeoReference',
    entityId: updated.id,
    action: 'UPDATE',
    beforeJson: existing,
    afterJson: updated,
  });

  return {
    changed: true,
    action: 'UPDATED',
    scope: input.scope,
    reason: 'La referencia candidata supera a la actual por precedencia, precisión o confianza.',
    record: updated,
  };
}

export async function resolveCobranzaGeoReference(input: {
  clienteId: string;
  creditoId?: string | null;
  fallbackVisits?: GeoVisitFallbackInput[];
}): Promise<CobranzaGeoResolution> {
  if (!(await isGeoReferenceStorageAvailable())) {
    return buildFallbackVisitGeo({
      clienteId: input.clienteId,
      creditoId: input.creditoId,
      visits: input.fallbackVisits,
    });
  }

  let records: ClienteGeoReferenceSnapshot[] = [];

  try {
    records = (await listClienteGeoReferenceRecordsForContext({
      clienteId: input.clienteId,
      creditoId: input.creditoId,
    })).map(serializeGeoReference);
  } catch (error) {
    if (!isGeoReferenceStorageUnavailable(error)) {
      throw error;
    }

    warnGeoReferenceStorageUnavailable(error);
    return buildFallbackVisitGeo({
      clienteId: input.clienteId,
      creditoId: input.creditoId,
      visits: input.fallbackVisits,
    });
  }

  const preferred = [...records].sort((left, right) =>
    compareReadPreference(left, right, { creditoId: input.creditoId }),
  )[0] ?? null;

  if (preferred) {
    return {
      referenceId: preferred.id,
      clienteId: preferred.clienteId,
      creditoId: preferred.creditoId,
      latitude: preferred.latitude,
      longitude: preferred.longitude,
      source: preferred.source,
      isApproximate: preferred.isApproximate,
      confidence: preferred.confidence,
      provider: preferred.provider,
      placeId: preferred.placeId,
      normalizedAddressQuery: preferred.normalizedAddressQuery,
      isReliable: true,
      resolvedFrom:
        input.creditoId && preferred.creditoId === input.creditoId
          ? 'PERSISTED_CREDITO'
          : 'PERSISTED_CLIENTE',
      resolvedFromVisitAt: null,
      updatedAt: preferred.updatedAt,
    };
  }

  return buildFallbackVisitGeo({
    clienteId: input.clienteId,
    creditoId: input.creditoId,
    visits: input.fallbackVisits,
  });
}

export async function upsertClienteGeoReferenceCandidate(
  input: UpsertClienteGeoReferenceCandidateInput,
  options?: {
    userId?: string;
  },
) {
  if (!hasValidCoordinates(input.latitude, input.longitude)) {
    return [];
  }

  if (!(await isGeoReferenceStorageAvailable())) {
    return [];
  }

  try {
    const results: UpsertClienteGeoReferenceResult[] = [];

    if (input.creditoId) {
      results.push(
        await upsertGeoReferenceForScope(
          {
            ...input,
            scope: 'CREDITO',
            userId: options?.userId,
          },
        ),
      );
    }

    if (input.mirrorToClientScope ?? true) {
      results.push(
        await upsertGeoReferenceForScope(
          {
            ...input,
            scope: 'CLIENTE',
            userId: options?.userId,
          },
        ),
      );
    }

    return results;
  } catch (error) {
    if (!isGeoReferenceStorageUnavailable(error)) {
      throw error;
    }

    warnGeoReferenceStorageUnavailable(error);
    return [];
  }
}

export async function upsertClienteGeoReferenceFromVisitaCampo(
  input: {
    clienteId: string;
    creditoId?: string | null;
    fechaHora: string;
    latitud: number | null;
    longitud: number | null;
    direccionTexto?: string | null;
    referenciaLugar?: string | null;
  },
  options?: {
    userId?: string;
  },
) {
  if (!hasValidCoordinates(input.latitud, input.longitud)) {
    return [];
  }

  const normalizedAddressQuery =
    input.direccionTexto?.trim() || input.referenciaLugar?.trim() || null;

  return upsertClienteGeoReferenceCandidate(
    {
      clienteId: input.clienteId,
      creditoId: input.creditoId ?? null,
      latitude: Number(input.latitud),
      longitude: Number(input.longitud),
      source: 'VISIT_GPS',
      isApproximate: false,
      confidence: 95,
      normalizedAddressQuery,
      observedAt: input.fechaHora,
      mirrorToClientScope: true,
    },
    options,
  );
}

export async function getClienteGeoReferenceFormState(clienteId: string): Promise<ClienteGeoReferenceFormState> {
  const fallbackVisits = await listVisitaCampoRecords({ clienteId }, 20);
  const current = await resolveCobranzaGeoReference({
    clienteId,
    fallbackVisits: fallbackVisits.map((item) => ({
      fechaHora: item.fechaHora.toISOString(),
      latitud: item.latitud != null ? Number(item.latitud) : null,
      longitud: item.longitud != null ? Number(item.longitud) : null,
    })),
  });

  if (!(await isGeoReferenceStorageAvailable())) {
    return {
      current,
      manualReference: null,
    };
  }

  try {
    const manualRaw = await findClienteGeoReferenceRecordByExactScope({
      clienteId,
      creditoId: null,
    });

    return {
      current,
      manualReference: manualRaw ? serializeGeoReference(manualRaw) : null,
    };
  } catch (error) {
    if (!isGeoReferenceStorageUnavailable(error)) {
      throw error;
    }

    warnGeoReferenceStorageUnavailable(error);
    return {
      current,
      manualReference: null,
    };
  }
}

export async function upsertClienteGeoReferenceFromClienteManualCapture(
  input: {
    clienteId: string;
    latitud: number | null;
    longitud: number | null;
    isApproximate?: boolean;
    observation?: string | null;
    normalizedAddressQuery?: string | null;
    observedAt?: string | Date | null;
  },
  options?: {
    userId?: string;
  },
) {
  if (!hasValidCoordinates(input.latitud, input.longitud)) {
    return [];
  }

  const isApproximate = input.isApproximate ?? false;

  return upsertClienteGeoReferenceCandidate(
    {
      clienteId: input.clienteId,
      latitude: Number(input.latitud),
      longitude: Number(input.longitud),
      source: 'MANUAL',
      isApproximate,
      confidence: isApproximate ? 75 : 90,
      provider: input.observation?.trim() || null,
      normalizedAddressQuery: input.normalizedAddressQuery?.trim() || null,
      observedAt: input.observedAt ?? new Date(),
      mirrorToClientScope: true,
    },
    options,
  );
}
