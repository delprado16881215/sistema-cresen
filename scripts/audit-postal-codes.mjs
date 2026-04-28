import fs from 'node:fs';
import path from 'node:path';

const root = path.join(process.cwd(), 'src/data/postal-codes/mx');

function listJsonFiles(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });

  return entries.flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listJsonFiles(entryPath);
    }

    return entry.isFile() && entry.name.endsWith('.json') ? [entryPath] : [];
  });
}

const summaries = [];
const postalCodeMap = new Map();
const municipalityMap = new Map();
let totalSettlements = 0;

for (const filePath of listJsonFiles(root)) {
  const dataset = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const datasetPostalCodes = new Set(dataset.records.map((record) => record.postalCode));
  summaries.push({
    file: path.relative(process.cwd(), filePath),
    state: dataset.state,
    postalCodes: datasetPostalCodes.size,
    settlements: dataset.records.length,
  });

  for (const record of dataset.records) {
    totalSettlements += 1;

    const postalCodeItems = postalCodeMap.get(record.postalCode) ?? [];
    postalCodeItems.push(record);
    postalCodeMap.set(record.postalCode, postalCodeItems);

    const municipalityKey = `${record.state}::${record.municipality}`;
    const municipalityItems = municipalityMap.get(municipalityKey) ?? [];
    municipalityItems.push(record);
    municipalityMap.set(municipalityKey, municipalityItems);
  }
}

const postalCodeCoverage = [...postalCodeMap.entries()]
  .map(([postalCode, records]) => ({
    postalCode,
    settlements: records.length,
    municipalities: [...new Set(records.map((record) => record.municipality))],
    cities: [...new Set(records.map((record) => record.city))],
  }))
  .sort((left, right) => left.postalCode.localeCompare(right.postalCode, 'es-MX'));

const weakPostalCodes = postalCodeCoverage.filter((item) => item.settlements <= 2);
const zeroSettlementPostalCodes = postalCodeCoverage.filter((item) => item.settlements === 0);
const inconsistentRecords = [...postalCodeMap.entries()]
  .filter(([, records]) => records.some((record) => !record.city || !record.state))
  .map(([postalCode]) => postalCode);

const tepicRecords = municipalityMap.get('NAYARIT::TEPIC') ?? [];
const nayaritPostalCodes = new Set(
  [...municipalityMap.entries()]
    .filter(([key]) => key.startsWith('NAYARIT::'))
    .flatMap(([, records]) => records.map((record) => record.postalCode)),
);

const report = {
  datasets: summaries,
  totals: {
    postalCodes: postalCodeMap.size,
    settlements: totalSettlements,
    municipalities: municipalityMap.size,
  },
  stateCoverage: {
    nayarit: {
      postalCodes: nayaritPostalCodes.size,
      settlements: [...municipalityMap.entries()]
        .filter(([key]) => key.startsWith('NAYARIT::'))
        .reduce((sum, [, records]) => sum + records.length, 0),
      municipalities: [...municipalityMap.keys()].filter((key) => key.startsWith('NAYARIT::')).length,
    },
    tepic: {
      postalCodes: new Set(tepicRecords.map((record) => record.postalCode)).size,
      settlements: tepicRecords.length,
    },
  },
  weakPostalCodes,
  zeroSettlementPostalCodes,
  inconsistentRecords,
};

console.log(JSON.stringify(report, null, 2));
