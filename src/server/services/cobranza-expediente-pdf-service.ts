import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { formatCobranzaDate } from '@/lib/cobranza-operativa-display';
import { formatCurrency } from '@/modules/creditos/credit-calculations';
import {
  summarizeCobranzaRiskFactors,
  type CobranzaRiskSnapshot,
} from '@/server/services/cobranza-risk-engine';
import type { CobranzaExpedienteCorto } from '@/server/services/cobranza-expediente-service';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 396;
const MARGIN = 16;
const SECTION_GAP = 8;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const COLUMN_GAP = 10;
const COLUMN_WIDTH = (CONTENT_WIDTH - COLUMN_GAP) / 2;
const HEADER_HEIGHT = 70;
const BITACORA_HEIGHT = 84;
const MIDDLE_HEIGHT = PAGE_HEIGHT - MARGIN * 2 - HEADER_HEIGHT - BITACORA_HEIGHT - SECTION_GAP * 2;
const CLIENT_HEIGHT = 74;
const BALANCE_HEIGHT = MIDDLE_HEIGHT - CLIENT_HEIGHT - SECTION_GAP;
const RISK_HEIGHT = 82;
const ACTION_HEIGHT = MIDDLE_HEIGHT - RISK_HEIGHT - SECTION_GAP;

type PdfColors = {
  ink: ReturnType<typeof rgb>;
  muted: ReturnType<typeof rgb>;
  border: ReturnType<typeof rgb>;
  panel: ReturnType<typeof rgb>;
  panelStrong: ReturnType<typeof rgb>;
  accent: ReturnType<typeof rgb>;
};

function sanitizeFileNamePart(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function formatDateTime(value: string | null) {
  if (!value) return 'Sin registro';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function buildAddress(expediente: CobranzaExpedienteCorto['customer']) {
  return [expediente.address, expediente.neighborhood, expediente.city, expediente.state]
    .filter(Boolean)
    .join(', ');
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number) {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (!normalized) return [''];

  const words = normalized.split(' ');
  const lines: string[] = [];
  let current = '';

  const pushCurrent = () => {
    if (current) lines.push(current);
    current = '';
  };

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      pushCurrent();
    }

    if (font.widthOfTextAtSize(word, fontSize) <= maxWidth) {
      current = word;
      continue;
    }

    let fragment = '';
    for (const char of word) {
      const next = `${fragment}${char}`;
      if (font.widthOfTextAtSize(next, fontSize) <= maxWidth) {
        fragment = next;
        continue;
      }
      if (fragment) lines.push(fragment);
      fragment = char;
    }
    current = fragment;
  }

  pushCurrent();
  return lines.length ? lines : [''];
}

function fitLines(input: string[], maxLines: number) {
  if (input.length <= maxLines) return input;
  const visible = input.slice(0, maxLines);
  const last = visible[maxLines - 1] ?? '';
  visible[maxLines - 1] = last.length > 2 ? `${last.slice(0, Math.max(0, last.length - 1))}…` : '…';
  return visible;
}

function drawTextLine(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
) {
  page.drawText(text, {
    x,
    y,
    size,
    font,
    color,
  });
}

function drawWrappedBlock(input: {
  page: PDFPage;
  text: string;
  x: number;
  y: number;
  width: number;
  lineHeight: number;
  maxLines: number;
  font: PDFFont;
  size: number;
  color: ReturnType<typeof rgb>;
}) {
  const wrapped = fitLines(
    wrapText(input.text, input.font, input.size, input.width),
    input.maxLines,
  );

  wrapped.forEach((line, index) => {
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
}

function drawSectionBox(input: {
  page: PDFPage;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  body: (args: { x: number; y: number; width: number; height: number }) => void;
  fonts: {
    regular: PDFFont;
    bold: PDFFont;
  };
  colors: PdfColors;
}) {
  const { page, x, y, width, height, title, body, fonts, colors } = input;
  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: colors.border,
    borderWidth: 0.8,
    color: colors.panel,
  });
  page.drawRectangle({
    x,
    y: y + height - 18,
    width,
    height: 18,
    color: colors.panelStrong,
  });

  drawTextLine(page, title, x + 10, y + height - 13, fonts.bold, 8.5, colors.ink);
  body({
    x: x + 10,
    y: y + height - 29,
    width: width - 20,
    height: height - 37,
  });
}

function drawFieldRows(input: {
  page: PDFPage;
  fields: Array<{ label: string; value: string }>;
  x: number;
  y: number;
  width: number;
  rowGap?: number;
  fonts: {
    regular: PDFFont;
    bold: PDFFont;
  };
  colors: PdfColors;
}) {
  const rowGap = input.rowGap ?? 13;
  input.fields.forEach((field, index) => {
    const rowY = input.y - index * rowGap;
    drawTextLine(input.page, `${field.label}:`, input.x, rowY, input.fonts.bold, 8, input.colors.muted);
    drawWrappedBlock({
      page: input.page,
      text: field.value,
      x: input.x + 48,
      y: rowY,
      width: input.width - 48,
      lineHeight: 9,
      maxLines: 2,
      font: input.fonts.regular,
      size: 8,
      color: input.colors.ink,
    });
  });
}

function drawManualLines(page: PDFPage, x: number, y: number, width: number, colors: PdfColors) {
  for (let index = 0; index < 6; index += 1) {
    const lineY = y - index * 9.5;
    page.drawLine({
      start: { x, y: lineY },
      end: { x: x + width, y: lineY },
      color: colors.border,
      thickness: 0.7,
      opacity: 0.9,
    });
  }
}

function getRiskLevelColor(level: CobranzaRiskSnapshot['nivelRiesgo']) {
  if (level === 'CRITICAL') return rgb(0.7, 0.18, 0.14);
  if (level === 'HIGH') return rgb(0.74, 0.43, 0.05);
  if (level === 'MEDIUM') return rgb(0.44, 0.35, 0.08);
  return rgb(0.12, 0.46, 0.27);
}

export async function generateCobranzaExpedientePdf(expediente: CobranzaExpedienteCorto) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const colors: PdfColors = {
    ink: rgb(0.12, 0.15, 0.19),
    muted: rgb(0.38, 0.43, 0.48),
    border: rgb(0.76, 0.8, 0.84),
    panel: rgb(0.98, 0.985, 0.99),
    panelStrong: rgb(0.92, 0.95, 0.97),
    accent: rgb(0.09, 0.36, 0.44),
  };

  const addressLabel = buildAddress(expediente.customer) || 'Sin dirección operativa';
  const phoneLabel =
    [expediente.customer.phone, expediente.customer.secondaryPhone].filter(Boolean).join(' · ') ||
    'Sin teléfono registrado';
  const factors = summarizeCobranzaRiskFactors(expediente.risk.factores, 3);
  const secondaryActions = expediente.recommendation.secondaryActions.length
    ? expediente.recommendation.secondaryActions.map((item) => item.label).join(' · ')
    : 'Sin acciones secundarias';
  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    color: rgb(1, 1, 1),
  });

  const topY = PAGE_HEIGHT - MARGIN;

  page.drawRectangle({
    x: MARGIN,
    y: topY - HEADER_HEIGHT,
    width: CONTENT_WIDTH,
    height: HEADER_HEIGHT,
    borderColor: colors.border,
    borderWidth: 0.8,
    color: colors.panel,
  });
  page.drawRectangle({
    x: MARGIN,
    y: topY - 20,
    width: CONTENT_WIDTH,
    height: 20,
    color: colors.panelStrong,
  });

  drawTextLine(page, 'Expediente corto de cobranza', MARGIN + 12, topY - 14, bold, 11.5, colors.accent);
  drawTextLine(
    page,
    'Formato operativo para campo · media carta horizontal',
    MARGIN + 12,
    topY - 28,
    regular,
    7.6,
    colors.muted,
  );

  drawTextLine(page, expediente.header.clientName, MARGIN + 12, topY - 44, bold, 10.5, colors.ink);
  drawTextLine(
    page,
    `${expediente.header.creditFolio} · ${expediente.header.loanNumber}${expediente.header.controlNumber ? ` · Control ${expediente.header.controlNumber}` : ''}`,
    MARGIN + 12,
    topY - 56,
    regular,
    8.2,
    colors.ink,
  );

  drawFieldRows({
    page,
    x: MARGIN + CONTENT_WIDTH / 2 + 8,
    y: topY - 34,
    width: CONTENT_WIDTH / 2 - 20,
    fields: [
      { label: 'Código', value: expediente.header.clientCode },
      { label: 'Promotoría', value: expediente.header.promotoriaName },
      { label: 'Supervisión', value: expediente.header.supervisionName ?? 'Sin supervisión' },
      { label: 'Fecha', value: formatCobranzaDate(expediente.occurredAt) },
    ],
    rowGap: 10,
    fonts: { regular, bold },
    colors,
  });

  const middleTopY = topY - HEADER_HEIGHT - SECTION_GAP;
  const leftX = MARGIN;
  const rightX = MARGIN + COLUMN_WIDTH + COLUMN_GAP;
  const clientY = middleTopY - CLIENT_HEIGHT;
  const balanceY = clientY - SECTION_GAP - BALANCE_HEIGHT;
  const riskY = middleTopY - RISK_HEIGHT;
  const actionY = riskY - SECTION_GAP - ACTION_HEIGHT;
  const bitacoraY = balanceY - SECTION_GAP - BITACORA_HEIGHT;

  drawSectionBox({
    page,
    x: leftX,
    y: clientY,
    width: COLUMN_WIDTH,
    height: CLIENT_HEIGHT,
    title: 'Datos del cliente',
    fonts: { regular, bold },
    colors,
    body: ({ x, y, width }) => {
      drawFieldRows({
        page,
        x,
        y,
        width,
        rowGap: 14,
        fields: [
          { label: 'Teléfono', value: phoneLabel },
          { label: 'Dirección', value: addressLabel },
          { label: 'Aval', value: expediente.customer.avalLabel ?? 'Sin aval' },
        ],
        fonts: { regular, bold },
        colors,
      });
    },
  });

  drawSectionBox({
    page,
    x: leftX,
    y: balanceY,
    width: COLUMN_WIDTH,
    height: BALANCE_HEIGHT,
    title: 'Saldo accionable',
    fonts: { regular, bold },
    colors,
    body: ({ x, y, width }) => {
      const leftMetricWidth = (width - 10) / 2;
      const rightMetricX = x + leftMetricWidth + 10;
      const metricsLeft: Array<[string, string]> = [
        ['Total', formatCurrency(expediente.actionable.totalAmount)],
        ['Regular', formatCurrency(expediente.actionable.regularAmount)],
        ['Recuperado', formatCurrency(expediente.actionable.recoveryAmount)],
      ];
      const metricsRight: Array<[string, string]> = [
        ['Semana 13', formatCurrency(expediente.actionable.extraWeekAmount)],
        ['Multas', formatCurrency(expediente.actionable.penaltyAmount)],
        ['Fallas', String(expediente.actionable.pendingFailuresCount)],
      ];

      metricsLeft.forEach(([label, value], index) => {
        const rowY = y - index * 18;
        drawTextLine(page, label, x, rowY, bold, 8, colors.muted);
        drawTextLine(page, value, x, rowY - 9, regular, 9.5, colors.ink);
      });

      metricsRight.forEach(([label, value], index) => {
        const rowY = y - index * 18;
        drawTextLine(page, label, rightMetricX, rowY, bold, 8, colors.muted);
        drawTextLine(page, value, rightMetricX, rowY - 9, regular, 9.5, colors.ink);
      });

      if (expediente.actionable.pendingFailuresPreview.length) {
        const preview = expediente.actionable.pendingFailuresPreview
          .slice(0, 2)
          .map(
            (item) =>
              `Sem ${String(item.installmentNumber).padStart(2, '0')} ${formatCobranzaDate(item.dueDate)} ${formatCurrency(item.pendingAmount)}`,
          )
          .join(' · ');

        drawWrappedBlock({
          page,
          text: `Detalle rápido: ${preview}`,
          x,
          y: y - 60,
          width,
          lineHeight: 8.5,
          maxLines: 2,
          font: regular,
          size: 7.5,
          color: colors.muted,
        });
      }
    },
  });

  drawSectionBox({
    page,
    x: rightX,
    y: riskY,
    width: COLUMN_WIDTH,
    height: RISK_HEIGHT,
    title: 'Riesgo',
    fonts: { regular, bold },
    colors,
    body: ({ x, y, width }) => {
      drawTextLine(page, 'Score', x, y, bold, 8, colors.muted);
      drawTextLine(page, String(expediente.risk.scoreTotal), x, y - 17, bold, 18, colors.ink);
      drawTextLine(page, 'Nivel', x + 78, y, bold, 8, colors.muted);
      drawTextLine(
        page,
        expediente.risk.nivelRiesgo,
        x + 78,
        y - 17,
        bold,
        12,
        getRiskLevelColor(expediente.risk.nivelRiesgo),
      );
      drawTextLine(page, 'Último contacto', x + 170, y, bold, 8, colors.muted);
      drawWrappedBlock({
        page,
        text: formatDateTime(expediente.risk.ultimoContactoExitosoAt),
        x: x + 170,
        y: y - 10,
        width: width - 170,
        lineHeight: 8.5,
        maxLines: 2,
        font: regular,
        size: 7.5,
        color: colors.ink,
      });

      const factorText = factors.length
        ? factors.map((factor) => `• ${factor.reason}`).join('\n')
        : '• Sin señales relevantes que eleven el riesgo operativo.';

      factorText.split('\n').slice(0, 3).forEach((line, index) => {
        drawWrappedBlock({
          page,
          text: line,
          x,
          y: y - 35 - index * 12,
          width,
          lineHeight: 8,
          maxLines: 1,
          font: regular,
          size: 7.5,
          color: colors.ink,
        });
      });
    },
  });

  drawSectionBox({
    page,
    x: rightX,
    y: actionY,
    width: COLUMN_WIDTH,
    height: ACTION_HEIGHT,
    title: 'Acción sugerida',
    fonts: { regular, bold },
    colors,
    body: ({ x, y, width }) => {
      drawTextLine(page, 'Principal', x, y, bold, 8, colors.muted);
      drawWrappedBlock({
        page,
        text: expediente.recommendation.primaryAction.label,
        x,
        y: y - 10,
        width,
        lineHeight: 10,
        maxLines: 2,
        font: bold,
        size: 10,
        color: colors.ink,
      });

      drawTextLine(page, 'Secundarias', x, y - 30, bold, 8, colors.muted);
      drawWrappedBlock({
        page,
        text: secondaryActions,
        x,
        y: y - 40,
        width,
        lineHeight: 8.5,
        maxLines: 2,
        font: regular,
        size: 7.6,
        color: colors.ink,
      });

      drawTextLine(page, 'Motivo', x, y - 58, bold, 8, colors.muted);
      drawWrappedBlock({
        page,
        text: expediente.recommendation.summary,
        x,
        y: y - 68,
        width,
        lineHeight: 8.2,
        maxLines: 2,
        font: regular,
        size: 7.3,
        color: colors.ink,
      });
    },
  });

  drawSectionBox({
    page,
    x: MARGIN,
    y: bitacoraY,
    width: CONTENT_WIDTH,
    height: BITACORA_HEIGHT,
    title: 'Bitácora manual',
    fonts: { regular, bold },
    colors,
    body: ({ x, y, width }) => {
      drawTextLine(
        page,
        'Espacio para anotaciones operativas, acuerdos y hallazgos de campo.',
        x,
        y,
        regular,
        7.8,
        colors.muted,
      );
      drawManualLines(page, x, y - 11, width, colors);
    },
  });

  const bytes = await pdfDoc.save();
  const stamp = expediente.occurredAt;
  const creditPart = sanitizeFileNamePart(expediente.header.creditFolio || expediente.operativaPanel.credito.folio || 'credito');

  return {
    bytes,
    fileName: `expediente-cobranza-${creditPart}-${stamp}.pdf`,
  };
}
