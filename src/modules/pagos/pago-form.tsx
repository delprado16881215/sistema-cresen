'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { createPagoSchema, type CreatePagoInput } from '@/server/validators/pago';
import { formatCurrency } from '@/modules/creditos/credit-calculations';

type PagoFormProps = {
  credito: {
    id: string;
    folio: string;
    clienteLabel: string;
    avalLabel: string | null;
    promotoriaName: string;
    supervisionName: string | null;
    weeklyAmount: number;
    totalOutstanding: number;
    nextInstallmentLabel: string;
    nextInstallmentOutstanding: number;
    pendingPenalties: Array<{
      id: string;
      amount: number;
      label: string;
      status: string;
    }>;
    estadoCuenta: Array<{
      id: string;
      kind: 'REGULAR' | 'EXTRA';
      label: string;
      dueDate: string;
      expectedAmount: number;
      paidAmount: number;
      paidAt: string | null;
      isPaid: boolean;
    }>;
  };
};

export function PagoForm({ credito }: PagoFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [failureError, setFailureError] = useState<string | null>(null);
  const [isSubmittingFailure, setIsSubmittingFailure] = useState(false);
  const [selectedStatementIds, setSelectedStatementIds] = useState<string[]>(() =>
    credito.estadoCuenta.filter((item) => !item.isPaid && item.paidAmount < item.expectedAmount).slice(0, 1).map((item) => item.id),
  );

  const form = useForm<CreatePagoInput>({
    resolver: zodResolver(createPagoSchema),
    defaultValues: {
      creditoId: credito.id,
      receivedAt: new Date().toISOString().slice(0, 10),
      amountReceived: credito.nextInstallmentOutstanding,
      penaltyChargeIds: [],
      notes: '',
    },
  });

  const selectedPenaltyIds = form.watch('penaltyChargeIds');
  const selectedStatementSet = useMemo(() => new Set(selectedStatementIds), [selectedStatementIds]);
  const selectedStatementTotal = useMemo(() => {
    return credito.estadoCuenta.reduce((sum, item) => {
      if (!selectedStatementSet.has(item.id)) return sum;
      return sum + Math.max(0, item.expectedAmount - item.paidAmount);
    }, 0);
  }, [credito.estadoCuenta, selectedStatementSet]);
  const selectedPenaltyTotal = useMemo(() => {
    const selected = new Set(selectedPenaltyIds);
    return credito.pendingPenalties.reduce(
      (sum, penalty) => (selected.has(penalty.id) ? sum + penalty.amount : sum),
      0,
    );
  }, [credito.pendingPenalties, selectedPenaltyIds]);

  const suggestedTotal = selectedStatementTotal + selectedPenaltyTotal;

  useEffect(() => {
    form.setValue('amountReceived', Number(suggestedTotal.toFixed(2)), {
      shouldDirty: true,
      shouldValidate: true,
    });
  }, [form, suggestedTotal]);

  const toggleStatement = (statementId: string) => {
    setSelectedStatementIds((current) =>
      current.includes(statementId)
        ? current.filter((id) => id !== statementId)
        : [...current, statementId],
    );
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    setFailureError(null);

    const response = await fetch('/api/pagos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...values,
        notes: values.notes || null,
      }),
    });

    if (!response.ok) {
      const body = (await response.json()) as { message?: string };
      setError(body.message ?? 'No se pudo registrar el pago.');
      return;
    }

    router.push(`/creditos/${credito.id}`);
    router.refresh();
  });

  const onMarkFailure = async () => {
    setError(null);
    setFailureError(null);
    setIsSubmittingFailure(true);

    const response = await fetch('/api/pagos/falla', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creditoId: credito.id,
        occurredAt: form.getValues('receivedAt'),
        notes: form.getValues('notes') || null,
      }),
    });

    setIsSubmittingFailure(false);

    if (!response.ok) {
      const body = (await response.json()) as { message?: string };
      setFailureError(body.message ?? 'No se pudo registrar la falla.');
      return;
    }

    router.push(`/creditos/${credito.id}`);
    router.refresh();
  };

  return (
    <form className="space-y-6" onSubmit={onSubmit}>
      {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>Captura de pago</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field label="Fecha de pago" error={form.formState.errors.receivedAt?.message}>
              <Input
                type="date"
                value={form.watch('receivedAt')}
                onChange={(event) =>
                  form.setValue('receivedAt', event.target.value, { shouldDirty: true, shouldValidate: true })
                }
              />
            </Field>

              <Field label="Monto recibido" error={form.formState.errors.amountReceived?.message}>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                value={form.watch('amountReceived')}
                onChange={(event) =>
                  form.setValue('amountReceived', Number(event.target.value), {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                />
              </Field>

              <div className="md:col-span-2 space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Cobro explícito de multas</p>
                    <p className="text-xs text-muted-foreground">
                      Selecciona las multas pendientes que se están cobrando dentro de este pago.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      form.setValue('amountReceived', Number(suggestedTotal.toFixed(2)), {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                  >
                    Usar sugerido
                  </Button>
                </div>

                {credito.pendingPenalties.length ? (
                  <div className="space-y-2">
                    {credito.pendingPenalties.map((penalty) => {
                      const checked = selectedPenaltyIds.includes(penalty.id);

                      return (
                        <label
                          key={penalty.id}
                          className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-border/60 bg-background px-3 py-2"
                        >
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground">{penalty.label}</p>
                            <p className="text-xs text-muted-foreground">{penalty.status}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-semibold text-primary">
                              {formatCurrency(penalty.amount)}
                            </span>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => {
                                const current = form.getValues('penaltyChargeIds');
                                const next = event.target.checked
                                  ? [...current, penalty.id]
                                  : current.filter((id) => id !== penalty.id);
                                form.setValue('penaltyChargeIds', next, {
                                  shouldDirty: true,
                                  shouldValidate: true,
                                });
                              }}
                            />
                          </div>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Este crédito no tiene multas pendientes por cobrar.</p>
                )}

                <div className="grid gap-2 text-sm text-muted-foreground">
                  <SummaryRow label="Pagos seleccionados" value={formatCurrency(selectedStatementTotal)} />
                  <SummaryRow label="Multas seleccionadas" value={formatCurrency(selectedPenaltyTotal)} />
                  <SummaryRow label="Monto sugerido" value={formatCurrency(suggestedTotal)} highlight />
                </div>
              </div>

            <div className="md:col-span-2 space-y-3 rounded-xl border border-border/70 bg-muted/10 p-4">
              <div>
                <p className="text-sm font-medium text-foreground">Estado de cuenta</p>
                <p className="text-xs text-muted-foreground">
                  Selecciona las semanas o la semana extra que vas a cobrar. La tercera columna muestra la fecha en la que ya se pagó; si está en blanco, esa casilla sigue disponible.
                </p>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">Pagar</TableHead>
                    <TableHead>Fecha / Semana</TableHead>
                    <TableHead>Pago realizado</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {credito.estadoCuenta.map((item) => {
                    const outstanding = Math.max(0, item.expectedAmount - item.paidAmount);
                    const canSelect = !item.isPaid && outstanding > 0;
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedStatementSet.has(item.id)}
                            disabled={!canSelect}
                            onChange={() => toggleStatement(item.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-foreground">{item.label}</div>
                          <div className="text-xs text-muted-foreground">{item.dueDate}</div>
                        </TableCell>
                        <TableCell>{item.paidAt ?? ''}</TableCell>
                        <TableCell className="text-right font-medium">
                          {canSelect ? formatCurrency(outstanding) : formatCurrency(item.expectedAmount)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="md:col-span-2">
              <Field label="Notas" error={form.formState.errors.notes?.message}>
                <Textarea
                  value={form.watch('notes') ?? ''}
                  placeholder="Observaciones del pago"
                  onChange={(event) =>
                    form.setValue('notes', event.target.value, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                />
              </Field>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-primary/10 bg-gradient-to-br from-primary/5 to-accent/10">
            <CardHeader>
              <CardTitle>Resumen del crédito</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <SummaryRow label="Crédito" value={credito.folio} />
              <SummaryRow label="Acreditado" value={credito.clienteLabel} />
              <SummaryRow label="Aval" value={credito.avalLabel ?? 'Sin aval'} />
              <SummaryRow label="Promotoría" value={credito.promotoriaName} />
              <SummaryRow label="Supervisión" value={credito.supervisionName ?? 'Sin supervisión'} />
              <SummaryRow label="Pago semanal" value={formatCurrency(credito.weeklyAmount)} />
              <SummaryRow label="Próxima semana" value={credito.nextInstallmentLabel} />
              <SummaryRow label="Pendiente inmediato" value={formatCurrency(credito.nextInstallmentOutstanding)} highlight />
              <SummaryRow label="Multas pendientes" value={formatCurrency(selectedPenaltyTotal)} />
              <SummaryRow label="Saldo abierto total" value={formatCurrency(credito.totalOutstanding)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Aplicación automática</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>El sistema aplica el pago a la semana pendiente más antigua.</p>
              <p>Si el monto excede esa semana, el excedente se aplica automáticamente como recuperado y después como adelanto a semanas posteriores.</p>
              <p>Si el monto no cubre completamente la semana actual, esa semana queda en estado parcial.</p>
            </CardContent>
          </Card>

          <Card className="border-destructive/20">
            <CardHeader>
              <CardTitle>Marcar falla</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Si el cliente no paga su semana, marca la falla para generar automáticamente la multa y, si corresponde, la semana extra.</p>
              {failureError ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{failureError}</p> : null}
              <Button type="button" variant="destructive" onClick={onMarkFailure} disabled={isSubmittingFailure}>
                {isSubmittingFailure ? 'Registrando falla...' : 'Marcar falla semanal'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" type="button" onClick={() => router.push('/pagos')}>
          Cancelar
        </Button>
        <Button type="submit" variant="accent">
          Registrar pago
        </Button>
      </div>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
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
