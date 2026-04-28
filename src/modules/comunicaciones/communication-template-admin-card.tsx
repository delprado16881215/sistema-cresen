'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  COMMUNICATION_CHANNELS,
  MESSAGE_TEMPLATE_VARIABLES,
  MESSAGE_TYPES,
  getCommunicationChannelLabel,
  getMessageTypeLabel,
} from '@/lib/communications';
import { requestJson } from '@/modules/comunicaciones/communication-request';
import type { MessageTemplateItem } from '@/server/services/communications-service';

type FeedbackState = {
  type: 'success' | 'error';
  message: string;
} | null;

function getFeedbackClassName(type: NonNullable<FeedbackState>['type']) {
  return type === 'error'
    ? 'rounded-lg bg-red-100 px-4 py-3 text-sm text-red-800'
    : 'rounded-lg bg-emerald-100 px-4 py-3 text-sm text-emerald-800';
}

function sortTemplates(rows: MessageTemplateItem[]) {
  return [...rows].sort((left, right) => {
    if (left.isActive !== right.isActive) {
      return left.isActive ? -1 : 1;
    }
    if (left.type !== right.type) {
      return left.type.localeCompare(right.type);
    }
    if (left.channel !== right.channel) {
      return left.channel.localeCompare(right.channel);
    }
    return left.name.localeCompare(right.name);
  });
}

export function CommunicationTemplateAdminCard({
  initialTemplates,
}: {
  initialTemplates: MessageTemplateItem[];
}) {
  const [templates, setTemplates] = useState(() => sortTemplates(initialTemplates));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<(typeof MESSAGE_TYPES)[number]>('PAYMENT_REMINDER');
  const [channel, setChannel] = useState<(typeof COMMUNICATION_CHANNELS)[number]>('WHATSAPP');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const editingTemplate = useMemo(
    () => templates.find((template) => template.id === editingId) ?? null,
    [editingId, templates],
  );

  function resetForm() {
    setEditingId(null);
    setName('');
    setType('PAYMENT_REMINDER');
    setChannel('WHATSAPP');
    setSubject('');
    setContent('');
    setIsActive(true);
  }

  function fillForm(template: MessageTemplateItem) {
    setEditingId(template.id);
    setName(template.name);
    setType(template.type);
    setChannel(template.channel);
    setSubject(template.subject ?? '');
    setContent(template.content);
    setIsActive(template.isActive);
  }

  async function handleSubmit() {
    setFeedback(null);
    setIsSubmitting(true);

    try {
      const payload = {
        name,
        type,
        channel,
        subject: subject || null,
        content,
        isActive,
      };

      const response = editingId
        ? await requestJson<MessageTemplateItem>(`/api/comunicaciones/templates/${editingId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await requestJson<MessageTemplateItem>('/api/comunicaciones/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

      setTemplates((current) => {
        const next = editingId
          ? current.map((item) => (item.id === response.id ? response : item))
          : [response, ...current];
        return sortTemplates(next);
      });

      setFeedback({
        type: 'success',
        message: editingId ? 'Plantilla actualizada.' : 'Plantilla registrada.',
      });
      resetForm();
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'No se pudo guardar la plantilla.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Plantillas de comunicaciones</CardTitle>
        <CardDescription>
          Administración mínima de plantillas operativas. Las inactivas no aparecen en el flujo de envío.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {feedback ? <div className={getFeedbackClassName(feedback.type)}>{feedback.message}</div> : null}

        <div className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
          <div className="space-y-4 rounded-xl border border-border/70 bg-muted/10 p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input value={name} onChange={(event) => setName(event.target.value)} disabled={isSubmitting} />
              </div>
              <div className="space-y-2">
                <Label>Estatus</Label>
                <Select
                  value={isActive ? 'ACTIVE' : 'INACTIVE'}
                  onChange={(event) => setIsActive(event.target.value === 'ACTIVE')}
                  disabled={isSubmitting}
                >
                  <option value="ACTIVE">Activa</option>
                  <option value="INACTIVE">Inactiva</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={type} onChange={(event) => setType(event.target.value as (typeof MESSAGE_TYPES)[number])} disabled={isSubmitting}>
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
                  value={channel}
                  onChange={(event) => setChannel(event.target.value as (typeof COMMUNICATION_CHANNELS)[number])}
                  disabled={isSubmitting}
                >
                  {COMMUNICATION_CHANNELS.map((item) => (
                    <option key={item} value={item}>
                      {getCommunicationChannelLabel(item)}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Asunto opcional</Label>
              <Input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Ejemplo: recordatorio de pago"
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label>Contenido</Label>
              <Textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Hola {{clienteNombre}}, tu pago de {{montoPago}} vence el {{fechaPago}}."
                disabled={isSubmitting}
              />
            </div>

            <div className="rounded-lg border border-dashed border-border/80 px-4 py-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Variables permitidas</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {MESSAGE_TEMPLATE_VARIABLES.map((item) => (
                  <Badge key={item.key} variant="outline">
                    {`{{${item.key}}}`}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              {editingTemplate ? (
                <Button type="button" variant="outline" onClick={resetForm} disabled={isSubmitting}>
                  Cancelar edición
                </Button>
              ) : null}
              <Button type="button" variant="accent" onClick={() => void handleSubmit()} disabled={isSubmitting}>
                {isSubmitting ? 'Guardando...' : editingTemplate ? 'Actualizar plantilla' : 'Registrar plantilla'}
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {templates.length ? (
              templates.map((template) => (
                <div key={template.id} className="rounded-xl border border-border/70 bg-background/80 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={template.isActive ? 'success' : 'secondary'}>
                          {template.isActive ? 'Activa' : 'Inactiva'}
                        </Badge>
                        <Badge variant="outline">{template.typeLabel}</Badge>
                        <Badge variant="outline">{template.channelLabel}</Badge>
                      </div>
                      <p className="text-sm font-semibold text-foreground">{template.name}</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => fillForm(template)} disabled={isSubmitting}>
                      Editar
                    </Button>
                  </div>

                  {template.subject ? <p className="mt-3 text-sm text-foreground">Asunto: {template.subject}</p> : null}
                  <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{template.content}</p>
                </div>
              ))
            ) : (
              <p className="rounded-xl border border-dashed border-border/80 px-4 py-5 text-sm text-muted-foreground">
                Aún no hay plantillas registradas.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
