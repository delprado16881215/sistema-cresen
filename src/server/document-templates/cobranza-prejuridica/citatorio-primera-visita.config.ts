export const COBRANZA_PREJURIDICA_CITATORIO_CONFIG = {
  despachoNombre: 'Juridico Benito Juarez',
  despachoSubtitle: 'Gestion operativa de recuperacion',
  telefonoContacto: 'Telefono: 311 343 8631',
  firmaResponsable: 'Lic. Mario del Prado Vazquez',
  firmaCargo: 'Ejecutivo',
  logoPublicPath: '/documents/cobranza-prejuridica/logo-despacho.png',
  documentTitle: 'Citatorio de primera visita',
  baseText: [
    'Se le informa que, derivado del incumplimiento en sus obligaciones de pago con Financiera Cresen, su expediente ha sido turnado a este despacho para su gestion de recuperacion.',
    'Por lo anterior, se le requiere para que se comunique de manera inmediata o regularice su situacion, a fin de evitar el inicio de acciones legales en su contra.',
    'El monto senalado corresponde al adeudo vencido a la fecha del presente documento, sin perjuicio de las cantidades adicionales que pudieran generarse conforme al contrato.',
  ],
} as const;

export type CobranzaPrejuridicaCitatorioConfig = typeof COBRANZA_PREJURIDICA_CITATORIO_CONFIG;
