'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { calculateWeeklyAmount, formatCurrency, type CreditPlanOption } from '@/modules/creditos/credit-calculations';
import { ClienteSearchField, type ClienteSearchOption } from '@/modules/creditos/cliente-search-field';
import { normalizeToIsoDate, parseFlexibleDateInput } from '@/lib/date-input';

type CreditoFormProps = {
  promotorias: Array<{ id: string; code: string; name: string; supervision: { id: string; name: string } | null }>;
  planes: CreditPlanOption[];
};

type DraftVentaItem = {
  tempId: string;
  cliente: ClienteSearchOption;
  aval: ClienteSearchOption | null;
  principalAmount: number;
  planCode: CreditPlanOption['code'];
  weeklyAmount: number;
  totalWeeks: number;
  totalPayableAmount: number;
  notes: string | null;
};

export function CreditoForm({ promotorias, planes }: CreditoFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [promotoriaId, setPromotoriaId] = useState(promotorias[0]?.id ?? '');
  const [startDate, setStartDate] = useState(normalizeToIsoDate(new Date()) ?? new Date().toISOString().slice(0, 10));

  const [draftCliente, setDraftCliente] = useState<ClienteSearchOption | null>(null);
  const [draftAval, setDraftAval] = useState<ClienteSearchOption | null>(null);
  const [draftPrincipalAmount, setDraftPrincipalAmount] = useState(1000);
  const [draftPlanCode, setDraftPlanCode] = useState<CreditPlanOption['code']>(planes[0]?.code ?? 'PLAN_12');
  const [draftNotes, setDraftNotes] = useState('');
  const [items, setItems] = useState<DraftVentaItem[]>([]);

  const selectedPromotoria = promotorias.find((promotoria) => promotoria.id === promotoriaId) ?? null;
  const selectedPlan = planes.find((plan) => plan.code === draftPlanCode) ?? planes[0];
  const draftWeeklyAmount = selectedPlan ? calculateWeeklyAmount(draftPrincipalAmount, selectedPlan.weeklyFactor) : 0;
  const draftTotalPayable = draftWeeklyAmount * (selectedPlan?.weeks ?? 0);
  const firstDueDate = useMemo(() => {
    if (!startDate) return '-';
    const date = parseFlexibleDateInput(startDate);
    if (!date || Number.isNaN(date.getTime())) return '-';
    date.setDate(date.getDate() + 7);
    return normalizeToIsoDate(date) ?? '-';
  }, [startDate]);

  const saleSummary = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.principalAmount += item.principalAmount;
        acc.weeklyAmount += item.weeklyAmount;
        acc.totalPayableAmount += item.totalPayableAmount;
        return acc;
      },
      { principalAmount: 0, weeklyAmount: 0, totalPayableAmount: 0 },
    );
  }, [items]);

  const resetDraft = () => {
    setDraftCliente(null);
    setDraftAval(null);
    setDraftPrincipalAmount(1000);
    setDraftPlanCode(planes[0]?.code ?? 'PLAN_12');
    setDraftNotes('');
  };

  const handleAddItem = () => {
    setError(null);
    setSuccess(null);

    if (!promotoriaId) {
      setError('Selecciona la promotoría antes de agregar clientes a la venta.');
      return;
    }
    if (!startDate) {
      setError('Captura la fecha de la venta antes de agregar clientes.');
      return;
    }
    if (!draftCliente) {
      setError('Selecciona un cliente para agregarlo a la venta.');
      return;
    }
    if (draftAval && draftAval.id === draftCliente.id) {
      setError('El aval debe ser diferente al cliente acreditado.');
      return;
    }
    if (items.some((item) => item.cliente.id === draftCliente.id)) {
      setError('Ese cliente ya está agregado dentro de la venta actual.');
      return;
    }
    if (!selectedPlan) {
      setError('Selecciona un plazo válido.');
      return;
    }

    const newItem: DraftVentaItem = {
      tempId: crypto.randomUUID(),
      cliente: draftCliente,
      aval: draftAval,
      principalAmount: draftPrincipalAmount,
      planCode: selectedPlan.code,
      weeklyAmount: draftWeeklyAmount,
      totalWeeks: selectedPlan.weeks,
      totalPayableAmount: draftTotalPayable,
      notes: draftNotes.trim() || null,
    };

    setItems((current) => [...current, newItem]);
    resetDraft();
  };

  const handleRemoveItem = (tempId: string) => {
    setItems((current) => current.filter((item) => item.tempId !== tempId));
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);

    if (!promotoriaId) {
      setError('Selecciona la promotoría de la venta.');
      return;
    }
    if (!startDate) {
      setError('Captura la fecha de la venta.');
      return;
    }
    if (!items.length) {
      setError('Agrega al menos un cliente antes de registrar la venta.');
      return;
    }

    setIsSubmitting(true);

    const response = await fetch('/api/creditos/grupo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promotoriaId,
        startDate,
        items: items.map((item) => ({
          clienteId: item.cliente.id,
          avalClienteId: item.aval?.id ?? null,
          principalAmount: item.principalAmount,
          planCode: item.planCode,
          notes: item.notes,
        })),
      }),
    });

    setIsSubmitting(false);
    const body = (await response.json()) as { message?: string; controlNumber?: number; createdCount?: number; duplicated?: boolean };

    if (!response.ok) {
      setError(body.message ?? 'No se pudo registrar la venta grupal.');
      return;
    }

    setSuccess(
      body.duplicated
        ? `La venta ya existía. Se conservó el grupo con control ${body.controlNumber}.`
        : `Venta registrada con control ${body.controlNumber}. Se originaron ${body.createdCount ?? 0} créditos.`,
    );
    setItems([]);
    resetDraft();
    router.refresh();
    window.setTimeout(() => {
      router.push('/creditos');
      router.refresh();
    }, 900);
  };

  return (
    <div className="space-y-6">
      {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p> : null}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Datos de la venta grupal</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field label="Promotoría">
                <Select value={promotoriaId} onChange={(event) => setPromotoriaId(event.target.value)} disabled={isSubmitting}>
                  {promotorias.map((promotoria) => (
                    <option key={promotoria.id} value={promotoria.id}>
                      {promotoria.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Supervisión derivada">
                <Input readOnly value={selectedPromotoria?.supervision?.name ?? 'Sin supervisión'} className="bg-secondary/40 text-muted-foreground" />
              </Field>

              <Field label="Fecha de venta">
                <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} disabled={isSubmitting} />
              </Field>

              <Field label="Primer vencimiento">
                <Input readOnly value={firstDueDate} className="bg-secondary/40 text-muted-foreground" />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Agregar cliente al grupo</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field label="Cliente">
                <ClienteSearchField
                  value={draftCliente}
                  onSelect={(cliente) => {
                    setDraftCliente(cliente);
                    if (draftAval?.id === cliente?.id) {
                      setDraftAval(null);
                    }
                  }}
                  placeholder="Buscar cliente por código, nombre o teléfono"
                  emptyMessage="No encontramos clientes con ese criterio."
                  blockPlacementBlocked
                  disabled={isSubmitting}
                />
              </Field>

              <Field label="Aval principal">
                <ClienteSearchField
                  value={draftAval}
                  onSelect={(cliente) => setDraftAval(cliente)}
                  placeholder="Buscar aval por código, nombre o teléfono"
                  emptyMessage="No encontramos avales con ese criterio."
                  excludeId={draftCliente?.id}
                  disabled={isSubmitting || !draftCliente}
                />
              </Field>

              <Field label="Monto prestado">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draftPrincipalAmount}
                  disabled={isSubmitting}
                  onChange={(event) => setDraftPrincipalAmount(Number(event.target.value))}
                />
              </Field>

              <Field label="Plazo">
                <Select value={draftPlanCode} onChange={(event) => setDraftPlanCode(event.target.value as CreditPlanOption['code'])} disabled={isSubmitting}>
                  {planes.map((plan) => (
                    <option key={plan.id} value={plan.code}>
                      {plan.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Pago semanal">
                <Input readOnly value={formatCurrency(draftWeeklyAmount)} className="bg-secondary/40 text-muted-foreground" />
              </Field>

              <Field label="Monto pagar">
                <Input readOnly value={formatCurrency(draftTotalPayable)} className="bg-secondary/40 text-muted-foreground" />
              </Field>

              <div className="md:col-span-2">
                <Field label="Observaciones">
                  <Textarea
                    value={draftNotes}
                    placeholder="Notas operativas del cliente dentro de esta venta"
                    disabled={isSubmitting}
                    onChange={(event) => setDraftNotes(event.target.value)}
                  />
                </Field>
              </div>

              <div className="md:col-span-2 flex justify-end">
                <Button type="button" variant="secondary" onClick={handleAddItem} disabled={isSubmitting}>
                  Agregar al grupo
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Clientes en espera dentro de la venta</CardTitle>
            </CardHeader>
            <CardContent>
              {items.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Aval</TableHead>
                      <TableHead>Monto</TableHead>
                      <TableHead>Cuota</TableHead>
                      <TableHead>Monto pagar</TableHead>
                      <TableHead>Plazo</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.tempId}>
                        <TableCell className="font-medium">{item.cliente.code} · {item.cliente.fullName}</TableCell>
                        <TableCell>{item.aval ? `${item.aval.code} · ${item.aval.fullName}` : 'Sin aval'}</TableCell>
                        <TableCell>{formatCurrency(item.principalAmount)}</TableCell>
                        <TableCell>{formatCurrency(item.weeklyAmount)}</TableCell>
                        <TableCell>{formatCurrency(item.totalPayableAmount)}</TableCell>
                        <TableCell>{item.totalWeeks} semanas</TableCell>
                        <TableCell>
                          <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveItem(item.tempId)} disabled={isSubmitting}>
                            Quitar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Todavía no hay clientes dentro de esta venta. Agrega uno o más clientes y después registra el grupo completo.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-primary/10 bg-gradient-to-br from-primary/5 to-accent/10">
            <CardHeader>
              <CardTitle>Resumen de la venta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <SummaryRow label="Promotoría" value={selectedPromotoria?.name ?? 'Sin seleccionar'} />
              <SummaryRow label="Supervisión" value={selectedPromotoria?.supervision?.name ?? 'Sin supervisión'} />
              <SummaryRow label="Fecha de venta" value={startDate || '-'} />
              <SummaryRow label="Primer vencimiento" value={firstDueDate} />
              <SummaryRow label="Clientes en el grupo" value={String(items.length)} highlight />
              <SummaryRow label="Monto colocado" value={formatCurrency(saleSummary.principalAmount)} />
              <SummaryRow label="Cobro semanal del grupo" value={formatCurrency(saleSummary.weeklyAmount)} highlight />
              <SummaryRow label="Monto pagar del grupo" value={formatCurrency(saleSummary.totalPayableAmount)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Registro final</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Al presionar <strong className="text-foreground">Registrar venta</strong>, el sistema calculará el siguiente <strong className="text-foreground">NRO_CONTROL</strong> para esta promotoría y lo asignará a todos los clientes del grupo.
              </p>
              <p>
                Ningún crédito se crea antes de ese momento. La lista anterior funciona como una venta temporal en espera.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" type="button" onClick={() => router.push('/creditos')} disabled={isSubmitting}>
                  Cancelar
                </Button>
                <Button type="button" variant="accent" onClick={handleSubmit} disabled={isSubmitting || !items.length}>
                  {isSubmitting ? 'Registrando venta...' : 'Registrar venta'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function SummaryRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={highlight ? 'font-semibold text-primary' : 'font-medium text-foreground'}>{value}</span>
    </div>
  );
}
