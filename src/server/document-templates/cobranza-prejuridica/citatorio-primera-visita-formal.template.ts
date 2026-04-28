import { rgb, type PDFImage, type PDFFont, type PDFPage } from 'pdf-lib';
import { formatCurrency } from '@/modules/creditos/credit-calculations';
import type { CobranzaPrejuridicaCitatorioSummary } from '@/server/services/cobranza-prejuridica-citatorio-summary-service';
import type { CobranzaPrejuridicaCitatorioConfig } from '@/server/document-templates/cobranza-prejuridica/citatorio-primera-visita.config';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
export const COBRANZA_PREJURIDICA_CITATORIO_PAGE_SIZE = [PAGE_WIDTH, PAGE_HEIGHT] as const;

const MARGIN_X = 54;
const MARGIN_TOP = 42;
const MARGIN_BOTTOM = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const HEADER_HEIGHT = 82;
const SIGNATURE_BLOCK_HEIGHT = 112;
const SECTION_GAP = 16;

type TemplateColors = {
  ink: ReturnType<typeof rgb>;
  muted: ReturnType<typeof rgb>;
  accent: ReturnType<typeof rgb>;
  line: ReturnType<typeof rgb>;
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

function drawCenteredText(
  page: PDFPage,
  text: string,
  centerX: number,
  y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
) {
  const textWidth = font.widthOfTextAtSize(text, size);
  drawTextLine(page, text, centerX - textWidth / 2, y, font, size, color);
}

function drawRule(page: PDFPage, y: number, color: ReturnType<typeof rgb>, thickness = 0.8) {
  page.drawLine({
    start: { x: MARGIN_X, y },
    end: { x: PAGE_WIDTH - MARGIN_X, y },
    thickness,
    color,
  });
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
}) {
  const lines = wrapText(input.text, input.font, input.size, input.width);
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

function drawField(input: {
  page: PDFPage;
  label: string;
  value: string;
  x: number;
  y: number;
  width: number;
  labelWidth: number;
  fonts: TemplateFonts;
  colors: TemplateColors;
  size?: number;
  lineHeight?: number;
}) {
  const size = input.size ?? 10.4;
  const lineHeight = input.lineHeight ?? 13.5;

  drawTextLine(
    input.page,
    `${input.label}:`,
    input.x,
    input.y,
    input.fonts.bold,
    size,
    input.colors.ink,
  );

  const valueLines = wrapText(
    input.value,
    input.fonts.regular,
    size,
    input.width - input.labelWidth,
  );

  valueLines.forEach((line, index) => {
    drawTextLine(
      input.page,
      line,
      input.x + input.labelWidth,
      input.y - index * lineHeight,
      input.fonts.regular,
      size,
      input.colors.ink,
    );
  });

  return valueLines.length * lineHeight;
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
  const top = PAGE_HEIGHT - MARGIN_TOP;
  const logoMaxWidth = 96;
  const logoMaxHeight = 96;

  if (logo) {
    const scale = Math.min(logoMaxWidth / logo.width, logoMaxHeight / logo.height);
    const width = logo.width * scale;
    const height = logo.height * scale;
    page.drawImage(logo, {
      x: MARGIN_X,
      y: top - height + 8,
      width,
      height,
    });
  }

  const textStartX = MARGIN_X + 108;
  drawTextLine(page, config.despachoNombre, textStartX, top - 20, fonts.bold, 17, colors.ink);
  drawTextLine(page, config.despachoSubtitle, textStartX, top - 38, fonts.regular, 10, colors.muted);

  const dateLabel = 'Fecha de emision';
  const dateValue = summary.operational.fechaEmisionLabel;
  const dateRightX = PAGE_WIDTH - MARGIN_X;
  drawTextLine(
    page,
    dateLabel,
    dateRightX - fonts.bold.widthOfTextAtSize(dateLabel, 10),
    top - 22,
    fonts.bold,
    10,
    colors.muted,
  );
  drawTextLine(
    page,
    dateValue,
    dateRightX - fonts.bold.widthOfTextAtSize(dateValue, 12),
    top - 40,
    fonts.bold,
    12,
    colors.ink,
  );

  drawRule(page, top - HEADER_HEIGHT - 10, colors.line, 1);
}

function drawClientSection(input: {
  page: PDFPage;
  summary: CobranzaPrejuridicaCitatorioSummary;
  fonts: TemplateFonts;
  colors: TemplateColors;
  startY: number;
}) {
  const { page, summary, fonts, colors, startY } = input;
  let cursorY = startY;

  drawTextLine(page, 'DATOS DEL CLIENTE', MARGIN_X, cursorY, fonts.bold, 10.2, colors.accent);
  cursorY -= 8;
  drawRule(page, cursorY, colors.line);
  cursorY -= 14;

  const labelWidth = 78;
  cursorY -= drawField({
    page,
    label: 'Cliente',
    value: summary.identification.clienteNombre,
    x: MARGIN_X,
    y: cursorY,
    width: CONTENT_WIDTH,
    labelWidth,
    fonts,
    colors,
  });
  cursorY -= 8;

  cursorY -= drawField({
    page,
    label: 'Domicilio',
    value: summary.identification.clienteDomicilio,
    x: MARGIN_X,
    y: cursorY,
    width: CONTENT_WIDTH,
    labelWidth,
    fonts,
    colors,
  });
  cursorY -= 8;

  cursorY -= drawField({
    page,
    label: 'Credito',
    value: summary.identification.creditoFolio,
    x: MARGIN_X,
    y: cursorY,
    width: CONTENT_WIDTH,
    labelWidth,
    fonts,
    colors,
  });
  cursorY -= 8;

  cursorY -= drawField({
    page,
    label: 'Telefono',
    value: summary.customer.telefono,
    x: MARGIN_X,
    y: cursorY,
    width: CONTENT_WIDTH,
    labelWidth,
    fonts,
    colors,
  });
  cursorY -= 8;

  cursorY -= drawField({
    page,
    label: 'Aval',
    value: summary.customer.avalLabel,
    x: MARGIN_X,
    y: cursorY,
    width: CONTENT_WIDTH,
    labelWidth,
    fonts,
    colors,
  });

  return cursorY;
}

function drawAmountSection(input: {
  page: PDFPage;
  summary: CobranzaPrejuridicaCitatorioSummary;
  fonts: TemplateFonts;
  colors: TemplateColors;
  startY: number;
}) {
  const { page, summary, fonts, colors, startY } = input;
  let cursorY = startY;

  drawTextLine(page, 'SALDO EXIGIBLE', MARGIN_X, cursorY, fonts.bold, 10.2, colors.accent);
  cursorY -= 8;
  drawRule(page, cursorY, colors.line);
  cursorY -= 22;

  drawCenteredText(
    page,
    formatAmount(summary.financial.saldoExigible),
    PAGE_WIDTH / 2,
    cursorY,
    fonts.bold,
    26,
    colors.ink,
  );
  cursorY -= 20;

  drawCenteredText(
    page,
    'Adeudo vencido exigible a la fecha de emision del presente citatorio.',
    PAGE_WIDTH / 2,
    cursorY,
    fonts.regular,
    9.4,
    colors.muted,
  );

  return cursorY - 20;
}

function drawNarrative(input: {
  page: PDFPage;
  summary: CobranzaPrejuridicaCitatorioSummary;
  config: CobranzaPrejuridicaCitatorioConfig;
  fonts: TemplateFonts;
  colors: TemplateColors;
  startY: number;
  bottomLimit: number;
}) {
  const { page, summary, config, fonts, colors, startY, bottomLimit } = input;
  const title = config.documentTitle.toUpperCase();
  let cursorY = startY;

  drawCenteredText(page, title, PAGE_WIDTH / 2, cursorY, fonts.bold, 18, colors.ink);
  cursorY -= 8;
  drawRule(page, cursorY, colors.line);
  cursorY -= 18;

  let paragraphSize = 9.7;
  let paragraphLineHeight = 13.2;
  const minParagraphSize = 8.6;
  const minParagraphLineHeight = 11.6;
  const paragraphGap = 10;

  while (paragraphSize > minParagraphSize && paragraphLineHeight > minParagraphLineHeight) {
    const projectedHeight = config.baseText.reduce((total, paragraph) => {
      const lines = wrapText(paragraph, fonts.regular, paragraphSize, CONTENT_WIDTH).length;
      return total + lines * paragraphLineHeight + paragraphGap;
    }, 0);
    if (cursorY - projectedHeight >= bottomLimit) break;
    paragraphSize -= 0.2;
    paragraphLineHeight -= 0.2;
  }

  config.baseText.forEach((paragraph) => {
    const lineCount = drawWrappedBlock({
      page,
      text: paragraph,
      x: MARGIN_X,
      y: cursorY,
      width: CONTENT_WIDTH,
      font: fonts.regular,
      size: paragraphSize,
      color: colors.ink,
      lineHeight: paragraphLineHeight,
    });
    cursorY -= lineCount * paragraphLineHeight + paragraphGap;
  });

  cursorY -= 2;
  drawTextLine(page, 'Referencia del credito:', MARGIN_X, cursorY, fonts.bold, 9.2, colors.ink);
  drawWrappedBlock({
    page,
    text: `${summary.identification.creditoFolio} · ${summary.identification.clienteNombre}`,
    x: MARGIN_X + 112,
    y: cursorY,
    width: CONTENT_WIDTH - 112,
    font: fonts.regular,
    size: 9.2,
    color: colors.ink,
    lineHeight: 12.2,
  });
}

function drawSignatureBlock(input: {
  page: PDFPage;
  config: CobranzaPrejuridicaCitatorioConfig;
  fonts: TemplateFonts;
  colors: TemplateColors;
}) {
  const { page, config, fonts, colors } = input;
  const centerX = PAGE_WIDTH / 2;
  const lineWidth = 220;
  const lineY = MARGIN_BOTTOM + 86;

  drawCenteredText(page, 'Atentamente,', centerX, lineY + 36, fonts.regular, 10, colors.ink);
  page.drawLine({
    start: { x: centerX - lineWidth / 2, y: lineY },
    end: { x: centerX + lineWidth / 2, y: lineY },
    thickness: 0.8,
    color: colors.line,
  });
  drawCenteredText(page, config.firmaResponsable, centerX, lineY - 14, fonts.bold, 10.2, colors.ink);
  drawCenteredText(page, config.despachoNombre, centerX, lineY - 30, fonts.regular, 9.2, colors.ink);
  drawCenteredText(page, config.telefonoContacto, centerX, lineY - 43, fonts.regular, 9.2, colors.ink);
}

export function renderCobranzaPrejuridicaCitatorioPage(input: RenderCitatorioPageInput) {
  const colors: TemplateColors = {
    ink: rgb(0.1, 0.11, 0.13),
    muted: rgb(0.36, 0.38, 0.41),
    accent: rgb(0.13, 0.27, 0.24),
    line: rgb(0.7, 0.73, 0.76),
  };

  input.page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    color: rgb(1, 1, 1),
  });

  drawHeader({
    page: input.page,
    summary: input.summary,
    config: input.config,
    fonts: input.fonts,
    colors,
    logo: input.logo,
  });

  let cursorY = PAGE_HEIGHT - MARGIN_TOP - HEADER_HEIGHT - 22;
  cursorY = drawClientSection({
    page: input.page,
    summary: input.summary,
    fonts: input.fonts,
    colors,
    startY: cursorY,
  });

  cursorY -= SECTION_GAP;
  cursorY = drawAmountSection({
    page: input.page,
    summary: input.summary,
    fonts: input.fonts,
    colors,
    startY: cursorY,
  });

  cursorY -= SECTION_GAP;
  drawNarrative({
    page: input.page,
    summary: input.summary,
    config: input.config,
    fonts: input.fonts,
    colors,
    startY: cursorY,
    bottomLimit: MARGIN_BOTTOM + SIGNATURE_BLOCK_HEIGHT,
  });

  drawSignatureBlock({
    page: input.page,
    config: input.config,
    fonts: input.fonts,
    colors,
  });
}
