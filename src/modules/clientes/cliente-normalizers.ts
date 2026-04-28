export const UPPERCASE_CLIENT_FIELDS = [
  'fullName',
  'address',
  'neighborhood',
  'city',
  'state',
  'betweenStreets',
  'referencesNotes',
  'observations',
] as const;

export type UppercaseClienteField = (typeof UPPERCASE_CLIENT_FIELDS)[number];

export function toUppercaseInputValue(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return value.toUpperCase();
}

export function toUppercaseValue(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return value.trim().toUpperCase();
}

export function digitsOnly(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

export function normalizePhone(value: string | null | undefined): string {
  return digitsOnly(value).slice(0, 10);
}

export function normalizeOptionalPhone(value: string | null | undefined): string | null {
  const normalized = normalizePhone(value);
  return normalized.length > 0 ? normalized : null;
}

export function normalizePostalCode(value: string | null | undefined): string {
  return digitsOnly(value).slice(0, 5);
}

export function formatPhoneForDisplay(value: string | null | undefined): string {
  const digits = normalizePhone(value);

  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 10)}`;
}
