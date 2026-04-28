export type MapCoordinates = {
  latitude: number;
  longitude: number;
};

function normalizeQueryValue(value: string | null | undefined) {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

export function buildMapNavigationQuery(parts: Array<string | null | undefined>) {
  const query = parts
    .map((part) => normalizeQueryValue(part))
    .filter(Boolean)
    .join(', ');

  return query || null;
}

export function buildGoogleMapsHref(input: {
  coordinates?: MapCoordinates | null;
  query?: string | null;
}) {
  const url = new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api', '1');

  if (input.coordinates) {
    url.searchParams.set('query', `${input.coordinates.latitude},${input.coordinates.longitude}`);
    return url.toString();
  }

  const query = normalizeQueryValue(input.query);
  if (!query) return null;

  url.searchParams.set('query', query);
  return url.toString();
}

export function buildAppleMapsHref(input: {
  coordinates?: MapCoordinates | null;
  query?: string | null;
  label?: string | null;
}) {
  const url = new URL('https://maps.apple.com/');

  if (input.coordinates) {
    url.searchParams.set('ll', `${input.coordinates.latitude},${input.coordinates.longitude}`);
    const label = normalizeQueryValue(input.label);
    if (label) {
      url.searchParams.set('q', label);
    }
    return url.toString();
  }

  const query = normalizeQueryValue(input.query);
  if (!query) return null;

  url.searchParams.set('q', query);
  return url.toString();
}
