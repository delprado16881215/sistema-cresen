import 'server-only';

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export type PostalCodeRecord = {
  postalCode: string;
  settlement: string;
  settlementType: string;
  municipality: string;
  city: string;
  state: string;
};

export type PostalCodeDataset = {
  country: string;
  stateCode?: string;
  state: string;
  source: {
    provider: string;
    url: string;
    format: string;
    downloadedAt: string;
    officialUpdatedAt?: string;
  };
  records: PostalCodeRecord[];
};

export type PostalCodeOption = {
  postalCode: string;
  neighborhood: string;
  city: string;
  state: string;
  municipality: string;
  settlementType: string;
};

type PostalCodeDatasetSummary = {
  country: string;
  state: string;
  stateCode?: string;
  source: string;
  format: string;
  downloadedAt: string;
  postalCodes: number;
  settlements: number;
};

const DATASETS_ROOT = path.join(process.cwd(), 'src/data/postal-codes/mx');

function listJsonFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });

  return entries.flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listJsonFiles(entryPath);
    }

    return entry.isFile() && entry.name.endsWith('.json') ? [entryPath] : [];
  });
}

function loadDatasets(): PostalCodeDataset[] {
  return listJsonFiles(DATASETS_ROOT).map((filePath) => {
    const content = readFileSync(filePath, 'utf8');
    return JSON.parse(content) as PostalCodeDataset;
  });
}

const DATASETS = loadDatasets();
const POSTAL_CODE_INDEX = new Map<string, PostalCodeOption[]>();

for (const dataset of DATASETS) {
  for (const record of dataset.records) {
    const current = POSTAL_CODE_INDEX.get(record.postalCode) ?? [];
    current.push({
      postalCode: record.postalCode,
      neighborhood: record.settlement,
      city: record.city,
      state: record.state,
      municipality: record.municipality,
      settlementType: record.settlementType,
    });

    current.sort((left, right) => left.neighborhood.localeCompare(right.neighborhood, 'es-MX'));
    POSTAL_CODE_INDEX.set(record.postalCode, current);
  }
}

export function getPostalCodeOptions(postalCode: string): PostalCodeOption[] {
  return POSTAL_CODE_INDEX.get(postalCode) ?? [];
}

export function getPostalCodeDatasetsSummary(): PostalCodeDatasetSummary[] {
  return DATASETS.map((dataset) => ({
    country: dataset.country,
    state: dataset.state,
    stateCode: dataset.stateCode,
    source: dataset.source.provider,
    format: dataset.source.format,
    downloadedAt: dataset.source.downloadedAt,
    postalCodes: new Set(dataset.records.map((record) => record.postalCode)).size,
    settlements: dataset.records.length,
  }));
}
