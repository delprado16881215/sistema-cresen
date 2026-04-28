import 'server-only';

import {
  type ClienteDocumentType,
  deleteClienteDocument,
  isStorageKey,
  uploadClienteDocument,
  validateClienteDocumentFile,
} from '@/server/uploads/cliente-document-storage';

type ClienteDocumentFiles = {
  ineFrontFile?: File | null;
  ineBackFile?: File | null;
  pagareFrontFile?: File | null;
  pagareBackFile?: File | null;
  proofOfAddressFile?: File | null;
};

type ClienteDocumentPaths = {
  ineFrontPath?: string;
  ineBackPath?: string;
  pagareFrontPath?: string;
  pagareBackPath?: string;
  proofOfAddressPath?: string;
};

type ClienteDocumentPersistenceResult = ClienteDocumentPaths & {
  storageKeysToDelete: string[];
};

const DOCUMENT_FILE_CONFIG: Array<{
  fileField: keyof ClienteDocumentFiles;
  pathField: keyof ClienteDocumentPaths;
  documentType: ClienteDocumentType;
}> = [
  { fileField: 'ineFrontFile', pathField: 'ineFrontPath', documentType: 'ineFront' },
  { fileField: 'ineBackFile', pathField: 'ineBackPath', documentType: 'ineBack' },
  { fileField: 'pagareFrontFile', pathField: 'pagareFrontPath', documentType: 'pagareFront' },
  { fileField: 'pagareBackFile', pathField: 'pagareBackPath', documentType: 'pagareBack' },
  { fileField: 'proofOfAddressFile', pathField: 'proofOfAddressPath', documentType: 'proofOfAddress' },
];

function normalizeOptionalFile(value: FormDataEntryValue | null): File | null {
  if (!(value instanceof File)) {
    return null;
  }

  return value.size > 0 ? value : null;
}

export function validateClienteDocumentFiles(files: ClienteDocumentFiles) {
  for (const config of DOCUMENT_FILE_CONFIG) {
    const file = files[config.fileField];
    if (file) {
      validateClienteDocumentFile(file, config.documentType);
    }
  }
}

export function parseClienteDocumentFiles(formData: FormData): ClienteDocumentFiles {
  return {
    ineFrontFile: normalizeOptionalFile(formData.get('ineFront')),
    ineBackFile: normalizeOptionalFile(formData.get('ineBack')),
    pagareFrontFile: normalizeOptionalFile(formData.get('pagareFront')),
    pagareBackFile: normalizeOptionalFile(formData.get('pagareBack')),
    proofOfAddressFile: normalizeOptionalFile(formData.get('proofOfAddress')),
  };
}

export async function persistClienteDocuments(input: {
  clienteId: string;
  files: ClienteDocumentFiles;
  currentPaths?: {
    ineFrontPath?: string | null;
    ineBackPath?: string | null;
    pagareFrontPath?: string | null;
    pagareBackPath?: string | null;
    proofOfAddressPath?: string | null;
  };
}): Promise<ClienteDocumentPersistenceResult> {
  const output: ClienteDocumentPersistenceResult = { storageKeysToDelete: [] };

  for (const config of DOCUMENT_FILE_CONFIG) {
    const file = input.files[config.fileField];
    if (!file) {
      continue;
    }

    const uploaded = await uploadClienteDocument({
      clienteId: input.clienteId,
      documentType: config.documentType,
      file,
    });
    output[config.pathField] = uploaded.storageKey;

    const currentPath = input.currentPaths?.[config.pathField];
    if (typeof currentPath === 'string' && isStorageKey(currentPath) && currentPath !== uploaded.storageKey) {
      output.storageKeysToDelete.push(currentPath);
    }
  }

  return output;
}

export async function deleteReplacedClienteDocuments(storageKeys: string[]) {
  const uniqueStorageKeys = Array.from(new Set(storageKeys)).filter(isStorageKey);

  for (const storageKey of uniqueStorageKeys) {
    await deleteClienteDocument(storageKey);
  }
}
