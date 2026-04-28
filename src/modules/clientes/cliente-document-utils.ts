export type ClienteDocumentType =
  | 'ineFront'
  | 'ineBack'
  | 'pagareFront'
  | 'pagareBack'
  | 'proofOfAddress';

const LEGACY_CLIENTE_DOCUMENT_PREFIX = '/uploads/clientes/';
const CLIENTE_DOCUMENT_STORAGE_KEY_PATTERN =
  /^clientes\/[A-Za-z0-9_-]+\/(ineFront|ineBack|pagareFront|pagareBack|proofOfAddress)\/[A-Za-z0-9._-]+\.(jpg|png|webp)$/;

export function buildClienteDocumentEndpoint(clienteId: string, documentType: ClienteDocumentType) {
  return `/api/clientes/${clienteId}/documentos/${documentType}`;
}

export function isLegacyClienteDocumentPath(value: string | null | undefined) {
  return typeof value === 'string' && value.startsWith(LEGACY_CLIENTE_DOCUMENT_PREFIX);
}

export function isClienteDocumentStorageKey(value: string | null | undefined) {
  return typeof value === 'string' && CLIENTE_DOCUMENT_STORAGE_KEY_PATTERN.test(value);
}
