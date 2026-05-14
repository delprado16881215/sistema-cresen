export const OPERATIONAL_TIME_ZONE = 'America/Mazatlan';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type DateParts = {
  year: number;
  month: number;
  day: number;
};

type DateTimeParts = DateParts & {
  hour: number;
  minute: number;
  second: number;
};

const operationalDateFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: OPERATIONAL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const operationalDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: OPERATIONAL_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function padDatePart(value: number) {
  return String(value).padStart(2, '0');
}

function buildDateKey(parts: DateParts) {
  return `${String(parts.year).padStart(4, '0')}-${padDatePart(parts.month)}-${padDatePart(parts.day)}`;
}

function parseDateParts(yearText: string, monthText: string, dayText: string): DateParts | null {
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(probe.getTime()) ||
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function parseDateKey(value: string): DateParts | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, year = '', month = '', day = ''] = match;
  return parseDateParts(year, month, day);
}

function getOperationalDateTimeParts(date: Date): DateTimeParts {
  const parts = operationalDateTimeFormatter.formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes) => {
    const value = parts.find((part) => part.type === type)?.value;
    return value ? Number(value) : NaN;
  };

  return {
    year: getPart('year'),
    month: getPart('month'),
    day: getPart('day'),
    hour: getPart('hour'),
    minute: getPart('minute'),
    second: getPart('second'),
  };
}

function zonedDateTimeToDate(parts: DateTimeParts, millisecond = 0) {
  const targetAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    millisecond,
  );
  let utcMs = targetAsUtc;

  for (let index = 0; index < 4; index += 1) {
    const currentParts = getOperationalDateTimeParts(new Date(utcMs));
    const currentAsUtc = Date.UTC(
      currentParts.year,
      currentParts.month - 1,
      currentParts.day,
      currentParts.hour,
      currentParts.minute,
      currentParts.second,
      millisecond,
    );
    const diff = targetAsUtc - currentAsUtc;
    if (diff === 0) break;
    utcMs += diff;
  }

  return new Date(utcMs);
}

export function toOperationalDateKey(value: Date) {
  if (Number.isNaN(value.getTime())) {
    throw new Error('Invalid date input');
  }

  return operationalDateFormatter.format(value);
}

export function normalizeOperationalDateKey(value: string | Date | null | undefined) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : toOperationalDateKey(value);
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) {
    const [, year = '', month = '', day = ''] = isoMatch;
    const parts = parseDateParts(year, month, day);
    return parts ? buildDateKey(parts) : null;
  }

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (slashMatch) {
    const [, dayText = '', monthText = '', yearText = ''] = slashMatch;
    const year = yearText.length === 2 ? `20${yearText}` : yearText;
    const parts = parseDateParts(year, monthText, dayText);
    return parts ? buildDateKey(parts) : null;
  }

  return null;
}

export function operationalDateToDate(value: string | Date) {
  const key = normalizeOperationalDateKey(value);
  if (!key) throw new Error(`Invalid operational date: ${String(value)}`);

  const parts = parseDateKey(key);
  if (!parts) throw new Error(`Invalid operational date: ${String(value)}`);

  return zonedDateTimeToDate({ ...parts, hour: 0, minute: 0, second: 0 });
}

export function todayOperationalDateKey() {
  return toOperationalDateKey(new Date());
}

export function addOperationalDaysKey(value: string | Date, days: number) {
  const key = normalizeOperationalDateKey(value);
  if (!key) throw new Error(`Invalid operational date: ${String(value)}`);

  const parts = parseDateKey(key);
  if (!parts) throw new Error(`Invalid operational date: ${String(value)}`);

  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0, 0, 0));
  return buildDateKey({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
}

export function addOperationalDays(value: string | Date, days: number) {
  return operationalDateToDate(addOperationalDaysKey(value, days));
}

export function operationalDayRange(value: string | Date) {
  const start = operationalDateToDate(value);
  const end = addOperationalDays(value, 1);
  return { start, end };
}

export function diffOperationalDays(left: string | Date, right: string | Date) {
  const leftKey = normalizeOperationalDateKey(left);
  const rightKey = normalizeOperationalDateKey(right);
  if (!leftKey || !rightKey) throw new Error('Invalid operational date input');

  const leftParts = parseDateKey(leftKey);
  const rightParts = parseDateKey(rightKey);
  if (!leftParts || !rightParts) throw new Error('Invalid operational date input');

  const leftMs = Date.UTC(leftParts.year, leftParts.month - 1, leftParts.day);
  const rightMs = Date.UTC(rightParts.year, rightParts.month - 1, rightParts.day);
  return Math.floor((rightMs - leftMs) / MS_PER_DAY);
}

export function getOperationalWeek(startDate: string | Date, today: string | Date) {
  const diffInDays = Math.max(0, diffOperationalDays(startDate, today));
  return Math.floor(diffInDays / 7) + 1;
}

export function isOperationalMonday(value: string | Date) {
  const key = normalizeOperationalDateKey(value);
  if (!key) return false;

  const parts = parseDateKey(key);
  if (!parts) return false;

  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay() === 1;
}
