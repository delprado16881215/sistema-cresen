import type {
  CommunicationChannel,
  CommunicationSourceContext,
  DeliveryStatus,
  MessageType,
} from '@prisma/client';
import { formatCobranzaDate } from '@/lib/cobranza-operativa-display';
import { formatCurrency } from '@/modules/creditos/credit-calculations';

export const MESSAGE_TYPES = [
  'PAYMENT_REMINDER',
  'COLLECTION_FOLLOWUP',
  'LEGAL_NOTICE',
  'RENEWAL_OFFER',
  'MANUAL_MESSAGE',
] as const;

export const COMMUNICATION_CHANNELS = ['WHATSAPP', 'SMS', 'EMAIL'] as const;

export const DELIVERY_STATUSES = ['PENDING', 'SENT', 'FAILED', 'CANCELED'] as const;

export const COMMUNICATION_SOURCE_CONTEXTS = ['CLIENTE', 'CREDITO', 'COBRANZA', 'JURIDICO'] as const;

export const MESSAGE_TEMPLATE_VARIABLES = [
  { key: 'clienteNombre', label: 'Nombre del cliente' },
  { key: 'creditoFolio', label: 'Folio del crédito' },
  { key: 'montoPago', label: 'Monto de pago' },
  { key: 'fechaPago', label: 'Fecha de pago' },
  { key: 'estadoLegal', label: 'Estado jurídico' },
  { key: 'promotoriaNombre', label: 'Nombre de promotoría' },
] as const;

export const PRIMARY_COMMUNICATION_CHANNEL: CommunicationChannel = 'WHATSAPP';

export type TemplateVariableKey = (typeof MESSAGE_TEMPLATE_VARIABLES)[number]['key'];

const TEMPLATE_VARIABLE_KEY_SET = new Set<string>(MESSAGE_TEMPLATE_VARIABLES.map((item) => item.key));

export function getMessageTypeLabel(value: MessageType) {
  if (value === 'PAYMENT_REMINDER') return 'Recordatorio de pago';
  if (value === 'COLLECTION_FOLLOWUP') return 'Seguimiento de cobranza';
  if (value === 'LEGAL_NOTICE') return 'Aviso jurídico';
  if (value === 'RENEWAL_OFFER') return 'Oferta de renovación';
  return 'Mensaje manual';
}

export function getCommunicationChannelLabel(value: CommunicationChannel) {
  if (value === 'WHATSAPP') return 'WhatsApp';
  if (value === 'SMS') return 'SMS';
  return 'Email';
}

export function getDeliveryStatusLabel(value: DeliveryStatus) {
  if (value === 'PENDING') return 'Pendiente';
  if (value === 'SENT') return 'Enviado';
  if (value === 'FAILED') return 'Falló';
  return 'Cancelado';
}

export function getCommunicationSourceContextLabel(value: CommunicationSourceContext) {
  if (value === 'CLIENTE') return 'Cliente';
  if (value === 'CREDITO') return 'Crédito';
  if (value === 'COBRANZA') return 'Cobranza';
  return 'Jurídico';
}

export function getTemplateVariableLabel(key: TemplateVariableKey) {
  return MESSAGE_TEMPLATE_VARIABLES.find((item) => item.key === key)?.label ?? key;
}

export function extractTemplateVariables(value: string | null | undefined) {
  if (!value) return [] as string[];

  const matches = value.matchAll(/{{\s*([a-zA-Z0-9]+)\s*}}/g);
  const keys = new Set<string>();

  for (const match of matches) {
    if (match[1]) {
      keys.add(match[1]);
    }
  }

  return [...keys];
}

export function findInvalidTemplateVariables(input: {
  subject?: string | null;
  content: string;
}) {
  const keys = new Set<string>([
    ...extractTemplateVariables(input.subject),
    ...extractTemplateVariables(input.content),
  ]);

  return [...keys].filter((key) => !TEMPLATE_VARIABLE_KEY_SET.has(key));
}

export function buildTemplateVariableValues(input: {
  clienteNombre?: string | null;
  creditoFolio?: string | null;
  montoPago?: number | null;
  fechaPago?: string | null;
  estadoLegal?: string | null;
  promotoriaNombre?: string | null;
}): Record<TemplateVariableKey, string | null> {
  return {
    clienteNombre: input.clienteNombre?.trim() || null,
    creditoFolio: input.creditoFolio?.trim() || null,
    montoPago:
      typeof input.montoPago === 'number' && Number.isFinite(input.montoPago)
        ? formatCurrency(input.montoPago)
        : null,
    fechaPago: input.fechaPago ? formatCobranzaDate(input.fechaPago) : null,
    estadoLegal: input.estadoLegal?.trim() || null,
    promotoriaNombre: input.promotoriaNombre?.trim() || null,
  };
}

export function renderTemplateFragment(
  value: string | null | undefined,
  variables: Partial<Record<TemplateVariableKey, string | null>>,
) {
  if (!value) {
    return {
      rendered: null,
      missingVariables: [] as TemplateVariableKey[],
    };
  }

  const missing = new Set<TemplateVariableKey>();
  const rendered = value.replace(/{{\s*([a-zA-Z0-9]+)\s*}}/g, (_, rawKey: string) => {
    if (!TEMPLATE_VARIABLE_KEY_SET.has(rawKey)) {
      return `{{${rawKey}}}`;
    }

    const key = rawKey as TemplateVariableKey;
    const resolved = variables[key];

    if (!resolved) {
      missing.add(key);
      return '';
    }

    return resolved;
  });

  return {
    rendered,
    missingVariables: [...missing],
  };
}
