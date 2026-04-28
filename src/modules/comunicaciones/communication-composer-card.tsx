'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  COMMUNICATION_CHANNELS,
  MESSAGE_TYPES,
  PRIMARY_COMMUNICATION_CHANNEL,
  getCommunicationChannelLabel,
  getMessageTypeLabel,
} from '@/lib/communications';
import { useOfflineMode } from '@/offline/offline-mode-provider';
import { requestJson } from '@/modules/comunicaciones/communication-request';
import type {
  CommunicationPreviewResult,
  MessageTemplateItem,
  SendCommunicationResult,
} from '@/server/services/communications-service';

type CommunicationComposerCardProps = {
  sourceContext: 'CLIENTE' | 'CREDITO' | 'COBRANZA' | 'JURIDICO';
  title?: string;
  description?: string;
  cliente: {
    id: string;
    code: string;
    fullName: string;
    phone: string | null;
    secondaryPhone: string | null;
  };
  credito?: {
    id: string;
    folio: string;
    loanNumber: string;
  } | null;
  creditOptions?: Array<{
    id: string;
    label: string;
  }>;
  canSend: boolean;
  compact?: boolean;
  notice?: string | null;
};

type FeedbackState = {
  type: 'success' | 'error';
  message: string;
} | null;

type TemplateResponse = {
  rows: MessageTemplateItem[];
};

function getFeedbackClassName(type: NonNullable<FeedbackState>['type']) {
  return type === 'error'
    ? 'rounded-lg bg-red-100 px-4 py-3 text-sm text-red-800'
    : 'rounded-lg bg-emerald-100 px-4 py-3 text-sm text-emerald-800';
}

export function CommunicationComposerCard({
  sourceContext,
  title = 'Enviar mensaje',
  description = 'Flujo manual con preview, confirmación y bitácora central.',
  cliente,
  credito = null,
  creditOptions = [],
  canSend,
  compact = false,
  notice = null,
}: CommunicationComposerCardProps) {
  const initialCreditId = credito?.id ?? (creditOptions.length === 1 ? creditOptions[0]?.id ?? '' : '');
  const router = useRouter();
  const { isOfflineMode } = useOfflineMode();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'template' | 'manual'>('template');
  const [templates, setTemplates] = useState<MessageTemplateItem[]>([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedCreditId, setSelectedCreditId] = useState(initialCreditId);
  const [manualType, setManualType] = useState<(typeof MESSAGE_TYPES)[number]>('MANUAL_MESSAGE');
  const [manualChannel, setManualChannel] =
    useState<(typeof COMMUNICATION_CHANNELS)[number]>(PRIMARY_COMMUNICATION_CHANNEL);
  const [recipient, setRecipient] = useState(cliente.phone ?? '');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState<CommunicationPreviewResult | null>(null);
  const [isSubmittingPreview, setIsSubmittingPreview] = useState(false);
  const [isSubmittingSend, setIsSubmittingSend] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  );
  const availableCreditOptions = useMemo(() => {
    if (credito) {
      return [
        {
          id: credito.id,
          label: `${credito.folio} · ${credito.loanNumber}`,
        },
      ];
    }

    return creditOptions;
  }, [credito, creditOptions]);
  const selectedCreditValue = credito?.id ?? (selectedCreditId || null);
  const availableRecipientOptions = [
    cliente.phone ? { label: 'Principal', value: cliente.phone } : null,
    cliente.secondaryPhone ? { label: 'Secundario', value: cliente.secondaryPhone } : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  useEffect(() => {
    if (!isOpen || mode !== 'template' || templatesLoaded || isLoadingTemplates) {
      return;
    }

    let cancelled = false;

    async function loadTemplates() {
      setIsLoadingTemplates(true);
      setTemplatesError(null);

      try {
        const response = await requestJson<TemplateResponse>('/api/comunicaciones/templates?activeOnly=true', {
          method: 'GET',
        });

        if (cancelled) return;

        setTemplates(response.rows);
        setTemplatesLoaded(true);
      } catch (error) {
        if (cancelled) return;
        setTemplatesError(error instanceof Error ? error.message : 'No se pudieron cargar las plantillas activas.');
        setTemplatesLoaded(true);
      } finally {
        if (!cancelled) {
          setIsLoadingTemplates(false);
        }
      }
    }

    void loadTemplates();

    return () => {
      cancelled = true;
    };
  }, [isLoadingTemplates, isOpen, mode, templatesLoaded]);

  function resetPreview() {
    setPreview(null);
  }

  function resetDraft(keepOpen = true) {
    setMode('template');
    setSelectedTemplateId('');
    setSelectedCreditId(initialCreditId);
    setManualType('MANUAL_MESSAGE');
    setManualChannel(PRIMARY_COMMUNICATION_CHANNEL);
    setRecipient(cliente.phone ?? '');
    setSubject('');
    setContent('');
    setPreview(null);
    if (!keepOpen) {
      setIsOpen(false);
    }
  }

  function buildPayload() {
    return {
      clienteId: cliente.id,
      creditoId: selectedCreditValue,
      sourceContext,
      templateId: mode === 'template' ? selectedTemplateId || null : null,
      type: mode === 'manual' ? manualType : selectedTemplate?.type ?? null,
      channel: mode === 'manual' ? manualChannel : selectedTemplate?.channel ?? null,
      recipient,
      subject: mode === 'manual' ? subject || null : null,
      content: mode === 'manual' ? content || null : null,
    };
  }

  async function handlePreview() {
    setFeedback(null);
    setIsSubmittingPreview(true);

    try {
      const result = await requestJson<CommunicationPreviewResult>('/api/comunicaciones/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });

      setPreview(result);
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'No se pudo generar la vista previa.',
      });
    } finally {
      setIsSubmittingPreview(false);
    }
  }

  async function handleSend() {
    setFeedback(null);
    setIsSubmittingSend(true);

    try {
      const result = await requestJson<SendCommunicationResult>('/api/comunicaciones/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });

      setFeedback({
        type: result.success ? 'success' : 'error',
        message: result.message,
      });
      setPreview(null);

      if (result.success) {
        resetDraft();
      }

      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'No se pudo enviar el mensaje.',
      });
    } finally {
      setIsSubmittingSend(false);
    }
  }

  const actionDisabled = !canSend || isOfflineMode || isPending;

  return (
    <Card className={compact ? 'border-border/70' : 'border-primary/10'}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {notice ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {notice}
          </p>
        ) : null}

        <p className="rounded-lg border border-dashed border-border/80 px-4 py-3 text-sm text-muted-foreground">
          En esta fase el envío usa un proveedor mock seguro para pruebas. El flujo ya registra preview,
          confirmación y resultado real en bitácora sin tocar lógica financiera.
        </p>

        {feedback ? <div className={getFeedbackClassName(feedback.type)}>{feedback.message}</div> : null}

        {!canSend ? (
          <p className="text-sm text-muted-foreground">No cuentas con permisos de escritura para enviar mensajes desde este contexto.</p>
        ) : null}

        {isOfflineMode ? (
          <p className="text-sm text-muted-foreground">
            El envío manual de comunicaciones requiere conexión. La bitácora se actualiza al confirmar en línea.
          </p>
        ) : null}

        {!isOpen ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                {cliente.code} · {cliente.fullName}
              </p>
              <p className="text-sm text-muted-foreground">
                {selectedCreditValue && selectedCreditValue === credito?.id && credito
                  ? `${credito.folio} · ${credito.loanNumber}`
                  : sourceContext === 'CLIENTE'
                    ? 'Selecciona crédito solo si la plantilla lo requiere.'
                    : 'El envío se registrará con el contexto actual.'}
              </p>
            </div>
            <Button
              type="button"
              variant={compact ? 'outline' : 'accent'}
              onClick={() => {
                setFeedback(null);
                setIsOpen(true);
              }}
              disabled={actionDisabled}
            >
              Enviar mensaje
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={mode === 'template' ? 'accent' : 'outline'}
                size="sm"
                onClick={() => {
                  setMode('template');
                  resetPreview();
                }}
                disabled={isSubmittingPreview || isSubmittingSend}
              >
                Usar plantilla
              </Button>
              <Button
                type="button"
                variant={mode === 'manual' ? 'accent' : 'outline'}
                size="sm"
                onClick={() => {
                  setMode('manual');
                  resetPreview();
                }}
                disabled={isSubmittingPreview || isSubmittingSend}
              >
                Mensaje manual
              </Button>
            </div>

            {availableCreditOptions.length > 1 && !credito ? (
              <div className="space-y-2">
                <Label>Crédito relacionado</Label>
                <Select
                  value={selectedCreditId}
                  onChange={(event) => {
                    setSelectedCreditId(event.target.value);
                    resetPreview();
                  }}
                  disabled={isSubmittingPreview || isSubmittingSend}
                >
                  <option value="">Sin crédito específico</option>
                  {availableCreditOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}

            {mode === 'template' ? (
              <div className="space-y-2">
                <Label>Plantilla</Label>
                <Select
                  value={selectedTemplateId}
                  onChange={(event) => {
                    setSelectedTemplateId(event.target.value);
                    resetPreview();
                  }}
                  disabled={isSubmittingPreview || isSubmittingSend}
                >
                  <option value="">Selecciona una plantilla</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} · {template.channelLabel} · {template.typeLabel}
                    </option>
                  ))}
                </Select>
                {isLoadingTemplates ? <p className="text-xs text-muted-foreground">Cargando plantillas activas...</p> : null}
                {templatesError ? <p className="text-xs text-red-700">{templatesError}</p> : null}
                {selectedTemplate ? (
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{selectedTemplate.channelLabel}</Badge>
                    <Badge variant="outline">{selectedTemplate.typeLabel}</Badge>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Tipo de mensaje</Label>
                  <Select
                    value={manualType}
                    onChange={(event) => {
                      setManualType(event.target.value as (typeof MESSAGE_TYPES)[number]);
                      resetPreview();
                    }}
                    disabled={isSubmittingPreview || isSubmittingSend}
                  >
                    {MESSAGE_TYPES.map((item) => (
                      <option key={item} value={item}>
                        {getMessageTypeLabel(item)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Canal</Label>
                  <Select
                    value={manualChannel}
                    onChange={(event) => {
                      setManualChannel(event.target.value as (typeof COMMUNICATION_CHANNELS)[number]);
                      resetPreview();
                    }}
                    disabled={isSubmittingPreview || isSubmittingSend}
                  >
                    {COMMUNICATION_CHANNELS.map((item) => (
                      <option key={item} value={item}>
                        {getCommunicationChannelLabel(item)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Asunto opcional</Label>
                  <Input
                    value={subject}
                    onChange={(event) => {
                      setSubject(event.target.value);
                      resetPreview();
                    }}
                    placeholder="Ejemplo: recordatorio de pago"
                    disabled={isSubmittingPreview || isSubmittingSend}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Contenido</Label>
                  <Textarea
                    value={content}
                    onChange={(event) => {
                      setContent(event.target.value);
                      resetPreview();
                    }}
                    placeholder="Puedes usar variables como {{clienteNombre}} o {{creditoFolio}}"
                    disabled={isSubmittingPreview || isSubmittingSend}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Destinatario</Label>
              <Input
                value={recipient}
                onChange={(event) => {
                  setRecipient(event.target.value);
                  resetPreview();
                }}
                placeholder="Teléfono de 10 dígitos o correo"
                disabled={isSubmittingPreview || isSubmittingSend}
              />
              {availableRecipientOptions.length ? (
                <div className="flex flex-wrap gap-2">
                  {availableRecipientOptions.map((item) => (
                    <Button
                      key={`${item.label}-${item.value}`}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRecipient(item.value);
                        resetPreview();
                      }}
                      disabled={isSubmittingPreview || isSubmittingSend}
                    >
                      Usar {item.label.toLowerCase()}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>

            {preview ? (
              <div className="space-y-4 rounded-xl border border-border/80 bg-muted/10 p-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{preview.channelLabel}</Badge>
                  <Badge variant="outline">{preview.typeLabel}</Badge>
                  {preview.template ? <Badge variant="secondary">{preview.template.name}</Badge> : <Badge variant="secondary">Manual</Badge>}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-border/70 bg-background/80 p-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Destinatario</p>
                    <p className="mt-2 text-sm font-medium text-foreground">{preview.recipient}</p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-background/80 p-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Asunto</p>
                    <p className="mt-2 text-sm font-medium text-foreground">{preview.subject ?? 'Sin asunto'}</p>
                  </div>
                </div>

                <div className="rounded-lg border border-border/70 bg-background/80 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Mensaje final</p>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{preview.renderedContent}</p>
                </div>

                {preview.variables.length ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {preview.variables.map((item) => (
                      <div key={item.key} className="rounded-lg border border-border/70 bg-background/80 p-3">
                        <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{item.label}</p>
                        <p className="mt-2 text-sm text-foreground">{item.value ?? 'Sin dato'}</p>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPreview(null)}
                    disabled={isSubmittingSend}
                  >
                    Volver
                  </Button>
                  <Button
                    type="button"
                    variant="accent"
                    onClick={() => void handleSend()}
                    disabled={actionDisabled || isSubmittingSend}
                  >
                    {isSubmittingSend ? 'Enviando...' : 'Confirmar envío'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    resetDraft(false);
                    setFeedback(null);
                  }}
                  disabled={isSubmittingPreview || isSubmittingSend}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="accent"
                  onClick={() => void handlePreview()}
                  disabled={actionDisabled || isSubmittingPreview}
                >
                  {isSubmittingPreview ? 'Generando preview...' : 'Previsualizar'}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
