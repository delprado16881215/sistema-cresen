import type { CobranzaExpedienteCorto } from '@/server/services/cobranza-expediente-service';
import {
  getOfflineRecord,
  putOfflineRecord,
} from '@/offline/offline-storage';

export type OfflineCaseRecord = {
  cacheKey: string;
  creditoId: string;
  occurredAt: string;
  downloadedAt: string;
  expediente: CobranzaExpedienteCorto;
};

export function buildOfflineCaseKey(creditoId: string, occurredAt: string) {
  return `${creditoId}::${occurredAt}`;
}

export async function saveOfflineCaseSnapshot(expediente: CobranzaExpedienteCorto) {
  const cacheKey = buildOfflineCaseKey(expediente.operativaPanel.credito.id, expediente.occurredAt);
  const record: OfflineCaseRecord = {
    cacheKey,
    creditoId: expediente.operativaPanel.credito.id,
    occurredAt: expediente.occurredAt,
    downloadedAt: new Date().toISOString(),
    expediente,
  };

  await putOfflineRecord('cases', cacheKey, record);
  return record;
}

export async function getOfflineCaseSnapshot(creditoId: string, occurredAt: string) {
  return getOfflineRecord<OfflineCaseRecord>('cases', buildOfflineCaseKey(creditoId, occurredAt));
}
