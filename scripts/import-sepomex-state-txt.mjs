import fs from 'node:fs';
import path from 'node:path';

function normalizeValue(value) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

const [inputPath, outputPath, stateCode, stateName, officialUpdatedAt] = process.argv.slice(2);

if (!inputPath || !outputPath || !stateCode || !stateName) {
  console.error(
    'Uso: node scripts/import-sepomex-state-txt.mjs <input.txt> <output.json> <stateCode> <stateName> [officialUpdatedAt]',
  );
  process.exit(1);
}

const raw = fs.readFileSync(inputPath);
const text = raw.toString('latin1');
const lines = text.split(/\r?\n/).filter(Boolean);

if (lines.length < 3) {
  console.error('El archivo TXT de SEPOMEX no contiene suficientes filas.');
  process.exit(1);
}

const dataLines = lines.slice(2);
const records = dataLines
  .map((line) => line.split('|'))
  .filter((columns) => columns.length >= 6)
  .map((columns) => {
    const municipality = normalizeValue(columns[3] ?? '');
    const city = normalizeValue(columns[5] ?? '') || municipality;

    return {
      postalCode: columns[0]?.trim() ?? '',
      settlement: normalizeValue(columns[1] ?? ''),
      settlementType: normalizeValue(columns[2] ?? ''),
      municipality,
      state: normalizeValue(columns[4] ?? stateName),
      city,
    };
  })
  .filter((record) => record.postalCode && record.settlement);

records.sort((left, right) => {
  if (left.postalCode !== right.postalCode) {
    return left.postalCode.localeCompare(right.postalCode, 'es-MX');
  }

  return left.settlement.localeCompare(right.settlement, 'es-MX');
});

const payload = {
  country: 'MX',
  stateCode,
  state: normalizeValue(stateName),
  source: {
    provider: 'SEPOMEX / Correos de Mexico',
    url: 'https://www.correosdemexico.gob.mx/SSLServicios/ConsultaCP/CodigoPostal_Exportar.aspx',
    format: 'TXT',
    downloadedAt: new Date().toISOString(),
    officialUpdatedAt: officialUpdatedAt ?? null,
  },
  records,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

const postalCodes = new Set(records.map((record) => record.postalCode));
const municipalities = new Set(records.map((record) => record.municipality));

console.log(
  JSON.stringify(
    {
      outputPath,
      postalCodes: postalCodes.size,
      settlements: records.length,
      municipalities: municipalities.size,
    },
    null,
    2,
  ),
);
