import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { COBRANZA_PREJURIDICA_CITATORIO_CONFIG } from '@/server/document-templates/cobranza-prejuridica/citatorio-primera-visita.config';
import {
  COBRANZA_PREJURIDICA_CITATORIO_PAGE_SIZE,
  renderCobranzaPrejuridicaCitatorioPage,
} from '@/server/document-templates/cobranza-prejuridica/citatorio-primera-visita-formal.template';
import type { CobranzaPrejuridicaCitatorioSummary } from '@/server/services/cobranza-prejuridica-citatorio-summary-service';

type GeneratePdfInput = {
  summaries: CobranzaPrejuridicaCitatorioSummary[];
  fileName: string;
};

async function loadLogoBytes() {
  const relativePath = COBRANZA_PREJURIDICA_CITATORIO_CONFIG.logoPublicPath.replace(/^\/+/, '');
  const absolutePath = path.join(process.cwd(), 'public', relativePath);

  try {
    return await fs.readFile(absolutePath);
  } catch {
    return null;
  }
}

export async function generateCobranzaPrejuridicaCitatorioPdf(input: GeneratePdfInput) {
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const logoBytes = await loadLogoBytes();
  const logo = logoBytes ? await pdfDoc.embedPng(logoBytes) : null;

  input.summaries.forEach((summary, index) => {
    const page = pdfDoc.addPage([
      COBRANZA_PREJURIDICA_CITATORIO_PAGE_SIZE[0],
      COBRANZA_PREJURIDICA_CITATORIO_PAGE_SIZE[1],
    ]);
    renderCobranzaPrejuridicaCitatorioPage({
      page,
      summary,
      config: COBRANZA_PREJURIDICA_CITATORIO_CONFIG,
      fonts: {
        regular,
        bold,
      },
      pageNumber: index + 1,
      totalPages: input.summaries.length,
      logo,
    });
  });

  return {
    bytes: await pdfDoc.save(),
    fileName: input.fileName,
    contentType: 'application/pdf',
  };
}
