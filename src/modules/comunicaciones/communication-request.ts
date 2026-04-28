'use client';

type ApiErrorResponse = {
  message?: string;
};

export async function requestJson<T>(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => ({}))) as T & ApiErrorResponse;

  if (!response.ok) {
    throw new Error(body.message ?? 'No se pudo completar la operación.');
  }

  return body as T;
}
