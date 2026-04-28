function buildDate(year: number, month: number, day: number) {
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function parseFlexibleDateInput(value: string | Date | null | undefined) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return buildDate(Number(year), Number(month), Number(day));
  }

  const slashMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (slashMatch) {
    const [, day, month, yearRaw] = slashMatch;
    if (!day || !month || !yearRaw) return null;
    const year = yearRaw.length === 2 ? 2000 + Number(yearRaw) : Number(yearRaw);
    return buildDate(year, Number(month), Number(day));
  }

  return null;
}

export function normalizeToIsoDate(value: string | Date | null | undefined) {
  const parsed = parseFlexibleDateInput(value);
  if (!parsed) return null;

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
