import { rgb, type PDFImage, type PDFFont, type PDFPage } from 'pdf-lib';
import { formatCurrency } from '@/modules/creditos/credit-calculations';
import type { CobranzaPrejuridicaCitatorioSummary } from '@/server/services/cobranza-prejuridica-citatorio-summary-service';
import type { CobranzaPrejuridicaCitatorioConfig } from '@/server/document-templates/cobranza-prejuridica/citatorio-primera-visita.config';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 396;
const MARGIN = 22;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const SECTION_GAP = 10;
const COLUMN_GAP = 12;
const LEFT_COLUMN_WIDTH = 250;
const RIGHT_COLUMN_WIDTH = CONTENT_WIDTH - LEFT_COLUMN_WIDTH - COLUMN_GAP;
const HEADER_HEIGHT = 62;
const FOOTER_HEIGHT = 48;
const BODY_HEIGHT = PAGE_HEIGHT - MARGIN * 2 - HEADER_HEIGHT - FOOTER_HEIGHT - SECTION_GAP * 2;

type TemplateColors = {
  ink: ReturnType<typeof rgb>;
  muted: ReturnType<typeof rgb>;
  border: ReturnType<typeof rgb>;
  panel: ReturnType<typeof rgb>;
  accent: ReturnType<typeof rgb>;
  accentSoft: ReturnType<typeof rgb>;
};

type TemplateFonts = {
  regular: PDFFont;
  bold: PDFFont;
};

type RenderCitatorioPageInput = {
  page: PDFPage;
  summary: CobranzaPrejuridicaCitatorioSummary;
  config: CobranzaPrejuridicaCitatorioConfig;
  fonts: TemplateFonts;
  pageNumber: number;
  totalPages: number;
  logo: PDFImage | null;
};

function drawTextLine(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
) {
  page.drawText(text, { x, y, font, size, color });
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (!normalized) return [''];

  const words = normalized.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) lines.push(current);
    current = '';

    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
      continue;
    }

    let fragment = '';
    for (const char of word) {
      const next = `${fragment}${char}`;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        fragment = next;
        continue;
      }
      if (fragment) lines.push(fragment);
      fragment = char;
    }
    current = fragment;
  }

  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function fitLines(lines: string[], maxLines: number) {
  if (lines.length <= maxLines) return lines;
  const visible = lines.slice(0, maxLines);
  if (!visible.length) return visible;
  const lastIndex = visible.length - 1;
  const lastLine = visible[lastIndex] ?? '';
  visible[lastIndex] =
    lastLine.length > 2
      ? `${lastLine.slice(0, Math.max(0, lastLine.length - 1))}…`
      : '…';
  return visible;
}

function drawWrappedBlock(input: {
  page: PDFPage;
  text: string;
  x: number;
  y: number;
  width: number;
  font: PDFFont;
  size: number;
  color: ReturnType<typeof rgb>;
  lineHeight: number;
  maxLines?: number;
}) {
  const rawLines = wrapText(input.text, input.font, input.size, input.width);
  const lines =
    typeof input.maxLines === 'number' ? fitLines(rawLines, input.maxLines) : rawLines;

  lines.forEach((line, index) => {
    drawTextLine(
      input.page,
      line,
      input.x,
      input.y - index * input.lineHeight,
      input.font,
      input.size,
      input.color,
    );
  });

  return lines.length;
}

function drawFieldRows(input: {
  page: PDFPage;
  fields: Array<{ label: string; value: string }>;
  x: number;
  y: number;
  width: number;
  fonts: TemplateFonts;
  colors: TemplateColors;
  labelWidth?: number;
  rowGap?: number;
}) {
  const rowGap = input.rowGap ?? 14;
  const labelWidth = input.labelWidth ?? 68;
  input.fields.forEach((field, index) => {
    const rowY = input.y - index * rowGap;
    drawTextLine(input.page, `${field.label}:`, input.x, rowY, input.fonts.bold, 8, input.colors.muted);
    drawWrappedBlock({
      page: input.page,
      text: field.value,
      x: input.x + labelWidth,
      y: rowY,
      width: input.width - labelWidth,
      font: input.fonts.regular,
      size: 8.2,
      color: input.colors.ink,
      lineHeight: 9,
      maxLines: 2,
    });
  });
}

function drawSectionBox(input: {
  page: PDFPage;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  fonts: TemplateFonts;
  colors: TemplateColors;
  body: (args: { x: number; y: number; width: number; height: number }) => void;
}) {
  input.page.drawRectangle({
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    color: input.colors.panel,
    borderColor: input.colors.border,
    borderWidth: 0.8,
  });
  input.page.drawRectangle({
    x: input.x,
    y: input.y + input.height - 18,
    width: input.width,
    height: 18,
    color: input.colors.accentSoft,
  });
  drawTextLine(
    input.page,
    input.title,
    input.x + 10,
    input.y + input.height - 12.5,
    input.fonts.bold,
    8.2,
    input.colors.ink,
  );
  input.body({
    x: input.x + 10,
    y: input.y + input.height - 28,
    width: input.width - 20,
    height: input.height - 36,
  });
}

function formatAmount(value: number) {
  return formatCurrency(Number(value.toFixed(2)));
}

function drawHeader(input: {
  page: PDFPage;
  summary: CobranzaPrejuridicaCitatorioSummary;
  config: CobranzaPrejuridicaCitatorioConfig;
  fonts: TemplateFonts;
  colors: TemplateColors;
  logo: PDFImage | null;
}) {
  const { page, summary, config, fonts, colors, logo } = input;
  const top = PAGE_HEIGHT - MARGIN;
  const logoSlotX = MARGIN + 10;
  const logoSlotWidth = 112;
  const logoBoxWidth = 58;
  const logoBoxHeight = 58;

  page.drawRectangle({
    x: MARGIN,
    y: top - HEADER_HEIGHT,
    width: CONTENT_WIDTH,
    height: HEADER_HEIGHT,
    color: rgb(1, 1, 1),
    borderColor: colors.border,
    borderWidth: 0.9,
  });

  if (logo) {
    const scale = Math.min(logoBoxWidth / logo.width, logoBoxHeight / logo.height);
    const width = logo.width * scale;
    const height = logo.height * scale;
    page.drawImage(logo, {
      x: logoSlotX + (logoSlotWidth - width) / 2,
      y: top - 8 - height,
      width,
      height,
    });
  }

  drawTextLine(page, config.documentTitle, MARGIN + 138, top - 18, fonts.bold, 14, colors.ink);
  drawTextLine(page, config.despachoNombre, MARGIN + 138, top - 35, fonts.bold, 8.8, colors.accent);
  drawTextLine(page, config.despachoSubtitle, MARGIN + 138, top - 47, fonts.regular, 8, colors.muted);

  drawTextLine(
    page,
    'Fecha de emision',
    MARGIN + CONTENT_WIDTH - 150,
    top - 22,
    fonts.bold,
    8.6,
    colors.muted,
  );
  drawTextLine(
    page,
    summary.operational.fechaEmisionLabel,
    MARGIN + CONTENT_WIDTH - 150,
    top - 38,
    fonts.bold,
    10,
    colors.ink,
  );
}

function drawFooter(input: {
  page: PDFPage;
  config: CobranzaPrejuridicaCitatorioConfig;
  fonts: TemplateFonts;
  colors: TemplateColors;
}) {
  const { page, config, fonts, colors } = input;
  const footerY = MARGIN;

  page.drawRectangle({
    x: MARGIN,
    y: footerY,
    width: CONTENT_WIDTH,
    height: FOOTER_HEIGHT,
    borderColor: colors.border,
    borderWidth: 0.8,
    color: rgb(1, 1, 1),
  });

  drawTextLine(page, 'Atentamente,', MARGIN + 12, footerY + 30, fonts.regular, 8.4, colors.ink);
  drawTextLine(page, config.firmaResponsable, MARGIN + 12, footerY + 17, fonts.bold, 8.8, colors.ink);
  drawTextLine(page, config.firmaCargo, MARGIN + 12, footerY + 6, fonts.regular, 8, colors.muted);

  drawTextLine(
    page,
    config.telefonoContacto,
    MARGIN + 210,
    footerY + 17,
    fonts.bold,
    8.4,
    colors.accent,
  );
}

export function renderCobranzaPrejuridicaCitatorioPage(input: RenderCitatorioPageInput) {
  const colors: TemplateColors = {
    ink: rgb(0.12, 0.14, 0.18),
    muted: rgb(0.36, 0.39, 0.43),
    border: rgb(0.79, 0.83, 0.88),
    panel: rgb(0.97, 0.98, 0.99),
    accent: rgb(0.07, 0.42, 0.32),
    accentSoft: rgb(0.9, 0.96, 0.93),
  };

  const bodyTop = PAGE_HEIGHT - MARGIN - HEADER_HEIGHT - SECTION_GAP;
  const leftX = MARGIN;
  const rightX = leftX + LEFT_COLUMN_WIDTH + COLUMN_GAP;
  const bodyBottom = MARGIN + FOOTER_HEIGHT + SECTION_GAP;

  const identificationHeight = 118;
  const financialHeight = BODY_HEIGHT - identificationHeight - SECTION_GAP;
  const detailsHeight = 62;
  const narrativeHeight = BODY_HEIGHT - detailsHeight - SECTION_GAP;

  drawHeader({
    page: input.page,
    summary: input.summary,
    config: input.config,
    fonts: input.fonts,
    colors,
    logo: input.logo,
  });

  drawSectionBox({
    page: input.page,
    x: leftX,
    y: bodyTop - identificationHeight,
    width: LEFT_COLUMN_WIDTH,
    height: identificationHeight,
    title: 'Identificacion y cliente',
    fonts: input.fonts,
    colors,
    body: ({ x, y, width }) => {
      drawFieldRows({
        page: input.page,
        fields: [
          { label: 'Cliente', value: input.summary.identification.clienteNombre },
          { label: 'Credito', value: input.summary.identification.creditoFolio },
        ],
        x,
        y,
        width,
        fonts: input.fonts,
        colors,
        rowGap: 16,
      });
      drawWrappedBlock({
        page: input.page,
        text: input.summary.identification.clienteDomicilio,
        x,
        y: y - 50,
        width,
        font: input.fonts.regular,
        size: 8,
        color: colors.ink,
        lineHeight: 9,
        maxLines: 3,
      });
    },
  });

  drawSectionBox({
    page: input.page,
    x: leftX,
    y: bodyBottom,
    width: LEFT_COLUMN_WIDTH,
    height: financialHeight,
    title: 'Saldo exigible',
    fonts: input.fonts,
    colors,
    body: ({ x, y, width }) => {
      drawTextLine(input.page, 'Monto principal del requerimiento', x, y, input.fonts.bold, 8.2, colors.muted);
      drawTextLine(
        input.page,
        formatAmount(input.summary.financial.saldoExigible),
        x,
        y - 28,
        input.fonts.bold,
        20,
        colors.ink,
      );
      drawWrappedBlock({
        page: input.page,
        text: 'Adeudo vencido exigible a la fecha de emision del presente citatorio.',
        x,
        y: y - 52,
        width,
        font: input.fonts.regular,
        size: 7.8,
        color: colors.muted,
        lineHeight: 8.8,
        maxLines: 3,
      });
    },
  });

  drawSectionBox({
    page: input.page,
    x: rightX,
    y: bodyTop - detailsHeight,
    width: RIGHT_COLUMN_WIDTH,
    height: detailsHeight,
    title: 'Datos del cliente',
    fonts: input.fonts,
    colors,
    body: ({ x, y, width }) => {
      drawFieldRows({
        page: input.page,
        fields: [
          { label: 'Aval', value: input.summary.customer.avalLabel },
          { label: 'Telefono', value: input.summary.customer.telefono },
        ],
        x,
        y,
        width,
        fonts: input.fonts,
        colors,
        rowGap: 14,
      });
    },
  });

  drawSectionBox({
    page: input.page,
    x: rightX,
    y: bodyBottom,
    width: RIGHT_COLUMN_WIDTH,
    height: narrativeHeight,
    title: 'CITATORIO',
    fonts: input.fonts,
    colors,
    body: ({ x, y, width, height }) => {
      const recapPaddingX = 8;
      const recapPaddingY = 6;
      const recapBottomMargin = 10;
      const recapTopGap = 10;
      let paragraphSize = 8.1;
      let paragraphLineHeight = 9.2;
      const minParagraphSize = 7.3;
      const minParagraphLineHeight = 8.2;
      const paragraphGap = [8, 6, 0];
      const recapSize = 7.6;
      const recapLineHeight = 8.2;
      const recapText = `Cliente: ${input.summary.identification.clienteNombre}. Domicilio registrado: ${input.summary.identification.clienteDomicilio}.`;
      const innerBottomY = y - height;
      const recapLines = wrapText(
        recapText,
        input.fonts.bold,
        recapSize,
        width - recapPaddingX * 2,
      );
      const recapBoxHeight = recapLines.length * recapLineHeight + recapPaddingY * 2;
      const recapBoxY = innerBottomY + recapBottomMargin;
      const paragraphBottomLimit = recapBoxY + recapBoxHeight + recapTopGap;
      const availableParagraphHeight = y - paragraphBottomLimit;

      while (paragraphSize > minParagraphSize && paragraphLineHeight > minParagraphLineHeight) {
        const projectedHeight = input.config.baseText.reduce((total, paragraph, index) => {
          const lineCount = wrapText(
            paragraph,
            input.fonts.regular,
            paragraphSize,
            width,
          ).length;
          return total + lineCount * paragraphLineHeight + (paragraphGap[index] ?? 0);
        }, 0);
        if (projectedHeight <= availableParagraphHeight) break;
        paragraphSize -= 0.2;
        paragraphLineHeight -= 0.2;
      }

      let cursorY = y;
      input.config.baseText.forEach((paragraph, index) => {
        const lineCount = drawWrappedBlock({
          page: input.page,
          text: paragraph,
          x,
          y: cursorY,
          width,
          font: input.fonts.regular,
          size: paragraphSize,
          color: colors.ink,
          lineHeight: paragraphLineHeight,
        });
        cursorY -= lineCount * paragraphLineHeight + (paragraphGap[index] ?? 0);
      });

      input.page.drawRectangle({
        x,
        y: recapBoxY,
        width,
        height: recapBoxHeight,
        color: colors.accentSoft,
      });

      drawWrappedBlock({
        page: input.page,
        text: recapText,
        x: x + recapPaddingX,
        y: recapBoxY + recapBoxHeight - recapPaddingY - 1,
        width: width - recapPaddingX * 2,
        font: input.fonts.bold,
        size: recapSize,
        color: colors.accent,
        lineHeight: recapLineHeight,
      });
    },
  });

  drawFooter({
    page: input.page,
    config: input.config,
    fonts: input.fonts,
    colors,
  });
}
