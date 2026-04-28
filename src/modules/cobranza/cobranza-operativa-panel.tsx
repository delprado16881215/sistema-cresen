'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  formatCobranzaDate,
  formatCobranzaDateTime,
  getCanalLabel,
  getCobranzaOutcomeBadgeVariant,
  getInteraccionLabel,
  getPromesaEstadoLabel,
  getResultadoInteraccionLabel,
  getVisitaResultadoLabel,
} from '@/lib/cobranza-operativa-display';
import { formatCurrency } from '@/modules/creditos/credit-calculations';
import {
  OFFLINE_QUEUE_UPDATED_EVENT,
  enqueueOfflineEvent,
  listOfflineEventsByContext,
  type OfflineQueueEvent,
} from '@/offline/offline-event-queue';
import { useOfflineMode } from '@/offline/offline-mode-provider';
import type {
  CobranzaInteraccionItem,
  CobranzaPromesaPagoItem,
  CobranzaVisitaCampoItem,
} from '@/server/services/cobranza-operativa-shared';
import {
  INTERACCION_CANALES,
  INTERACCION_RESULTADOS,
  INTERACCION_TIPOS,
  VISITA_CAMPO_RESULTADOS,
} from '@/server/validators/cobranza-operativa';

type CobranzaOperativaPanelProps = {
  cliente: {
    id: string;
    code: string;
    fullName: string;
    phone: string;
    secondaryPhone: string | null;
    address: string;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    betweenStreets: string | null;
    referencesNotes: string | null;
  };
  credito: {
    id: string;
    folio: string;
    loanNumber: string;
  };
  interacciones: CobranzaInteraccionItem[];
  promesasPago: CobranzaPromesaPagoItem[];
  visitasCampo: CobranzaVisitaCampoItem[];
  operationalHoldMessage?: string | null;
  showCaptureForms?: boolean;
  showRecentLists?: boolean;
};

type ApiErrorResponse = {
  message?: string;
};

type InteraccionDisplayItem = {
  id: string;
  tipo: CobranzaInteraccionItem['tipo'];
  resultado: CobranzaInteraccionItem['resultado'];
  canal: CobranzaInteraccionItem['canal'];
  fechaHora: string;
  telefonoUsado: string | null;
  duracionSegundos: number | null;
  notas: string | null;
  createdByName: string;
  creditoFolio: string;
  offlineStatus: OfflineQueueEvent['status'] | null;
};

type PromesaDisplayItem = {
  id: string;
  estado: CobranzaPromesaPagoItem['estado'];
  fechaPromesa: string;
  montoPrometido: number | null;
  notas: string | null;
  createdByName: string;
  creditoFolio: string;
  interaccion:
    | {
        tipo: NonNullable<CobranzaPromesaPagoItem['interaccion']>['tipo'];
        fechaHora: NonNullable<CobranzaPromesaPagoItem['interaccion']>['fechaHora'];
      }
    | null;
  offlineStatus: OfflineQueueEvent['status'] | null;
};

type VisitaDisplayItem = {
  id: string;
  resultado: CobranzaVisitaCampoItem['resultado'];
  fechaHora: string;
  direccionTexto: string | null;
  referenciaLugar: string | null;
  latitud: number | null;
  longitud: number | null;
  notas: string | null;
  createdByName: string;
  creditoFolio: string;
  offlineStatus: OfflineQueueEvent['status'] | null;
};

type OperativeCaptureTab = 'INTERACCION' | 'PROMESA' | 'VISITA';

type GeolocationDiagnosticState = {
  attemptedAt: string | null;
  isSecureContext: boolean | null;
  hasGeolocation: boolean;
  status: 'IDLE' | 'SUCCESS' | 'ERROR';
  result: 'NOT_ATTEMPTED' | 'SUCCESS' | 'INSECURE_CONTEXT' | 'UNSUPPORTED' | 'PERMISSION_DENIED' | 'POSITION_UNAVAILABLE' | 'TIMEOUT' | 'UNKNOWN_ERROR';
  errorCode: number | null;
  errorMessage: string | null;
  browserMessage: string | null;
};

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function toLocalDateInput(value: Date) {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function toLocalDateTimeInput(value: Date) {
  return `${toLocalDateInput(value)}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function buildAddressLabel(input: CobranzaOperativaPanelProps['cliente']) {
  return [input.address, input.neighborhood, input.city, input.state].filter(Boolean).join(', ');
}

function buildReferenceLabel(input: CobranzaOperativaPanelProps['cliente']) {
  return [input.betweenStreets, input.referencesNotes].filter(Boolean).join(' · ');
}

function formatDurationLabel(seconds: number | null) {
  if (seconds == null || seconds <= 0) return null;
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (!remainingSeconds) return `${minutes} min`;
  return `${minutes} min ${remainingSeconds}s`;
}

function formatCoordinate(value: number) {
  return value.toFixed(7);
}

function createGeolocationDiagnosticState(
  input?: Partial<GeolocationDiagnosticState>,
): GeolocationDiagnosticState {
  return {
    attemptedAt: null,
    isSecureContext: null,
    hasGeolocation: false,
    status: 'IDLE',
    result: 'NOT_ATTEMPTED',
    errorCode: null,
    errorMessage: null,
    browserMessage: null,
    ...input,
  };
}

function getGeolocationErrorMessage(error: GeolocationPositionError | { code?: number; message?: string } | null | undefined) {
  switch (error?.code) {
    case 1:
      return 'El navegador reportó permiso denegado para usar la ubicación actual.';
    case 2:
      return 'La posición no estuvo disponible en el dispositivo en este momento.';
    case 3:
      return 'La captura de ubicación tardó demasiado. Inténtalo de nuevo en un lugar con mejor señal.';
    default:
      return 'No se pudo capturar la ubicación actual.';
  }
}

function getGeolocationResultLabel(value: GeolocationDiagnosticState['result']) {
  switch (value) {
    case 'SUCCESS':
      return 'Ubicación capturada';
    case 'INSECURE_CONTEXT':
      return 'Contexto inseguro';
    case 'UNSUPPORTED':
      return 'Sin soporte';
    case 'PERMISSION_DENIED':
      return 'Permiso denegado';
    case 'POSITION_UNAVAILABLE':
      return 'Posición no disponible';
    case 'TIMEOUT':
      return 'Tiempo agotado';
    case 'UNKNOWN_ERROR':
      return 'Error desconocido';
    default:
      return 'Sin intento';
  }
}

async function requestJson<T>(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & ApiErrorResponse;

  if (!response.ok) {
    throw new Error(payload.message ?? 'No se pudo completar la operación.');
  }

  return payload;
}

function getOfflineStatusLabel(status: OfflineQueueEvent['status'] | null) {
  if (status === 'FAILED') return 'Sync fallido';
  if (status === 'PENDING') return 'Pendiente sync';
  return null;
}

function getOfflineStatusVariant(status: OfflineQueueEvent['status'] | null) {
  if (status === 'FAILED') return 'destructive' as const;
  if (status === 'PENDING') return 'warning' as const;
  return null;
}

function buildInteraccionDisplayItems(input: {
  serverItems: CobranzaInteraccionItem[];
  offlineEvents: OfflineQueueEvent[];
  creditoFolio: string;
}): InteraccionDisplayItem[] {
  const offlineItems = input.offlineEvents
    .filter((event): event is OfflineQueueEvent<'INTERACTION'> => event.type === 'INTERACTION')
    .map((event) => ({
      id: event.eventId,
      tipo: event.payload.tipo,
      resultado: event.payload.resultado,
      canal: event.payload.canal,
      fechaHora: event.payload.fechaHora,
      telefonoUsado: event.payload.telefonoUsado,
      duracionSegundos: event.payload.duracionSegundos,
      notas: event.payload.notas,
      createdByName: event.capturedByUserName ?? 'Pendiente de sincronizar',
      creditoFolio: input.creditoFolio,
      offlineStatus: event.status,
    }));

  const serverItems = input.serverItems.map((item) => ({
    id: item.id,
    tipo: item.tipo,
    resultado: item.resultado,
    canal: item.canal,
    fechaHora: item.fechaHora,
    telefonoUsado: item.telefonoUsado,
    duracionSegundos: item.duracionSegundos,
    notas: item.notas,
    createdByName: item.createdBy.name,
    creditoFolio: item.credito?.folio ?? input.creditoFolio,
    offlineStatus: null,
  }));

  return [...offlineItems, ...serverItems].sort((left, right) => right.fechaHora.localeCompare(left.fechaHora));
}

function buildPromesaDisplayItems(input: {
  serverItems: CobranzaPromesaPagoItem[];
  offlineEvents: OfflineQueueEvent[];
  creditoFolio: string;
}): PromesaDisplayItem[] {
  const offlineItems = input.offlineEvents
    .filter((event): event is OfflineQueueEvent<'PROMESA'> => event.type === 'PROMESA')
    .map((event) => ({
      id: event.eventId,
      estado: 'PENDING' as const,
      fechaPromesa: event.payload.fechaPromesa,
      montoPrometido: event.payload.montoPrometido,
      notas: event.payload.notas,
      createdByName: event.capturedByUserName ?? 'Pendiente de sincronizar',
      creditoFolio: input.creditoFolio,
      interaccion: null,
      offlineStatus: event.status,
    }));

  const serverItems = input.serverItems.map((item) => ({
    id: item.id,
    estado: item.estado,
    fechaPromesa: item.fechaPromesa,
    montoPrometido: item.montoPrometido,
    notas: item.notas,
    createdByName: item.createdBy.name,
    creditoFolio: item.credito?.folio ?? input.creditoFolio,
    interaccion: item.interaccion
      ? {
          tipo: item.interaccion.tipo,
          fechaHora: item.interaccion.fechaHora,
        }
      : null,
    offlineStatus: null,
  }));

  return [...offlineItems, ...serverItems].sort((left, right) => right.fechaPromesa.localeCompare(left.fechaPromesa));
}

function buildVisitaDisplayItems(input: {
  serverItems: CobranzaVisitaCampoItem[];
  offlineEvents: OfflineQueueEvent[];
  creditoFolio: string;
}): VisitaDisplayItem[] {
  const offlineItems = input.offlineEvents
    .filter((event): event is OfflineQueueEvent<'VISITA'> => event.type === 'VISITA')
    .map((event) => ({
      id: event.eventId,
      resultado: event.payload.resultado,
      fechaHora: event.payload.fechaHora,
      direccionTexto: event.payload.direccionTexto,
      referenciaLugar: event.payload.referenciaLugar,
      latitud: event.payload.latitud,
      longitud: event.payload.longitud,
      notas: event.payload.notas,
      createdByName: event.capturedByUserName ?? 'Pendiente de sincronizar',
      creditoFolio: input.creditoFolio,
      offlineStatus: event.status,
    }));

  const serverItems = input.serverItems.map((item) => ({
    id: item.id,
    resultado: item.resultado,
    fechaHora: item.fechaHora,
    direccionTexto: item.direccionTexto,
    referenciaLugar: item.referenciaLugar,
    latitud: item.latitud,
    longitud: item.longitud,
    notas: item.notas,
    createdByName: item.createdBy.name,
    creditoFolio: item.credito?.folio ?? input.creditoFolio,
    offlineStatus: null,
  }));

  return [...offlineItems, ...serverItems].sort((left, right) => right.fechaHora.localeCompare(left.fechaHora));
}

export function CobranzaOperativaPanel({
  cliente,
  credito,
  interacciones,
  promesasPago,
  visitasCampo,
  operationalHoldMessage = null,
  showCaptureForms = true,
  showRecentLists = true,
}: CobranzaOperativaPanelProps) {
  const router = useRouter();
  const { currentUser, isOfflineMode } = useOfflineMode();
  const [interaccionError, setInteraccionError] = useState<string | null>(null);
  const [interaccionSuccess, setInteraccionSuccess] = useState<string | null>(null);
  const [promesaError, setPromesaError] = useState<string | null>(null);
  const [promesaSuccess, setPromesaSuccess] = useState<string | null>(null);
  const [visitaError, setVisitaError] = useState<string | null>(null);
  const [visitaSuccess, setVisitaSuccess] = useState<string | null>(null);
  const [visitLocationError, setVisitLocationError] = useState<string | null>(null);
  const [visitLocationSuccess, setVisitLocationSuccess] = useState<string | null>(null);
  const [isResolvingVisitLocation, setIsResolvingVisitLocation] = useState(false);
  const [visitLocationDiagnostics, setVisitLocationDiagnostics] = useState<GeolocationDiagnosticState>(
    () => createGeolocationDiagnosticState(),
  );
  const [promiseStateError, setPromiseStateError] = useState<string | null>(null);
  const [updatingPromiseId, setUpdatingPromiseId] = useState<string | null>(null);
  const [offlineEvents, setOfflineEvents] = useState<OfflineQueueEvent[]>([]);
  const [isSubmittingInteraccion, startInteraccionTransition] = useTransition();
  const [isSubmittingPromesa, startPromesaTransition] = useTransition();
  const [isSubmittingVisita, startVisitaTransition] = useTransition();
  const primaryPhone = cliente.phone || cliente.secondaryPhone || '';
  const addressLabel = buildAddressLabel(cliente);
  const referenceLabel = buildReferenceLabel(cliente);

  const [interaccionForm, setInteraccionForm] = useState({
    tipo: 'CALL',
    canal: 'PHONE',
    resultado: 'CONTACTED',
    fechaHora: toLocalDateTimeInput(new Date()),
    duracionSegundos: '',
    telefonoUsado: primaryPhone,
    notas: '',
  });
  const [promesaForm, setPromesaForm] = useState({
    fechaPromesa: toLocalDateInput(new Date()),
    montoPrometido: '',
    notas: '',
  });
  const [visitaForm, setVisitaForm] = useState({
    fechaHora: toLocalDateTimeInput(new Date()),
    resultado: 'VISIT_SUCCESSFUL',
    direccionTexto: addressLabel,
    referenciaLugar: referenceLabel,
    latitud: '',
    longitud: '',
    notas: '',
  });
  const [activeCaptureTab, setActiveCaptureTab] = useState<OperativeCaptureTab>('INTERACCION');

  const loadOfflineEvents = useCallback(async () => {
    const rows = await listOfflineEventsByContext({
      clienteId: cliente.id,
      creditoId: credito.id,
    });
    setOfflineEvents(rows);
  }, [cliente.id, credito.id]);

  const refreshPage = () => {
    router.refresh();
  };

  useEffect(() => {
    void loadOfflineEvents();
  }, [loadOfflineEvents]);

  useEffect(() => {
    const handleQueueUpdated = () => {
      void loadOfflineEvents();
    };

    window.addEventListener(OFFLINE_QUEUE_UPDATED_EVENT, handleQueueUpdated as EventListener);
    return () => {
      window.removeEventListener(OFFLINE_QUEUE_UPDATED_EVENT, handleQueueUpdated as EventListener);
    };
  }, [loadOfflineEvents]);

  const interaccionItems = buildInteraccionDisplayItems({
    serverItems: interacciones,
    offlineEvents,
    creditoFolio: credito.folio,
  });
  const promesaItems = buildPromesaDisplayItems({
    serverItems: promesasPago,
    offlineEvents,
    creditoFolio: credito.folio,
  });
  const visitaItems = buildVisitaDisplayItems({
    serverItems: visitasCampo,
    offlineEvents,
    creditoFolio: credito.folio,
  });
  const isOperationallyBlocked = Boolean(operationalHoldMessage);
  const showCaptureTabs = showCaptureForms && !showRecentLists;

  const captureCurrentVisitLocation = useCallback(() => {
    setVisitLocationError(null);
    setVisitLocationSuccess(null);

    const attemptedAt = new Date().toISOString();
    const secureContext = typeof window !== 'undefined' ? window.isSecureContext : null;
    const hasGeolocation = typeof navigator !== 'undefined' && Boolean(navigator.geolocation);

    const baseDiagnostics = createGeolocationDiagnosticState({
      attemptedAt,
      isSecureContext: secureContext,
      hasGeolocation,
      status: 'ERROR',
    });

    console.info('[Cobranza][Visita][Geolocation] Intento de captura', {
      attemptedAt,
      isSecureContext: secureContext,
      hasGeolocation,
      href: typeof window !== 'undefined' ? window.location.href : null,
    });

    if (!secureContext) {
      const message = 'Safari en iPhone requiere HTTPS para obtener ubicación actual en la web.';
      setVisitLocationDiagnostics(
        createGeolocationDiagnosticState({
          ...baseDiagnostics,
          result: 'INSECURE_CONTEXT',
          errorMessage: message,
        }),
      );
      setVisitLocationError(message);
      console.error('[Cobranza][Visita][Geolocation] Contexto inseguro', {
        attemptedAt,
        isSecureContext: secureContext,
        hasGeolocation,
      });
      return;
    }

    if (!hasGeolocation) {
      const message = 'Este navegador no expone navigator.geolocation para capturar coordenadas automáticamente.';
      setVisitLocationDiagnostics(
        createGeolocationDiagnosticState({
          ...baseDiagnostics,
          result: 'UNSUPPORTED',
          errorMessage: message,
        }),
      );
      setVisitLocationError(message);
      console.error('[Cobranza][Visita][Geolocation] Sin soporte', {
        attemptedAt,
        isSecureContext: secureContext,
        hasGeolocation,
      });
      return;
    }

    setIsResolvingVisitLocation(true);
    setVisitLocationDiagnostics(
      createGeolocationDiagnosticState({
        attemptedAt,
        isSecureContext: secureContext,
        hasGeolocation,
        status: 'IDLE',
      }),
    );

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = formatCoordinate(position.coords.latitude);
        const longitude = formatCoordinate(position.coords.longitude);
        const accuracy = Number.isFinite(position.coords.accuracy)
          ? Math.round(position.coords.accuracy)
          : null;

        setVisitaForm((current) => ({
          ...current,
          latitud: latitude,
          longitud: longitude,
        }));
        setVisitLocationSuccess(
          accuracy != null
            ? `Ubicación capturada correctamente. Precisión aproximada: ${accuracy} m.`
            : 'Ubicación capturada correctamente.',
        );
        setVisitLocationDiagnostics(
          createGeolocationDiagnosticState({
            attemptedAt,
            isSecureContext: secureContext,
            hasGeolocation,
            status: 'SUCCESS',
            result: 'SUCCESS',
          }),
        );
        console.info('[Cobranza][Visita][Geolocation] Ubicación capturada', {
          attemptedAt,
          isSecureContext: secureContext,
          hasGeolocation,
          latitude,
          longitude,
          accuracy,
        });
        setIsResolvingVisitLocation(false);
      },
      (error) => {
        const browserMessage =
          typeof error?.message === 'string' && error.message.trim() ? error.message.trim() : null;
        const result =
          error?.code === 1
            ? 'PERMISSION_DENIED'
            : error?.code === 2
              ? 'POSITION_UNAVAILABLE'
              : error?.code === 3
                ? 'TIMEOUT'
                : 'UNKNOWN_ERROR';
        const message = getGeolocationErrorMessage(error);
        setVisitLocationDiagnostics(
          createGeolocationDiagnosticState({
            attemptedAt,
            isSecureContext: secureContext,
            hasGeolocation,
            status: 'ERROR',
            result,
            errorCode: typeof error?.code === 'number' ? error.code : null,
            errorMessage: message,
            browserMessage,
          }),
        );
        setVisitLocationError(message);
        console.error('[Cobranza][Visita][Geolocation] Error capturando ubicación', {
          attemptedAt,
          isSecureContext: secureContext,
          hasGeolocation,
          result,
          code: typeof error?.code === 'number' ? error.code : null,
          browserMessage,
          resolvedMessage: message,
        });
        setIsResolvingVisitLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      },
    );
  }, []);

  const clearVisitLocation = useCallback(() => {
    setVisitaForm((current) => ({
      ...current,
      latitud: '',
      longitud: '',
    }));
    setVisitLocationError(null);
    setVisitLocationSuccess('Coordenadas limpias. Puedes capturarlas otra vez o dejar la visita sin GPS.');
    setVisitLocationDiagnostics(() => createGeolocationDiagnosticState());
  }, []);

  const submitInteraccion = () => {
    setInteraccionError(null);
    setInteraccionSuccess(null);

    if (isOperationallyBlocked) {
      setInteraccionError(operationalHoldMessage);
      return;
    }

    startInteraccionTransition(async () => {
      try {
        if (isOfflineMode) {
          await enqueueOfflineEvent({
            type: 'INTERACTION',
            payload: {
              clienteId: cliente.id,
              creditoId: credito.id,
              tipo: interaccionForm.tipo as (typeof INTERACCION_TIPOS)[number],
              canal: interaccionForm.canal
                ? (interaccionForm.canal as (typeof INTERACCION_CANALES)[number])
                : null,
              resultado: interaccionForm.resultado as (typeof INTERACCION_RESULTADOS)[number],
              fechaHora: interaccionForm.fechaHora,
              duracionSegundos: interaccionForm.duracionSegundos
                ? Number(interaccionForm.duracionSegundos)
                : null,
              telefonoUsado: interaccionForm.telefonoUsado || null,
              notas: interaccionForm.notas || null,
            },
            capturedByUserId: currentUser.id,
            capturedByUserName: currentUser.name,
          });

          setInteraccionSuccess('Interacción guardada en cola offline. Se sincronizará al reconectar.');
          setInteraccionForm((current) => ({
            ...current,
            notas: '',
            duracionSegundos: '',
            fechaHora: toLocalDateTimeInput(new Date()),
          }));
          return;
        }

        await requestJson('/api/interacciones', {
          method: 'POST',
          body: JSON.stringify({
            clienteId: cliente.id,
            creditoId: credito.id,
            tipo: interaccionForm.tipo,
            canal: interaccionForm.canal || null,
            resultado: interaccionForm.resultado,
            fechaHora: interaccionForm.fechaHora,
            duracionSegundos: interaccionForm.duracionSegundos || null,
            telefonoUsado: interaccionForm.telefonoUsado || null,
            notas: interaccionForm.notas || null,
          }),
        });
        setInteraccionSuccess('Interacción registrada correctamente.');
        setInteraccionForm((current) => ({
          ...current,
          notas: '',
          duracionSegundos: '',
          fechaHora: toLocalDateTimeInput(new Date()),
        }));
        refreshPage();
      } catch (error) {
        setInteraccionError(error instanceof Error ? error.message : 'No se pudo registrar la interacción.');
      }
    });
  };

  const submitPromesa = () => {
    setPromesaError(null);
    setPromesaSuccess(null);

    if (isOperationallyBlocked) {
      setPromesaError(operationalHoldMessage);
      return;
    }

    startPromesaTransition(async () => {
      try {
        if (isOfflineMode) {
          await enqueueOfflineEvent({
            type: 'PROMESA',
            payload: {
              clienteId: cliente.id,
              creditoId: credito.id,
              interaccionId: null,
              fechaPromesa: promesaForm.fechaPromesa,
              montoPrometido: promesaForm.montoPrometido ? Number(promesaForm.montoPrometido) : null,
              notas: promesaForm.notas || null,
            },
            capturedByUserId: currentUser.id,
            capturedByUserName: currentUser.name,
          });

          setPromesaSuccess('Promesa guardada en cola offline. Se sincronizará al reconectar.');
          setPromesaForm({
            fechaPromesa: toLocalDateInput(new Date()),
            montoPrometido: '',
            notas: '',
          });
          return;
        }

        await requestJson('/api/promesas-pago', {
          method: 'POST',
          body: JSON.stringify({
            clienteId: cliente.id,
            creditoId: credito.id,
            fechaPromesa: promesaForm.fechaPromesa,
            montoPrometido: promesaForm.montoPrometido || null,
            notas: promesaForm.notas || null,
          }),
        });
        setPromesaSuccess('Promesa de pago registrada correctamente.');
        setPromesaForm({
          fechaPromesa: toLocalDateInput(new Date()),
          montoPrometido: '',
          notas: '',
        });
        refreshPage();
      } catch (error) {
        setPromesaError(error instanceof Error ? error.message : 'No se pudo registrar la promesa.');
      }
    });
  };

  const submitVisita = () => {
    setVisitaError(null);
    setVisitaSuccess(null);

    if (isOperationallyBlocked) {
      setVisitaError(operationalHoldMessage);
      return;
    }

    startVisitaTransition(async () => {
      try {
        if (isOfflineMode) {
          await enqueueOfflineEvent({
            type: 'VISITA',
            payload: {
              clienteId: cliente.id,
              creditoId: credito.id,
              interaccionId: null,
              fechaHora: visitaForm.fechaHora,
              resultado: visitaForm.resultado as (typeof VISITA_CAMPO_RESULTADOS)[number],
              direccionTexto: visitaForm.direccionTexto || null,
              referenciaLugar: visitaForm.referenciaLugar || null,
              latitud: visitaForm.latitud ? Number(visitaForm.latitud) : null,
              longitud: visitaForm.longitud ? Number(visitaForm.longitud) : null,
              notas: visitaForm.notas || null,
            },
            capturedByUserId: currentUser.id,
            capturedByUserName: currentUser.name,
          });

          setVisitaSuccess('Visita guardada en cola offline. Se sincronizará al reconectar.');
          setVisitLocationError(null);
          setVisitLocationSuccess(null);
          setVisitaForm((current) => ({
            ...current,
            fechaHora: toLocalDateTimeInput(new Date()),
            latitud: '',
            longitud: '',
            notas: '',
          }));
          return;
        }

        await requestJson('/api/visitas-campo', {
          method: 'POST',
          body: JSON.stringify({
            clienteId: cliente.id,
            creditoId: credito.id,
            fechaHora: visitaForm.fechaHora,
            resultado: visitaForm.resultado,
            direccionTexto: visitaForm.direccionTexto || null,
            referenciaLugar: visitaForm.referenciaLugar || null,
            latitud: visitaForm.latitud || null,
            longitud: visitaForm.longitud || null,
            notas: visitaForm.notas || null,
          }),
        });
        setVisitaSuccess('Visita de campo registrada correctamente.');
        setVisitLocationError(null);
        setVisitLocationSuccess(null);
        setVisitaForm((current) => ({
          ...current,
          fechaHora: toLocalDateTimeInput(new Date()),
          latitud: '',
          longitud: '',
          notas: '',
        }));
        refreshPage();
      } catch (error) {
        setVisitaError(error instanceof Error ? error.message : 'No se pudo registrar la visita.');
      }
    });
  };

  const changePromesaEstado = async (promesaPagoId: string, estado: string) => {
    setPromiseStateError(null);
    setUpdatingPromiseId(promesaPagoId);

    if (isOperationallyBlocked) {
      setPromiseStateError(operationalHoldMessage);
      setUpdatingPromiseId(null);
      return;
    }

    try {
      if (isOfflineMode) {
        setPromiseStateError(
          'El cambio de estado de una promesa existente requiere conexión para evitar inconsistencias.',
        );
        return;
      }

      await requestJson(`/api/promesas-pago/${promesaPagoId}/estado`, {
        method: 'PATCH',
        body: JSON.stringify({
          estado,
        }),
      });
      refreshPage();
    } catch (error) {
      setPromiseStateError(
        error instanceof Error ? error.message : 'No se pudo actualizar el estado de la promesa.',
      );
    } finally {
      setUpdatingPromiseId(null);
    }
  };

  return (
    <div className="mt-6 grid gap-6">
      {showCaptureTabs ? (
        <div className="rounded-2xl border border-border/70 bg-muted/10 p-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <Button
              type="button"
              variant={activeCaptureTab === 'INTERACCION' ? 'accent' : 'outline'}
              onClick={() => setActiveCaptureTab('INTERACCION')}
            >
              Llamada
            </Button>
            <Button
              type="button"
              variant={activeCaptureTab === 'PROMESA' ? 'accent' : 'outline'}
              onClick={() => setActiveCaptureTab('PROMESA')}
            >
              Promesa
            </Button>
            <Button
              type="button"
              variant={activeCaptureTab === 'VISITA' ? 'accent' : 'outline'}
              onClick={() => setActiveCaptureTab('VISITA')}
            >
              Visita
            </Button>
          </div>
        </div>
      ) : null}

      {!showCaptureTabs || activeCaptureTab === 'INTERACCION' ? (
      <Card>
        <CardHeader>
          <CardTitle>Interacciones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground">
            {showCaptureForms
              ? 'Registro operativo de contacto con el cliente sin afectar saldos ni estado financiero.'
              : 'Bitácora reciente de contacto con el cliente para lectura rápida del expediente.'}
          </p>
          {showCaptureForms && isOfflineMode ? (
            <p className="rounded-md bg-secondary/30 px-3 py-2 text-sm text-muted-foreground">
              Estás capturando sin internet. Las interacciones se guardan primero en local y no se
              enviarán al backend hasta la siguiente sincronización.
            </p>
          ) : null}
          {showCaptureForms && isOperationallyBlocked ? <Message tone="error">{operationalHoldMessage}</Message> : null}
          {showCaptureForms && interaccionError ? <Message tone="error">{interaccionError}</Message> : null}
          {showCaptureForms && interaccionSuccess ? <Message tone="success">{interaccionSuccess}</Message> : null}

          {showCaptureForms ? (
            <>
              <div className="grid gap-4 lg:grid-cols-3">
                <Field label="Fecha y hora">
                  <Input
                    type="datetime-local"
                    value={interaccionForm.fechaHora}
                    onChange={(event) =>
                      setInteraccionForm((current) => ({ ...current, fechaHora: event.target.value }))
                    }
                  />
                </Field>
                <Field label="Tipo">
                  <Select
                    value={interaccionForm.tipo}
                    onChange={(event) =>
                      setInteraccionForm((current) => ({ ...current, tipo: event.target.value }))
                    }
                  >
                    {INTERACCION_TIPOS.map((tipo) => (
                      <option key={tipo} value={tipo}>
                        {getInteraccionLabel(tipo)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Resultado">
                  <Select
                    value={interaccionForm.resultado}
                    onChange={(event) =>
                      setInteraccionForm((current) => ({ ...current, resultado: event.target.value }))
                    }
                  >
                    {INTERACCION_RESULTADOS.map((resultado) => (
                      <option key={resultado} value={resultado}>
                        {getResultadoInteraccionLabel(resultado)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Canal">
                  <Select
                    value={interaccionForm.canal}
                    onChange={(event) =>
                      setInteraccionForm((current) => ({ ...current, canal: event.target.value }))
                    }
                  >
                    <option value="">Sin canal</option>
                    {INTERACCION_CANALES.map((canal) => (
                      <option key={canal} value={canal}>
                        {getCanalLabel(canal)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Teléfono usado">
                  <Input
                    inputMode="numeric"
                    value={interaccionForm.telefonoUsado}
                    onChange={(event) =>
                      setInteraccionForm((current) => ({
                        ...current,
                        telefonoUsado: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="Duración (segundos)">
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={interaccionForm.duracionSegundos}
                    onChange={(event) =>
                      setInteraccionForm((current) => ({
                        ...current,
                        duracionSegundos: event.target.value,
                      }))
                    }
                  />
                </Field>
              </div>

              <Field label="Notas">
                <Textarea
                  value={interaccionForm.notas}
                  onChange={(event) =>
                    setInteraccionForm((current) => ({ ...current, notas: event.target.value }))
                  }
                />
              </Field>

              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="accent"
                  onClick={submitInteraccion}
                  disabled={isSubmittingInteraccion || isOperationallyBlocked}
                >
                  {isSubmittingInteraccion ? 'Guardando...' : 'Registrar interacción'}
                </Button>
              </div>
            </>
          ) : null}

          {showRecentLists ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">Recientes</p>
              {interaccionItems.length ? (
                interaccionItems.map((item) => (
                  <div key={item.id} className="rounded-xl border border-border/70 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">{getInteraccionLabel(item.tipo)}</Badge>
                          <Badge variant={getCobranzaOutcomeBadgeVariant(item.resultado)}>
                            {getResultadoInteraccionLabel(item.resultado)}
                          </Badge>
                          {item.canal ? <Badge variant="secondary">{getCanalLabel(item.canal)}</Badge> : null}
                          {getOfflineStatusLabel(item.offlineStatus) ? (
                            <Badge variant={getOfflineStatusVariant(item.offlineStatus)}>
                              {getOfflineStatusLabel(item.offlineStatus)}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-2 text-sm font-medium text-foreground">
                          {formatCobranzaDateTime(item.fechaHora)}
                        </p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p>{item.createdByName}</p>
                        <p>{item.creditoFolio}</p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
                      {item.telefonoUsado ? <span>Tel: {item.telefonoUsado}</span> : null}
                      {formatDurationLabel(item.duracionSegundos) ? (
                        <span>Duración: {formatDurationLabel(item.duracionSegundos)}</span>
                      ) : null}
                    </div>

                    {item.notas ? <p className="mt-3 text-sm text-foreground">{item.notas}</p> : null}
                  </div>
                ))
              ) : (
                <EmptyState message="Aún no hay interacciones operativas registradas para este caso." />
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
      ) : null}

      {!showCaptureTabs || activeCaptureTab === 'PROMESA' ? (
      <Card>
        <CardHeader>
          <CardTitle>Promesas de pago</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground">
            {showCaptureForms
              ? 'Entidad operativa trazable para compromisos de pago. No cambia estado financiero por sí sola.'
              : 'Resumen reciente de compromisos de pago registrados para este expediente.'}
          </p>
          {showCaptureForms && isOfflineMode ? (
            <p className="rounded-md bg-secondary/30 px-3 py-2 text-sm text-muted-foreground">
              Las nuevas promesas sí pueden capturarse offline. El cambio de estado de promesas ya
              existentes se mantiene bloqueado hasta reconectar.
            </p>
          ) : null}
          {showCaptureForms && isOperationallyBlocked ? <Message tone="error">{operationalHoldMessage}</Message> : null}

          {showCaptureForms && promesaError ? <Message tone="error">{promesaError}</Message> : null}
          {showCaptureForms && promesaSuccess ? <Message tone="success">{promesaSuccess}</Message> : null}
          {showCaptureForms && promiseStateError ? <Message tone="error">{promiseStateError}</Message> : null}

          {showCaptureForms ? (
            <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Field label="Fecha promesa">
              <Input
                type="date"
                value={promesaForm.fechaPromesa}
                onChange={(event) =>
                  setPromesaForm((current) => ({ ...current, fechaPromesa: event.target.value }))
                }
              />
            </Field>
            <Field label="Monto prometido">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={promesaForm.montoPrometido}
                onChange={(event) =>
                  setPromesaForm((current) => ({ ...current, montoPrometido: event.target.value }))
                }
              />
            </Field>
            <Field label="Estado inicial">
              <Input readOnly value="Pendiente" className="bg-secondary/40 text-muted-foreground" />
            </Field>
          </div>

          <Field label="Notas">
            <Textarea
              value={promesaForm.notas}
              onChange={(event) =>
                setPromesaForm((current) => ({ ...current, notas: event.target.value }))
              }
            />
          </Field>

          <div className="flex justify-end">
            <Button
              type="button"
              variant="accent"
              onClick={submitPromesa}
              disabled={isSubmittingPromesa || isOperationallyBlocked}
            >
              {isSubmittingPromesa ? 'Guardando...' : 'Registrar promesa'}
            </Button>
          </div>
            </>
          ) : null}

          {showRecentLists ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Recientes</p>
            {promesaItems.length ? (
              promesaItems.map((item) => (
                <div key={item.id} className="rounded-xl border border-border/70 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={getCobranzaOutcomeBadgeVariant(item.estado)}>
                          {getPromesaEstadoLabel(item.estado)}
                        </Badge>
                        <Badge variant="outline">Promesa {formatCobranzaDate(item.fechaPromesa)}</Badge>
                        {getOfflineStatusLabel(item.offlineStatus) ? (
                          <Badge variant={getOfflineStatusVariant(item.offlineStatus)}>
                            {getOfflineStatusLabel(item.offlineStatus)}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm font-medium text-foreground">
                        {item.montoPrometido != null ? formatCurrency(item.montoPrometido) : 'Monto abierto'}
                      </p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p>{item.createdByName}</p>
                      <p>{item.creditoFolio}</p>
                    </div>
                  </div>

                  {item.interaccion ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Vinculada a {getInteraccionLabel(item.interaccion.tipo)} del{' '}
                      {formatCobranzaDateTime(item.interaccion.fechaHora)}
                    </p>
                  ) : null}
                  {item.notas ? <p className="mt-3 text-sm text-foreground">{item.notas}</p> : null}

                  {item.estado === 'PENDING' ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="accent"
                        disabled={
                          updatingPromiseId === item.id ||
                          isOfflineMode ||
                          item.offlineStatus != null ||
                          isOperationallyBlocked
                        }
                        onClick={() => changePromesaEstado(item.id, 'FULFILLED')}
                      >
                        Cumplida
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={
                          updatingPromiseId === item.id ||
                          isOfflineMode ||
                          item.offlineStatus != null ||
                          isOperationallyBlocked
                        }
                        onClick={() => changePromesaEstado(item.id, 'BROKEN')}
                      >
                        Incumplida
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={
                          updatingPromiseId === item.id ||
                          isOfflineMode ||
                          item.offlineStatus != null ||
                          isOperationallyBlocked
                        }
                        onClick={() => changePromesaEstado(item.id, 'CANCELLED')}
                      >
                        Cancelar
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <EmptyState message="Aún no hay promesas de pago registradas para este caso." />
            )}
          </div>
          ) : null}
        </CardContent>
      </Card>
      ) : null}

      {!showCaptureTabs || activeCaptureTab === 'VISITA' ? (
      <Card>
        <CardHeader>
          <CardTitle>Visitas de campo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground">
            {showCaptureForms
              ? 'Registro presencial para operación de campo. Puede capturarse con o sin coordenadas.'
              : 'Historial reciente de visitas de campo vinculadas a este expediente.'}
          </p>
          {showCaptureForms && isOfflineMode ? (
            <p className="rounded-md bg-secondary/30 px-3 py-2 text-sm text-muted-foreground">
              Las visitas se guardan localmente con GPS opcional y se enviarán después por evento.
            </p>
          ) : null}
          {showCaptureForms && isOperationallyBlocked ? <Message tone="error">{operationalHoldMessage}</Message> : null}

          {showCaptureForms && visitaError ? <Message tone="error">{visitaError}</Message> : null}
          {showCaptureForms && visitaSuccess ? <Message tone="success">{visitaSuccess}</Message> : null}
          {showCaptureForms && visitLocationError ? <Message tone="error">{visitLocationError}</Message> : null}
          {showCaptureForms && visitLocationSuccess ? <Message tone="success">{visitLocationSuccess}</Message> : null}
          {showCaptureForms ? (
            <div className="rounded-xl border border-border/70 bg-muted/10 p-4 text-sm">
              <p className="font-medium text-foreground">Diagnóstico de geolocalización</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <InfoItem
                  label="window.isSecureContext"
                  value={
                    visitLocationDiagnostics.isSecureContext == null
                      ? 'Sin evaluar'
                      : String(visitLocationDiagnostics.isSecureContext)
                  }
                />
                <InfoItem
                  label="navigator.geolocation"
                  value={visitLocationDiagnostics.hasGeolocation ? 'Disponible' : 'No disponible'}
                />
                <InfoItem
                  label="Resultado"
                  value={getGeolocationResultLabel(visitLocationDiagnostics.result)}
                />
                <InfoItem
                  label="Código de error"
                  value={visitLocationDiagnostics.errorCode != null ? String(visitLocationDiagnostics.errorCode) : '-'}
                />
              </div>
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                <p>Último intento: {visitLocationDiagnostics.attemptedAt ? formatCobranzaDateTime(visitLocationDiagnostics.attemptedAt) : 'Sin intento'}</p>
                <p>Mensaje resuelto: {visitLocationDiagnostics.errorMessage ?? visitLocationSuccess ?? 'Sin mensaje'}</p>
                <p>Mensaje del navegador: {visitLocationDiagnostics.browserMessage ?? 'Sin mensaje del navegador'}</p>
              </div>
              {!visitLocationDiagnostics.isSecureContext && visitLocationDiagnostics.attemptedAt ? (
                <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">
                  Safari en iPhone requiere HTTPS para obtener ubicación actual en la web.
                </p>
              ) : null}
            </div>
          ) : null}

          {showCaptureForms ? (
            <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Field label="Fecha y hora">
              <Input
                type="datetime-local"
                value={visitaForm.fechaHora}
                onChange={(event) =>
                  setVisitaForm((current) => ({ ...current, fechaHora: event.target.value }))
                }
              />
            </Field>
            <Field label="Resultado">
              <Select
                value={visitaForm.resultado}
                onChange={(event) =>
                  setVisitaForm((current) => ({ ...current, resultado: event.target.value }))
                }
              >
                {VISITA_CAMPO_RESULTADOS.map((resultado) => (
                  <option key={resultado} value={resultado}>
                    {getVisitaResultadoLabel(resultado)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Crédito">
              <Input readOnly value={`${credito.folio} · ${credito.loanNumber}`} className="bg-secondary/40 text-muted-foreground" />
            </Field>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="accent"
              onClick={captureCurrentVisitLocation}
              disabled={isResolvingVisitLocation}
            >
              {isResolvingVisitLocation ? 'Capturando ubicación...' : 'Usar ubicación actual'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={clearVisitLocation}
              disabled={isResolvingVisitLocation || (!visitaForm.latitud && !visitaForm.longitud)}
            >
              Limpiar coordenadas
            </Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Dirección texto">
              <Input
                value={visitaForm.direccionTexto}
                onChange={(event) =>
                  setVisitaForm((current) => ({ ...current, direccionTexto: event.target.value }))
                }
              />
            </Field>
            <Field label="Referencia lugar">
              <Input
                value={visitaForm.referenciaLugar}
                onChange={(event) =>
                  setVisitaForm((current) => ({ ...current, referenciaLugar: event.target.value }))
                }
              />
            </Field>
            <Field label="Latitud">
              <Input
                type="number"
                step="0.0000001"
                value={visitaForm.latitud}
                onChange={(event) =>
                  setVisitaForm((current) => ({ ...current, latitud: event.target.value }))
                }
              />
            </Field>
            <Field label="Longitud">
              <Input
                type="number"
                step="0.0000001"
                value={visitaForm.longitud}
                onChange={(event) =>
                  setVisitaForm((current) => ({ ...current, longitud: event.target.value }))
                }
              />
            </Field>
          </div>

          <Field label="Notas">
            <Textarea
              value={visitaForm.notas}
              onChange={(event) =>
                setVisitaForm((current) => ({ ...current, notas: event.target.value }))
              }
            />
          </Field>

          <div className="flex justify-end">
            <Button
              type="button"
              variant="accent"
                onClick={submitVisita}
                disabled={isSubmittingVisita || isOperationallyBlocked}
              >
                {isSubmittingVisita ? 'Guardando...' : 'Registrar visita'}
              </Button>
            </div>
            </>
          ) : null}

          {showRecentLists ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Recientes</p>
            {visitaItems.length ? (
              visitaItems.map((item) => (
                <div key={item.id} className="rounded-xl border border-border/70 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={getCobranzaOutcomeBadgeVariant(item.resultado)}>
                          {getVisitaResultadoLabel(item.resultado)}
                        </Badge>
                        <Badge variant="outline">{formatCobranzaDateTime(item.fechaHora)}</Badge>
                        {getOfflineStatusLabel(item.offlineStatus) ? (
                          <Badge variant={getOfflineStatusVariant(item.offlineStatus)}>
                            {getOfflineStatusLabel(item.offlineStatus)}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p>{item.createdByName}</p>
                      <p>{item.creditoFolio}</p>
                    </div>
                  </div>

                  {item.direccionTexto ? (
                    <p className="mt-3 text-sm text-foreground">{item.direccionTexto}</p>
                  ) : null}
                  {item.referenciaLugar ? (
                    <p className="mt-2 text-xs text-muted-foreground">{item.referenciaLugar}</p>
                  ) : null}
                  {item.latitud != null && item.longitud != null ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      GPS: {item.latitud}, {item.longitud}
                    </p>
                  ) : null}
                  {item.notas ? <p className="mt-3 text-sm text-foreground">{item.notas}</p> : null}
                </div>
              ))
            ) : (
              <EmptyState message="Aún no hay visitas de campo registradas para este caso." />
            )}
          </div>
          ) : null}
        </CardContent>
      </Card>
      ) : null}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/80 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function Message({
  tone,
  children,
}: {
  tone: 'error' | 'success';
  children: React.ReactNode;
}) {
  return (
    <p
      className={
        tone === 'error'
          ? 'rounded-md bg-red-50 px-3 py-2 text-sm text-red-700'
          : 'rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700'
      }
    >
      {children}
    </p>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border/80 px-4 py-6 text-sm text-muted-foreground">
      {message}
    </div>
  );
}
