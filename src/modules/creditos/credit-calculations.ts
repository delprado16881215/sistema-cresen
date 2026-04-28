export type CreditPlanOption = {
  id: string;
  code: 'PLAN_12' | 'PLAN_15';
  label: string;
  weeks: number;
  weeklyFactor: number;
};

export function calculateWeeklyAmount(principalAmount: number, weeklyFactor: number): number {
  if (!Number.isFinite(principalAmount) || principalAmount <= 0) {
    return 0;
  }

  return Math.round(principalAmount * weeklyFactor * 100) / 100;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  }).format(value || 0);
}

export function getPlanLabel(plan: Pick<CreditPlanOption, 'weeks'>): string {
  return `${plan.weeks} semanas`;
}
