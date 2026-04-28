type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline';

function formatDateByLocale(value: string, options: Intl.DateTimeFormatOptions) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('es-MX', options).format(parsed);
}

export function formatCobranzaDate(value: string | null, fallback = 'Sin fecha') {
  if (!value) return fallback;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-');
    if (year && month && day) {
      return `${day}/${month}/${year}`;
    }
  }

  return formatDateByLocale(value, { dateStyle: 'short' }) ?? value;
}

export function formatCobranzaDateTime(value: string | null, fallback = 'Sin registro') {
  if (!value) return fallback;
  return formatDateByLocale(value, { dateStyle: 'short', timeStyle: 'short' }) ?? value;
}

export function getInteraccionLabel(value: string) {
  if (value === 'CALL') return 'Llamada';
  if (value === 'WHATSAPP') return 'WhatsApp';
  if (value === 'SMS') return 'SMS';
  if (value === 'VISIT') return 'Visita';
  return 'Nota';
}

export function getCanalLabel(value: string) {
  if (value === 'PHONE') return 'Teléfono';
  if (value === 'WHATSAPP') return 'WhatsApp';
  if (value === 'SMS') return 'SMS';
  if (value === 'IN_PERSON') return 'Presencial';
  return 'Otro';
}

export function getResultadoInteraccionLabel(value: string) {
  if (value === 'NO_ANSWER') return 'Sin respuesta';
  if (value === 'CONTACTED') return 'Contactado';
  if (value === 'PROMISE_REGISTERED') return 'Promesa registrada';
  if (value === 'PAID_REPORTED') return 'Pago reportado';
  if (value === 'REFUSED') return 'Rechazó';
  if (value === 'WRONG_NUMBER') return 'Número incorrecto';
  if (value === 'NOT_AVAILABLE') return 'No disponible';
  if (value === 'FOLLOW_UP_REQUIRED') return 'Seguimiento';
  return 'Otro';
}

export function getPromesaEstadoLabel(value: string) {
  if (value === 'PENDING') return 'Pendiente';
  if (value === 'FULFILLED') return 'Cumplida';
  if (value === 'BROKEN') return 'Incumplida';
  return 'Cancelada';
}

export function getVisitaResultadoLabel(value: string) {
  if (value === 'VISIT_SUCCESSFUL') return 'Visita exitosa';
  if (value === 'CLIENT_NOT_HOME') return 'Cliente ausente';
  if (value === 'ADDRESS_NOT_FOUND') return 'Dirección no localizada';
  if (value === 'PAYMENT_COLLECTED_REPORTED') return 'Pago reportado';
  if (value === 'FOLLOW_UP_REQUIRED') return 'Seguimiento';
  if (value === 'REFUSED_CONTACT') return 'Rechazó contacto';
  return 'Otro';
}

export function getCobranzaOutcomeBadgeVariant(value: string): BadgeVariant {
  if (value === 'PENDING' || value === 'FOLLOW_UP_REQUIRED' || value === 'PROMISE_REGISTERED') {
    return 'warning';
  }
  if (
    value === 'FULFILLED' ||
    value === 'CONTACTED' ||
    value === 'VISIT_SUCCESSFUL' ||
    value === 'PAYMENT_COLLECTED_REPORTED'
  ) {
    return 'success';
  }
  if (
    value === 'BROKEN' ||
    value === 'REFUSED' ||
    value === 'WRONG_NUMBER' ||
    value === 'ADDRESS_NOT_FOUND' ||
    value === 'REFUSED_CONTACT'
  ) {
    return 'destructive';
  }
  return 'secondary';
}

export function getCobranzaTimelineKindLabel(value: 'INTERACCION' | 'PROMESA_PAGO' | 'VISITA_CAMPO') {
  if (value === 'PROMESA_PAGO') return 'Promesa';
  if (value === 'VISITA_CAMPO') return 'Visita';
  return 'Interacción';
}

export function getExpedienteAlertaTipoLabel(value: string) {
  if (value === 'SHARED_PHONE') return 'Teléfono compartido';
  if (value === 'SHARED_ADDRESS') return 'Domicilio compartido';
  if (value === 'SHARED_GUARANTOR') return 'Aval repetido';
  if (value === 'CLIENT_GUARANTOR_SAME_PHONE') return 'Cliente y aval comparten teléfono';
  if (value === 'EARLY_CONTACT_FAILURE') return 'Falla temprana de contacto';
  if (value === 'ADDRESS_NOT_LOCATED_EARLY') return 'Domicilio no localizado temprano';
  if (value === 'CLUSTERED_RISK_BY_PROMOTORIA') return 'Concentración anómala por promotoría';
  if (value === 'EXPEDIENTE_DEBIL') return 'Expediente débil';
  return 'Otra alerta';
}

export function getExpedienteAlertaSeveridadLabel(value: string) {
  if (value === 'LOW') return 'Baja';
  if (value === 'MEDIUM') return 'Media';
  if (value === 'HIGH') return 'Alta';
  return 'Crítica';
}

export function getExpedienteAlertaStatusLabel(value: string) {
  if (value === 'OPEN') return 'Abierta';
  if (value === 'REVIEWED') return 'Revisada';
  if (value === 'DISMISSED') return 'Descartada';
  return 'Patrón confirmado';
}
