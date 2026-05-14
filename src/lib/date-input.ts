import { normalizeOperationalDateKey, operationalDateToDate } from '@/lib/operational-date';

export function parseFlexibleDateInput(value: string | Date | null | undefined) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }

  const normalized = normalizeOperationalDateKey(value);
  if (!normalized) return null;

  return operationalDateToDate(normalized);
}

export function normalizeToIsoDate(value: string | Date | null | undefined) {
  return normalizeOperationalDateKey(value);
}
