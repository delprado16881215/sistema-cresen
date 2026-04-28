'use client';

import { type WheelEventHandler, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/modules/creditos/credit-calculations';

type GrupoRow = {
  creditoId: string;
  scheduleId: string | null;
  extraWeekEventId: string | null;
  recoveryAnchorDefaultEventId: string | null;
  recoveryAnchorScheduleId: string | null;
  recoveryAnchorInstallmentNumber: number | null;
  folio: string;
  loanNumber: string;
  controlNumber: number | null;
  clienteLabel: string;
  avalLabel: string | null;
  promotoriaName: string;
  supervisionName: string | null;
  operationalScope: 'active' | 'active_with_extra_week' | 'overdue';
  operationalWeek: number;
  creditStartDate: string | null;
  scheduledDate: string | null;
  installmentLabel: string;
  weeklyAmount: number;
  collectibleAmount: number;
  deAmount: number;
  recoveryAmountAvailable: number;
  advanceAmountAvailable: number;
  outgoingAdvanceAmount: number;
  extraWeekAmount: number;
  rowMode: 'regular' | 'recovery_only' | 'extra_week_only' | 'final_closure';
  historicalCurrentPaymentAmount: number;
  historicalFailureAmount: number;
  historicalRecoveryAmount: number;
  historicalAdvanceIncomingAmount: number;
  historicalExtraWeekCollectedAmount: number;
  installmentNumber: number;
};

type PagosGrupoFormProps = {
  promotoriaId: string;
  occurredAt: string;
  scope: 'active' | 'active_with_extra_week' | 'overdue' | 'all';
  rows: GrupoRow[];
  groupCount: number | null;
  mode: 'preview' | 'historical';
  liquidation: {
    deAmount: number;
    failureAmount: number;
    recoveryAmount: number;
    subtotalAmount: number;
    incomingAdvanceAmount: number;
    outgoingAdvanceAmount: number;
    extraWeekAmount: number;
    totalToDeliver: number;
    saleAmount: number;
    bonusAmount: number;
    commissionBase: 'SALE' | 'TOTAL_TO_DELIVER';
    commissionRate: '10' | '12.5' | '15';
    commissionAmount: number;
    finalCashAmount: number;
    finalCashLabel: string;
    cumulative: {
      totalInvestmentAmount: number;
      totalCashAmount: number;
      finalCashAmount: number;
    };
  } | null;
};

export function PagosGrupoForm({ promotoriaId, occurredAt, scope, rows, groupCount, mode, liquidation }: PagosGrupoFormProps) {
  const router = useRouter();
  const submitLockRef = useRef(false);
  const [failedIds, setFailedIds] = useState<string[]>([]);
  const [partialFailureAmounts, setPartialFailureAmounts] = useState<Record<string, string>>({});
  const [recoveryAmounts, setRecoveryAmounts] = useState<Record<string, string>>({});
  const [advanceAmounts, setAdvanceAmounts] = useState<Record<string, string>>({});
  const [extraWeekCaptureAmounts, setExtraWeekCaptureAmounts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [saleAmount, setSaleAmount] = useState('');
  const [bonusAmount, setBonusAmount] = useState('');
  const [commissionBase, setCommissionBase] = useState<'SALE' | 'TOTAL_TO_DELIVER'>('SALE');
  const [commissionRate, setCommissionRate] = useState<'10' | '12.5' | '15'>('10');
  const [warning, setWarning] = useState<string | null>(null);
  const [autoAdjustedRows, setAutoAdjustedRows] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingLiquidation, setIsSavingLiquidation] = useState(false);

  useEffect(() => {
    setFailedIds(
      mode === 'historical'
        ? rows.filter((row) => row.historicalFailureAmount > 0).map((row) => row.creditoId)
        : [],
    );
    setRecoveryAmounts(
      Object.fromEntries(
        rows.map((row) => [
          row.creditoId,
          mode === 'historical' && row.historicalRecoveryAmount > 0
            ? String(row.historicalRecoveryAmount)
            : '',
        ]),
      ),
    );
    setPartialFailureAmounts(
      Object.fromEntries(
        rows.map((row) => [
          row.creditoId,
          mode === 'historical' && row.historicalFailureAmount > 0 && row.historicalCurrentPaymentAmount > 0
            ? String(row.historicalCurrentPaymentAmount)
            : '',
        ]),
      ),
    );
    setAdvanceAmounts(
      Object.fromEntries(
        rows.map((row) => [
          row.creditoId,
          mode === 'historical' && row.historicalAdvanceIncomingAmount > 0
            ? String(row.historicalAdvanceIncomingAmount)
            : '',
        ]),
      ),
    );
    setExtraWeekCaptureAmounts(
      Object.fromEntries(
        rows.map((row) => [
          row.creditoId,
          mode === 'historical' && row.historicalExtraWeekCollectedAmount > 0
            ? String(row.historicalExtraWeekCollectedAmount)
            : '',
        ]),
      ),
    );
    setSaleAmount(liquidation && liquidation.saleAmount > 0 ? String(liquidation.saleAmount) : '');
    setBonusAmount(liquidation && liquidation.bonusAmount > 0 ? String(liquidation.bonusAmount) : '');
    setCommissionBase(liquidation?.commissionBase ?? 'SALE');
    setCommissionRate(liquidation?.commissionRate ?? '10');
    setAutoAdjustedRows({});
    setWarning(null);
  }, [liquidation, mode, rows]);

  const roundMoney = (value: number) => Number(value.toFixed(2));
  const formatDisplayDate = (value: string | null) => {
    if (!value) return null;
    const [year, month, day] = value.split('-');
    if (!year || !month || !day) return value;
    return `${day}/${month}/${year}`;
  };
  const formatInputMoney = (value: number) => (roundMoney(value) > 0 ? String(roundMoney(value)) : '');
  const parseInputMoney = (value: string) => {
    if (!value.trim()) return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? roundMoney(Math.max(0, parsed)) : 0;
  };
  const monetaryInputClassName =
    'min-w-28 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';
  const blockWheelChange: WheelEventHandler<HTMLInputElement> = (event) => {
    event.currentTarget.blur();
    event.preventDefault();
  };
  const failedSet = useMemo(() => new Set(failedIds), [failedIds]);
  const rowsByCreditoId = useMemo(
    () => new Map(rows.map((row) => [row.creditoId, row])),
    [rows],
  );
  const parsedRecoveryAmounts = useMemo(
    () =>
      Object.fromEntries(
        rows.map((row) => {
          const rawValue = Number(recoveryAmounts[row.creditoId] ?? 0);
          const safeValue = Number.isFinite(rawValue) ? roundMoney(Math.max(0, rawValue)) : 0;
          return [row.creditoId, roundMoney(Math.min(roundMoney(row.recoveryAmountAvailable), safeValue))];
        }),
      ) as Record<string, number>,
    [recoveryAmounts, rows],
  );
  const parsedPartialFailureAmounts = useMemo(
    () =>
      Object.fromEntries(
        rows.map((row) => {
          const rawValue = Number(partialFailureAmounts[row.creditoId] ?? 0);
          const safeValue = Number.isFinite(rawValue) ? roundMoney(Math.max(0, rawValue)) : 0;
          return [row.creditoId, roundMoney(Math.min(roundMoney(row.collectibleAmount), safeValue))];
        }),
      ) as Record<string, number>,
    [partialFailureAmounts, rows],
  );
  const parsedAdvanceAmounts = useMemo(
    () =>
      Object.fromEntries(
        rows.map((row) => {
          const rawValue = Number(advanceAmounts[row.creditoId] ?? 0);
          const safeValue = Number.isFinite(rawValue) ? roundMoney(Math.max(0, rawValue)) : 0;
          return [row.creditoId, safeValue];
        }),
      ) as Record<string, number>,
    [advanceAmounts, rows],
  );
  const parsedExtraWeekCaptureAmounts = useMemo(
    () =>
      Object.fromEntries(
        rows.map((row) => {
          const rawValue = Number(extraWeekCaptureAmounts[row.creditoId] ?? 0);
          const safeValue = Number.isFinite(rawValue) ? roundMoney(Math.max(0, rawValue)) : 0;
          return [row.creditoId, roundMoney(Math.min(roundMoney(row.extraWeekAmount), safeValue))];
        }),
      ) as Record<string, number>,
    [extraWeekCaptureAmounts, rows],
  );
  const isHistoricalMode = mode === 'historical';
  const displayedGroupCount = isHistoricalMode ? groupCount ?? rows.length : rows.length;
  const sortedRows = useMemo(
    () =>
      [...rows].sort((left, right) => {
        const controlDiff = (right.controlNumber ?? -1) - (left.controlNumber ?? -1);
        if (controlDiff !== 0) return controlDiff;
        return left.clienteLabel.localeCompare(right.clienteLabel);
      }),
    [rows],
  );
  const baseDeAmount = useMemo(() => rows.reduce((sum, row) => sum + row.deAmount, 0), [rows]);
  const paidRows = useMemo(() => rows.filter((row) => !failedSet.has(row.creditoId)), [failedSet, rows]);
  const failedRows = useMemo(() => rows.filter((row) => failedSet.has(row.creditoId)), [failedSet, rows]);
  const failureAmount = useMemo(
    () =>
      isHistoricalMode
        ? rows.reduce((sum, row) => sum + row.historicalFailureAmount, 0)
        : failedRows.reduce((sum, row) => sum + Math.max(0, row.collectibleAmount - (parsedPartialFailureAmounts[row.creditoId] ?? 0)), 0),
    [failedRows, isHistoricalMode, parsedPartialFailureAmounts, rows],
  );
  const recoveryAmount = useMemo(
    () =>
      isHistoricalMode
        ? rows.reduce((sum, row) => sum + row.historicalRecoveryAmount, 0)
        : paidRows.reduce((sum, row) => sum + (parsedRecoveryAmounts[row.creditoId] ?? 0), 0),
    [isHistoricalMode, paidRows, parsedRecoveryAmounts, rows],
  );
  const incomingAdvanceAmount = useMemo(
    () =>
      isHistoricalMode
        ? rows.reduce((sum, row) => sum + row.historicalAdvanceIncomingAmount, 0)
        : paidRows.reduce((sum, row) => sum + (parsedAdvanceAmounts[row.creditoId] ?? 0), 0),
    [isHistoricalMode, paidRows, parsedAdvanceAmounts, rows],
  );
  const outgoingAdvanceAmount = useMemo(
    () => rows.reduce((sum, row) => sum + row.outgoingAdvanceAmount, 0),
    [rows],
  );
  const extraWeekCollectedAmount = useMemo(
    () =>
      isHistoricalMode
        ? rows.reduce((sum, row) => sum + row.historicalExtraWeekCollectedAmount, 0)
        : paidRows.reduce((sum, row) => sum + (parsedExtraWeekCaptureAmounts[row.creditoId] ?? 0), 0),
    [isHistoricalMode, paidRows, parsedExtraWeekCaptureAmounts, rows],
  );
  const computedDeAmount = useMemo(() => baseDeAmount, [baseDeAmount]);
  const computedSubtotalAmount = useMemo(
    () => computedDeAmount - failureAmount + recoveryAmount,
    [computedDeAmount, failureAmount, recoveryAmount],
  );
  const computedTotalToDeliver = useMemo(
    () => computedSubtotalAmount + incomingAdvanceAmount - outgoingAdvanceAmount + extraWeekCollectedAmount,
    [computedSubtotalAmount, incomingAdvanceAmount, outgoingAdvanceAmount, extraWeekCollectedAmount],
  );
  const deAmount = isHistoricalMode && liquidation ? liquidation.deAmount : computedDeAmount;
  const displayedFailureAmount = isHistoricalMode && liquidation ? liquidation.failureAmount : failureAmount;
  const displayedRecoveryAmount = isHistoricalMode && liquidation ? liquidation.recoveryAmount : recoveryAmount;
  const subtotalAmount = isHistoricalMode && liquidation ? liquidation.subtotalAmount : computedSubtotalAmount;
  const displayedIncomingAdvanceAmount =
    isHistoricalMode && liquidation ? liquidation.incomingAdvanceAmount : incomingAdvanceAmount;
  const displayedOutgoingAdvanceAmount =
    isHistoricalMode && liquidation ? liquidation.outgoingAdvanceAmount : outgoingAdvanceAmount;
  const displayedExtraWeekAmount =
    isHistoricalMode && liquidation ? liquidation.extraWeekAmount : extraWeekCollectedAmount;
  const totalToDeliver =
    isHistoricalMode && liquidation ? liquidation.totalToDeliver : computedTotalToDeliver;
  const parsedSaleAmount = useMemo(() => {
    const rawValue = Number(saleAmount ?? 0);
    return Number.isFinite(rawValue) ? Math.max(0, rawValue) : 0;
  }, [saleAmount]);
  const parsedBonusAmount = useMemo(() => {
    const rawValue = Number(bonusAmount ?? 0);
    return Number.isFinite(rawValue) ? Math.max(0, rawValue) : 0;
  }, [bonusAmount]);
  const commissionBaseAmount = useMemo(
    () => (commissionBase === 'SALE' ? parsedSaleAmount : subtotalAmount),
    [commissionBase, parsedSaleAmount, subtotalAmount],
  );
  const commissionAmount = useMemo(
    () => Number(((commissionBaseAmount * Number(commissionRate)) / 100).toFixed(2)),
    [commissionBaseAmount, commissionRate],
  );
  const finalCashAmount = useMemo(
    () => Number((totalToDeliver - parsedSaleAmount - commissionAmount - parsedBonusAmount).toFixed(2)),
    [commissionAmount, parsedBonusAmount, parsedSaleAmount, totalToDeliver],
  );
  const finalCashPrimaryLabel = finalCashAmount > 0 ? 'Caja' : 'Caja final';
  const finalCashLabel = finalCashAmount < 0 ? 'La inversión fue mayor que la caja.' : 'La caja fue mayor que la inversión.';
  const cumulativeInvestmentAmount = liquidation?.cumulative.totalInvestmentAmount ?? 0;
  const cumulativeCashAmount = liquidation?.cumulative.totalCashAmount ?? 0;
  const cumulativeFinalCashAmount = liquidation?.cumulative.finalCashAmount ?? 0;
  const cumulativeFinalCashTone = cumulativeFinalCashAmount < 0 ? 'text-red-700' : 'text-emerald-700';

  const typeBadgeClassNames = {
    pagoNormal: 'border border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46]',
    falla: 'border border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]',
    recuperado: 'border border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]',
    semanaExtra: 'border border-[#BFDBFE] bg-[#EFF6FF] text-[#1E3A8A]',
    cierreOperativo: 'border border-[#C7D2FE] bg-[#EEF2FF] text-[#3730A3]',
    adelantoEntrante: 'border border-[#DDD6FE] bg-[#F5F3FF] text-[#5B21B6]',
    adelantoSaliente: 'border border-[#E5E7EB] bg-[#F9FAFB] text-[#374151]',
    ajusteAutomatico: 'border border-[#FCD34D] bg-[#FFFBEB] text-[#78350F]',
  } as const;

  const getRecoveryValue = (creditoId: string) => parsedRecoveryAmounts[creditoId] ?? 0;
  const getPartialFailureValue = (creditoId: string) => parsedPartialFailureAmounts[creditoId] ?? 0;
  const getAdvanceValue = (creditoId: string) => parsedAdvanceAmounts[creditoId] ?? 0;
  const getExtraWeekCaptureValue = (creditoId: string) => parsedExtraWeekCaptureAmounts[creditoId] ?? 0;

  const clearAutoAdjustment = (creditoId: string) => {
    setAutoAdjustedRows((current) => {
      if (!(creditoId in current)) return current;
      const next = { ...current };
      delete next[creditoId];
      return next;
    });
  };

  const toggleFailure = (creditoId: string) => {
    setFailedIds((current) =>
      current.includes(creditoId)
        ? current.filter((id) => id !== creditoId)
        : [...current, creditoId],
    );
  };

  const handleRecoveryChange = (creditoId: string, value: string) => {
    const row = rowsByCreditoId.get(creditoId);
    if (!row) {
      setRecoveryAmounts((current) => ({ ...current, [creditoId]: value }));
      return;
    }

    if (!value.trim()) {
      setRecoveryAmounts((current) => ({ ...current, [creditoId]: '' }));
      clearAutoAdjustment(creditoId);
      setWarning(null);
      return;
    }

    const recoveryAvailable = roundMoney(row.recoveryAmountAvailable);
    const extraWeekAvailable = roundMoney(row.extraWeekAmount);
    const currentExtraWeekAmount = parseInputMoney(extraWeekCaptureAmounts[creditoId] ?? '');
    let nextRecoveryAmount = parseInputMoney(value);
    let nextExtraWeekAmount = currentExtraWeekAmount;
    let nextWarning: string | null = null;
    let nextAutoAdjustment: string | null = null;

    if (nextRecoveryAmount > recoveryAvailable + 0.001) {
      const overflowAmount = roundMoney(nextRecoveryAmount - recoveryAvailable);
      const normalizedExtraWeekAmount = roundMoney(nextExtraWeekAmount + overflowAmount);

      if (extraWeekAvailable > 0 && normalizedExtraWeekAmount <= extraWeekAvailable + 0.001) {
        nextRecoveryAmount = recoveryAvailable;
        nextExtraWeekAmount = normalizedExtraWeekAmount;
        nextWarning =
          `${row.clienteLabel}: capturaste ${formatCurrency(parseInputMoney(value))} en recuperado. Se ajustó a ${formatCurrency(nextRecoveryAmount)} en recuperado y ${formatCurrency(nextExtraWeekAmount)} en semana extra porque solo ${formatCurrency(recoveryAvailable)} corresponden a recuperado.`;
        nextAutoAdjustment = 'Recuperado ajustado automáticamente';
      } else {
        nextRecoveryAmount = recoveryAvailable;
        nextWarning =
          extraWeekAvailable > 0
            ? `${row.clienteLabel}: solo ${formatCurrency(recoveryAvailable)} corresponden a recuperado. Captura la semana extra en su columna.`
            : `${row.clienteLabel}: solo tienes ${formatCurrency(recoveryAvailable)} disponibles para recuperado.`;
      }
    }

    setRecoveryAmounts((current) => ({ ...current, [creditoId]: formatInputMoney(nextRecoveryAmount) }));
    if (nextExtraWeekAmount !== currentExtraWeekAmount) {
      setExtraWeekCaptureAmounts((current) => ({
        ...current,
        [creditoId]: formatInputMoney(nextExtraWeekAmount),
      }));
    }
    if (nextAutoAdjustment) {
      setAutoAdjustedRows((current) => ({ ...current, [creditoId]: nextAutoAdjustment }));
    } else {
      clearAutoAdjustment(creditoId);
    }
    setWarning(nextWarning);
  };

  const handlePartialFailureChange = (creditoId: string, value: string) => {
    setPartialFailureAmounts((current) => ({ ...current, [creditoId]: value }));
  };

  const handleAdvanceChange = (creditoId: string, value: string) => {
    const row = rowsByCreditoId.get(creditoId);
    if (!row) {
      setAdvanceAmounts((current) => ({ ...current, [creditoId]: value }));
      return;
    }

    if (!value.trim()) {
      setAdvanceAmounts((current) => ({ ...current, [creditoId]: '' }));
      clearAutoAdjustment(creditoId);
      setWarning(null);
      return;
    }

    const advanceAvailable = roundMoney(row.advanceAmountAvailable);
    const extraWeekAvailable = roundMoney(row.extraWeekAmount);
    const currentExtraWeekAmount = parseInputMoney(extraWeekCaptureAmounts[creditoId] ?? '');
    let nextAdvanceAmount = parseInputMoney(value);
    let nextExtraWeekAmount = currentExtraWeekAmount;
    let nextWarning: string | null = null;
    let nextAutoAdjustment: string | null = null;

    if (nextAdvanceAmount > advanceAvailable + 0.001) {
      const overflowAmount = roundMoney(nextAdvanceAmount - advanceAvailable);
      const normalizedExtraWeekAmount = roundMoney(nextExtraWeekAmount + overflowAmount);

      if (extraWeekAvailable > 0 && normalizedExtraWeekAmount <= extraWeekAvailable + 0.001) {
        nextAdvanceAmount = advanceAvailable;
        nextExtraWeekAmount = normalizedExtraWeekAmount;
        nextWarning = `${row.clienteLabel}: capturaste ${formatCurrency(parseInputMoney(value))} en adelanto. Se ajustó a ${formatCurrency(nextAdvanceAmount)} en adelanto y ${formatCurrency(nextExtraWeekAmount)} en semana extra porque solo ${formatCurrency(advanceAvailable)} corresponden a adelanto disponible.`;
        nextAutoAdjustment = 'Adelanto ajustado automáticamente';
      } else {
        nextAdvanceAmount = advanceAvailable;
        nextWarning =
          extraWeekAvailable > 0
            ? `${row.clienteLabel}: solo ${formatCurrency(advanceAvailable)} corresponden a adelanto. Si corresponde, captura la semana extra en su columna.`
            : `${row.clienteLabel}: solo tienes ${formatCurrency(advanceAvailable)} disponibles para adelanto.`;
      }
    }

    setAdvanceAmounts((current) => ({ ...current, [creditoId]: formatInputMoney(nextAdvanceAmount) }));
    if (nextExtraWeekAmount !== currentExtraWeekAmount) {
      setExtraWeekCaptureAmounts((current) => ({
        ...current,
        [creditoId]: formatInputMoney(nextExtraWeekAmount),
      }));
    }
    if (nextAutoAdjustment) {
      setAutoAdjustedRows((current) => ({ ...current, [creditoId]: nextAutoAdjustment }));
    } else {
      clearAutoAdjustment(creditoId);
    }
    setWarning(nextWarning);
  };

  const handleExtraWeekCaptureChange = (creditoId: string, value: string) => {
    const row = rowsByCreditoId.get(creditoId);
    if (!row) {
      setExtraWeekCaptureAmounts((current) => ({ ...current, [creditoId]: value }));
      return;
    }

    if (!value.trim()) {
      setExtraWeekCaptureAmounts((current) => ({ ...current, [creditoId]: '' }));
      clearAutoAdjustment(creditoId);
      setWarning(null);
      return;
    }

    const extraWeekAvailable = roundMoney(row.extraWeekAmount);
    const requestedExtraWeekAmount = parseInputMoney(value);
    const nextExtraWeekAmount = Math.min(extraWeekAvailable, requestedExtraWeekAmount);
    const nextWarning =
      requestedExtraWeekAmount > extraWeekAvailable + 0.001
        ? `${row.clienteLabel}: capturaste ${formatCurrency(requestedExtraWeekAmount)} en semana extra. Se ajustó a ${formatCurrency(nextExtraWeekAmount)} porque solo ${formatCurrency(extraWeekAvailable)} están disponibles.`
        : null;

    setExtraWeekCaptureAmounts((current) => ({
      ...current,
      [creditoId]: formatInputMoney(nextExtraWeekAmount),
    }));
    if (nextWarning) {
      setAutoAdjustedRows((current) => ({
        ...current,
        [creditoId]: 'Semana extra ajustada automáticamente',
      }));
    } else {
      clearAutoAdjustment(creditoId);
    }
    setWarning(nextWarning);
  };

  const handleImpact = async () => {
    if (isHistoricalMode) {
      setError('Esta fecha ya tiene movimientos registrados. El panel está en modo histórico y no permite reimpactar.');
      return;
    }
    if (submitLockRef.current || isSubmitting) return;
    submitLockRef.current = true;
    setWarning(null);
    setError(null);
    setSuccess(null);

    if (!rows.length) {
      setError('No hay clientes cargados para impactar.');
      submitLockRef.current = false;
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/pagos/grupo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promotoriaId,
          occurredAt,
          scope,
          notes: notes.trim() || null,
          liquidation: {
            saleAmount: parsedSaleAmount,
            bonusAmount: parsedBonusAmount,
            commissionBase,
            commissionRate,
          },
          items: rows.map((row) => ({
            creditoId: row.creditoId,
            action: failedSet.has(row.creditoId) ? 'FAIL' : 'PAY',
            recoveryAmount: failedSet.has(row.creditoId) ? 0 : getRecoveryValue(row.creditoId),
            advanceAmount: failedSet.has(row.creditoId) ? 0 : getAdvanceValue(row.creditoId),
            extraWeekAmount: failedSet.has(row.creditoId) ? 0 : getExtraWeekCaptureValue(row.creditoId),
            partialFailureAmount: failedSet.has(row.creditoId) ? getPartialFailureValue(row.creditoId) : 0,
          })),
        }),
      });

      const body = (await response.json()) as {
        message?: string;
        paidCount?: number;
        failedCount?: number;
        skippedPayments?: number;
        skippedFailures?: number;
        issues?: string[];
      };

      if (!response.ok) {
        setError(body.message ?? 'No se pudo impactar la cobranza grupal.');
        return;
      }

      setSuccess(
        `Impacto completado: ${body.paidCount ?? 0} pagos normales, ${body.failedCount ?? 0} fallas${(body.skippedPayments ?? 0) || (body.skippedFailures ?? 0) ? `, ${((body.skippedPayments ?? 0) + (body.skippedFailures ?? 0))} omitidos por seguridad` : ''}.`,
      );

      if (body.issues?.length) {
        setError(body.issues.slice(0, 3).join(' '));
      }

      router.refresh();
    } catch {
      setError('No se pudo impactar la cobranza grupal. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setIsSubmitting(false);
      submitLockRef.current = false;
    }
  };

  const handleSaveLiquidation = async () => {
    if (isSavingLiquidation) return;

    setError(null);
    setSuccess(null);
    setWarning(null);
    setIsSavingLiquidation(true);

    try {
      const response = await fetch('/api/pagos/grupo/liquidacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promotoriaId,
          occurredAt,
          scope,
          saleAmount: parsedSaleAmount,
          bonusAmount: parsedBonusAmount,
          commissionBase,
          commissionRate,
        }),
      });

      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(body.message ?? 'No se pudo guardar la liquidación.');
        return;
      }

      setSuccess(liquidation ? 'Liquidación actualizada correctamente.' : 'Liquidación guardada correctamente.');
      router.refresh();
    } catch {
      setError('No se pudo guardar la liquidación. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setIsSavingLiquidation(false);
    }
  };

  return (
    <div className="space-y-6">
      {warning ? <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">{warning}</p> : null}
      {error ? <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">{error}</p> : null}
      {success ? <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p> : null}

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Clientes del grupo" value={String(displayedGroupCount)} />
        <MetricCard label="Debe de Entregar" value={formatCurrency(deAmount)} tone="primary" />
        <MetricCard label="Falla" value={formatCurrency(displayedFailureAmount)} tone={displayedFailureAmount ? 'danger' : 'default'} />
        <MetricCard label="Recuperado" value={formatCurrency(displayedRecoveryAmount)} />
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <MetricCard label="Total 1" value={formatCurrency(subtotalAmount)} tone="primary" />
        <MetricCard label="Adelanto entrante" value={formatCurrency(displayedIncomingAdvanceAmount)} />
        <MetricCard label="Adelanto saliente" value={formatCurrency(displayedOutgoingAdvanceAmount)} tone={displayedOutgoingAdvanceAmount ? 'danger' : 'default'} />
        <MetricCard label="Semana extra" value={formatCurrency(displayedExtraWeekAmount)} />
        <MetricCard label="Total a entregar" value={formatCurrency(totalToDeliver)} tone="primary" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Impacto de cobranza semanal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>Notas operativas del grupo</Label>
              <Input
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Observaciones generales de la visita o cobranza"
                disabled={isSubmitting || isHistoricalMode}
              />
            </div>
          </div>

          {isHistoricalMode ? (
            <p className="rounded-md bg-sky-50 p-3 text-sm text-sky-800">
              Esta fecha ya tiene movimientos registrados. El panel muestra exactamente lo que ocurrió ese día y bloquea nuevas capturas sobre el mismo grupo.
            </p>
          ) : null}

          <div className="rounded-xl border border-border/70">
              <Table containerClassName="max-h-[560px] overflow-auto" className="min-w-[1520px] border-separate border-spacing-0">
                <TableHeader>
              <TableRow>
                <TableHead className="sticky top-0 left-0 z-[70] bg-background shadow-sm" style={{ width: 64, minWidth: 64 }}>Falla</TableHead>
                <TableHead className="sticky top-0 z-[70] bg-background shadow-sm" style={{ left: 64, width: 88, minWidth: 88 }}>Control</TableHead>
                <TableHead className="sticky top-0 z-[70] bg-background shadow-sm" style={{ left: 152, width: 320, minWidth: 320 }}>Acreditado</TableHead>
                <TableHead className="sticky top-0 z-[60] bg-background shadow-sm">Fecha de venta</TableHead>
                <TableHead className="sticky top-0 z-[60] bg-background shadow-sm">Tipo</TableHead>
                <TableHead className="sticky top-0 z-[60] bg-background shadow-sm">DE</TableHead>
                <TableHead className="sticky top-0 z-[60] bg-background shadow-sm">Abono parcial</TableHead>
                <TableHead className="sticky top-0 z-[60] bg-background shadow-sm">Recup. disp.</TableHead>
                <TableHead className="sticky top-0 z-[60] bg-background shadow-sm">Capturar recup.</TableHead>
                <TableHead className="sticky top-0 z-[60] bg-background shadow-sm">Adel. saliente</TableHead>
                <TableHead className="sticky top-0 z-[60] bg-background shadow-sm">Capturar adel.</TableHead>
                <TableHead className="sticky top-0 z-[60] bg-background shadow-sm">S.E. disp.</TableHead>
                <TableHead className="sticky top-0 z-[60] bg-background shadow-sm">Capturar S.E.</TableHead>
                <TableHead className="sticky top-0 z-[60] bg-background shadow-sm">Total fila</TableHead>
                <TableHead className="sticky top-0 z-[60] bg-background text-right shadow-sm">Acciones</TableHead>
              </TableRow>
                </TableHeader>
                <TableBody>
              {sortedRows.length ? (
                sortedRows.map((row) => {
                  const markedFailed = failedSet.has(row.creditoId);
                  const hasAutoAdjustment = !isHistoricalMode && Boolean(autoAdjustedRows[row.creditoId]);
                  const rowClassName = markedFailed
                    ? 'bg-[#FEF2F2]'
                    : hasAutoAdjustment
                      ? 'bg-[#FFFBEB]'
                      : isHistoricalMode
                        ? 'bg-[#FAFAFA]'
                      : undefined;
                  const stickyCellBackground = markedFailed
                    ? 'bg-[#FEF2F2]'
                    : hasAutoAdjustment
                      ? 'bg-[#FFFBEB]'
                      : isHistoricalMode
                        ? 'bg-[#FAFAFA]'
                        : 'bg-background';
                  const historicalPassiveClass = isHistoricalMode ? 'opacity-80' : '';
                  const canMarkFailure = row.operationalScope !== 'active_with_extra_week' && row.collectibleAmount > 0;
                  const selectedRecovery = isHistoricalMode ? row.historicalRecoveryAmount : markedFailed ? 0 : getRecoveryValue(row.creditoId);
                  const selectedPartialFailure = isHistoricalMode ? (row.historicalFailureAmount > 0 ? row.historicalCurrentPaymentAmount : 0) : markedFailed ? getPartialFailureValue(row.creditoId) : 0;
                  const selectedAdvance = isHistoricalMode ? row.historicalAdvanceIncomingAmount : markedFailed ? 0 : getAdvanceValue(row.creditoId);
                  const selectedExtraWeek = isHistoricalMode ? row.historicalExtraWeekCollectedAmount : markedFailed ? 0 : getExtraWeekCaptureValue(row.creditoId);
                  const historicalBasePaid = row.historicalCurrentPaymentAmount + row.historicalExtraWeekCollectedAmount;
                  const previewBaseCollectible = markedFailed ? selectedPartialFailure : row.operationalScope === 'active_with_extra_week' ? 0 : row.collectibleAmount;
                  const rowTotal = isHistoricalMode
                    ? historicalBasePaid + selectedRecovery + selectedAdvance
                    : previewBaseCollectible + selectedRecovery + selectedAdvance + selectedExtraWeek;
                  const saleDateLabel = formatDisplayDate(row.creditStartDate) ?? 'Sin fecha';
                  const hasFailureBadge = isHistoricalMode ? row.historicalFailureAmount > 0 : markedFailed;
                  const hasNormalPaymentBadge = isHistoricalMode
                    ? historicalBasePaid > 0 && row.deAmount > 0
                    : !markedFailed && row.deAmount > 0 && row.operationalScope !== 'active_with_extra_week';
                  const hasRecoveryBadge = selectedRecovery > 0;
                  const hasIncomingAdvanceBadge = selectedAdvance > 0;
                  const hasOutgoingAdvanceBadge = row.outgoingAdvanceAmount > 0;
                  const hasExtraWeekBadge =
                    row.operationalScope === 'active_with_extra_week' || selectedExtraWeek > 0 || row.extraWeekAmount > 0;
                  const typeBadges: Array<{ label: string; className: string }> = [];
                  if (hasNormalPaymentBadge) {
                    typeBadges.push({ label: 'Pago normal', className: typeBadgeClassNames.pagoNormal });
                  }
                  if (row.rowMode === 'final_closure') {
                    typeBadges.push({ label: 'Cierre operativo', className: typeBadgeClassNames.cierreOperativo });
                  } else if (row.rowMode === 'recovery_only') {
                    typeBadges.push({ label: 'Recuperado final', className: typeBadgeClassNames.cierreOperativo });
                  } else if (row.rowMode === 'extra_week_only') {
                    typeBadges.push({ label: 'Fila semana 13', className: typeBadgeClassNames.cierreOperativo });
                  }
                  if (hasFailureBadge) {
                    typeBadges.push({ label: 'Falla', className: typeBadgeClassNames.falla });
                  }
                  if (hasRecoveryBadge) {
                    typeBadges.push({ label: 'Recuperado', className: typeBadgeClassNames.recuperado });
                  }
                  if (hasExtraWeekBadge) {
                    typeBadges.push({ label: 'Semana extra', className: typeBadgeClassNames.semanaExtra });
                  }
                  if (hasIncomingAdvanceBadge) {
                    typeBadges.push({ label: 'Adelanto entrante', className: typeBadgeClassNames.adelantoEntrante });
                  }
                  if (hasOutgoingAdvanceBadge) {
                    typeBadges.push({ label: 'Adelanto saliente', className: typeBadgeClassNames.adelantoSaliente });
                  }
                  if (hasAutoAdjustment) {
                    typeBadges.push({ label: 'Ajuste automático', className: typeBadgeClassNames.ajusteAutomatico });
                  }
                  return (
                    <TableRow key={row.creditoId} className={rowClassName}>
                      <TableCell className={`sticky left-0 z-30 ${stickyCellBackground}`} style={{ width: 64, minWidth: 64 }}>
                        <input
                          type="checkbox"
                          checked={markedFailed}
                          disabled={isSubmitting || isHistoricalMode || !canMarkFailure}
                          onChange={() => toggleFailure(row.creditoId)}
                        />
                      </TableCell>
                      <TableCell className={`sticky z-30 font-medium text-primary ${stickyCellBackground}`} style={{ left: 64, width: 88, minWidth: 88 }}>
                        {row.controlNumber ?? 'Sin control'}
                      </TableCell>
                      <TableCell className={`sticky z-30 ${stickyCellBackground}`} style={{ left: 152, width: 320, minWidth: 320 }}>
                        <div className="font-medium text-foreground">{row.clienteLabel}</div>
                        <div className="text-xs text-muted-foreground">{row.loanNumber} · {row.avalLabel ?? 'Sin aval'}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-foreground">{saleDateLabel}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {typeBadges.length ? (
                            typeBadges.map((badge) => (
                              <Badge
                                key={`${row.creditoId}-${badge.label}`}
                                variant="outline"
                                className={cn(badge.className, historicalPassiveClass)}
                              >
                                {badge.label}
                              </Badge>
                            ))
                          ) : (
                            <Badge
                              variant="outline"
                              className={cn(typeBadgeClassNames.pagoNormal, historicalPassiveClass)}
                            >
                              Pago normal
                            </Badge>
                          )}
                        </div>
                        {hasAutoAdjustment ? (
                          <div className="text-xs font-medium text-amber-700">
                            {autoAdjustedRows[row.creditoId]}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-medium">{formatCurrency(row.deAmount)}</TableCell>
                      <TableCell>
                        {isHistoricalMode ? (
                          formatCurrency(row.historicalFailureAmount > 0 ? row.historicalCurrentPaymentAmount : 0)
                        ) : (
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="0.01"
                            max={roundMoney(row.collectibleAmount) || undefined}
                            value={partialFailureAmounts[row.creditoId] ?? ''}
                            onChange={(event) => handlePartialFailureChange(row.creditoId, event.target.value)}
                            onWheel={blockWheelChange}
                            disabled={isSubmitting || isHistoricalMode || !markedFailed || row.collectibleAmount <= 0}
                            placeholder="0.00"
                            className={monetaryInputClassName}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <AmountPill
                          value={row.recoveryAmountAvailable}
                          className={cn(
                            row.recoveryAmountAvailable > 0 ? 'bg-[#FFFBEB] text-[#92400E]' : undefined,
                            historicalPassiveClass,
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.01"
                          max={roundMoney(row.recoveryAmountAvailable) || undefined}
                          value={recoveryAmounts[row.creditoId] ?? ''}
                          onChange={(event) => handleRecoveryChange(row.creditoId, event.target.value)}
                          onWheel={blockWheelChange}
                          disabled={isSubmitting || isHistoricalMode || markedFailed || row.recoveryAmountAvailable <= 0}
                          placeholder="0.00"
                          className={monetaryInputClassName}
                        />
                      </TableCell>
                      <TableCell>
                        <AmountPill
                          value={row.outgoingAdvanceAmount}
                          className={cn(
                            row.outgoingAdvanceAmount > 0 ? 'bg-[#F9FAFB] text-[#374151]' : undefined,
                            historicalPassiveClass,
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.01"
                          max={roundMoney(row.advanceAmountAvailable) || undefined}
                          value={advanceAmounts[row.creditoId] ?? ''}
                          onChange={(event) => handleAdvanceChange(row.creditoId, event.target.value)}
                          onWheel={blockWheelChange}
                          disabled={isSubmitting || isHistoricalMode || markedFailed}
                          placeholder="0.00"
                          className={monetaryInputClassName}
                        />
                      </TableCell>
                      <TableCell>
                        <AmountPill
                          value={row.extraWeekAmount}
                          className={cn(
                            row.extraWeekAmount > 0 ? 'bg-[#EFF6FF] text-[#1E3A8A]' : undefined,
                            historicalPassiveClass,
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        {isHistoricalMode ? (
                          formatCurrency(row.historicalExtraWeekCollectedAmount)
                        ) : (
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="0.01"
                            max={roundMoney(row.extraWeekAmount) || undefined}
                            value={extraWeekCaptureAmounts[row.creditoId] ?? ''}
                            onChange={(event) => handleExtraWeekCaptureChange(row.creditoId, event.target.value)}
                            onWheel={blockWheelChange}
                            disabled={isSubmitting || isHistoricalMode || markedFailed || row.extraWeekAmount <= 0}
                            placeholder="0.00"
                            className={monetaryInputClassName}
                          />
                        )}
                      </TableCell>
                      <TableCell className={markedFailed ? 'text-red-700' : 'font-medium'}>{formatCurrency(rowTotal)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/creditos/${row.creditoId}`}>Ver estado</Link>
                          </Button>
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/pagos/nuevo?creditoId=${row.creditoId}`}>Individual</Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={15} className="h-24 text-center text-muted-foreground">
                    Esta promotoría no tiene créditos listos para cobranza grupal en este momento.
                  </TableCell>
                </TableRow>
              )}
                </TableBody>
              </Table>
          </div>

          <div className="sticky bottom-4 z-30 flex justify-end">
            <div className="rounded-2xl border border-border/70 bg-background/95 p-2 shadow-lg backdrop-blur">
              <Button type="button" variant="accent" onClick={handleImpact} disabled={isSubmitting || !rows.length || isHistoricalMode} className="min-w-56">
                {isHistoricalMode ? 'Grupo histórico' : isSubmitting ? 'Procesando... Impactando pagos...' : 'Impactar pago'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Liquidación final de la promotora</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Total a entregar</Label>
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-lg font-semibold text-primary">
                {formatCurrency(totalToDeliver)}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="saleAmount">Venta</Label>
              <Input
                id="saleAmount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={saleAmount}
                onChange={(event) => setSaleAmount(event.target.value)}
                onWheel={blockWheelChange}
                placeholder="0.00"
                disabled={isSubmitting || isSavingLiquidation}
                className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bonusAmount">Bono / ajuste extra</Label>
              <Input
                id="bonusAmount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={bonusAmount}
                onChange={(event) => setBonusAmount(event.target.value)}
                onWheel={blockWheelChange}
                placeholder="0.00"
                disabled={isSubmitting || isSavingLiquidation}
                className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>
            <div className="space-y-2">
              <Label>Base de comisión</Label>
              <Select
                value={commissionBase}
                onChange={(event) => setCommissionBase(event.target.value as 'SALE' | 'TOTAL_TO_DELIVER')}
                disabled={isSubmitting || isSavingLiquidation}
              >
                <option value="SALE">Venta</option>
                <option value="TOTAL_TO_DELIVER">Total 1</option>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>% comisión</Label>
              <Select
                value={commissionRate}
                onChange={(event) => setCommissionRate(event.target.value as '10' | '12.5' | '15')}
                disabled={isSubmitting || isSavingLiquidation}
              >
                <option value="10">10%</option>
                <option value="12.5">12.5%</option>
                <option value="15">15%</option>
              </Select>
            </div>
            <MetricCard label="Base calculada" value={formatCurrency(commissionBaseAmount)} />
            <MetricCard label="Comisión" value={formatCurrency(commissionAmount)} />
            <MetricCard label="Bono / ajuste extra" value={formatCurrency(parsedBonusAmount)} />
            <MetricCard
              label={finalCashPrimaryLabel}
              value={formatCurrency(finalCashAmount)}
              tone={finalCashAmount < 0 ? 'danger' : 'success'}
            />
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
            <p className="text-sm text-muted-foreground">Interpretación</p>
            <p className={finalCashAmount < 0 ? 'text-lg font-semibold text-red-700' : 'text-lg font-semibold text-emerald-700'}>
              {finalCashLabel}
            </p>
            <div className="mt-4 max-w-xl space-y-2">
              <div>
                <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-1">
                  <p className="text-base font-medium text-foreground">Suma Inversión</p>
                  <p className="text-base font-semibold text-red-700">{formatCurrency(cumulativeInvestmentAmount)}</p>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-1">
                  <p className="text-base font-medium text-foreground">Suma Caja</p>
                  <p className="text-base font-semibold text-emerald-700">{formatCurrency(cumulativeCashAmount)}</p>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between gap-4 pt-1">
                  <p className="text-xl font-semibold text-foreground">Caja Final</p>
                  <p className={`text-xl font-semibold ${cumulativeFinalCashTone}`}>
                    {formatCurrency(cumulativeFinalCashAmount)}
                  </p>
                </div>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Fórmula semanal: Caja final = Total a entregar - Venta - Comisión - Bono / ajuste extra.
            </p>
          </div>

          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={handleSaveLiquidation} disabled={isSavingLiquidation}>
              {isSavingLiquidation
                ? 'Guardando liquidación...'
                : liquidation
                  ? 'Actualizar liquidación'
                  : 'Guardar liquidación'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'primary' | 'danger' | 'success';
}) {
  const contentClass =
    tone === 'danger'
      ? 'text-3xl font-semibold text-red-700'
      : tone === 'success'
        ? 'text-3xl font-semibold text-emerald-700'
        : tone === 'primary'
          ? 'text-3xl font-semibold text-primary'
          : 'text-3xl font-semibold text-foreground';
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className={contentClass}>
        {value}
      </CardContent>
    </Card>
  );
}

function AmountPill({ value, className }: { value: number; className?: string }) {
  const hasAccent = Boolean(className) && value > 0;
  return (
    <div
      className={cn(
        'inline-flex min-w-20 items-center justify-end rounded-md px-2 py-1 text-sm font-medium',
        hasAccent ? className : 'text-foreground',
      )}
    >
      {formatCurrency(value)}
    </div>
  );
}
