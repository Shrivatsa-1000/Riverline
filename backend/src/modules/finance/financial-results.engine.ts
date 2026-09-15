import type {
  ExpenseItem,
  FinancialResults,
  FinancialStateResponse,
  IncomeItem,
  LiabilityItem,
  Timing
} from './financial-state.types';

function toIsoNow() {
  return new Date().toISOString();
}

function toIsoDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function cloneDate(date: Date) {
  return new Date(date.getTime());
}

function addDays(date: Date, days: number) {
  const next = cloneDate(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function sameDay(left: Date, right: Date) {
  return left.getUTCFullYear() === right.getUTCFullYear()
    && left.getUTCMonth() === right.getUTCMonth()
    && left.getUTCDate() === right.getUTCDate();
}

function occursOnDate(timing: Timing, date: Date) {
  if (timing.frequency === 'monthly') {
    if (!timing.dayOfMonth) {
      return false;
    }

    return timing.dayOfMonth === date.getUTCDate();
  }

  if (timing.frequency === 'weekly') {
    if (typeof timing.dayOfWeek !== 'number') {
      return false;
    }

    return timing.dayOfWeek === date.getUTCDay();
  }

  if (timing.frequency === 'one_time') {
    if (!timing.date) {
      return false;
    }

    return timing.date === toIsoDateKey(date);
  }

  return false;
}

function toMonthlyEquivalentMinor(amountMinor: number, timing: Timing) {
  if (timing.frequency === 'monthly') {
    return amountMinor;
  }

  if (timing.frequency === 'weekly') {
    return Math.round((amountMinor * 52) / 12);
  }

  return amountMinor;
}

function computeEssentialsSplit(expenseItems: ExpenseItem[]) {
  let essentialsMinor = 0;
  let reducibleMinor = 0;
  let optionalMinor = 0;

  for (const item of expenseItems) {
    const amountMinor = toMonthlyEquivalentMinor(item.amount.expectedMinor, item.timing);

    if (item.flexibility === 'fixed') {
      essentialsMinor += amountMinor;
      continue;
    }

    if (item.flexibility === 'reducible') {
      reducibleMinor += amountMinor;
      continue;
    }

    optionalMinor += amountMinor;
  }

  return {
    essentialsMinor,
    reducibleMinor,
    optionalMinor
  };
}

function computeTotals(incomeItems: IncomeItem[], expenseItems: ExpenseItem[], liabilityItems: LiabilityItem[]) {
  const totalIncomingMinor = incomeItems.reduce(
    (sum, item) => sum + toMonthlyEquivalentMinor(item.amount.expectedMinor, item.timing),
    0
  );

  const totalExpenseMinor = expenseItems.reduce(
    (sum, item) => sum + toMonthlyEquivalentMinor(item.amount.expectedMinor, item.timing),
    0
  );

  const totalLiabilityMinimumMinor = liabilityItems.reduce(
    (sum, item) => sum + toMonthlyEquivalentMinor(item.minimumPaymentMinor, item.timing),
    0
  );

  const totalOutstandingMinor = liabilityItems.reduce((sum, item) => sum + item.outstandingBalanceMinor, 0);
  const totalOutgoingMinor = totalExpenseMinor + totalLiabilityMinimumMinor;
  const netMinor = totalIncomingMinor - totalOutgoingMinor;

  return {
    totalIncomingMinor,
    totalExpenseMinor,
    totalLiabilityMinimumMinor,
    totalOutgoingMinor,
    totalOutstandingMinor,
    netMinor,
    shortfallMinor: netMinor < 0 ? Math.abs(netMinor) : 0,
    remainingMinor: netMinor > 0 ? netMinor : 0
  };
}

function computeCashflow30Summary(incomeItems: IncomeItem[], expenseItems: ExpenseItem[], liabilityItems: LiabilityItem[]) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);

  let runningBalance = 0;
  let firstShortageDay: string | null = null;
  let peakDeficitMinor = 0;
  let recoveryDay: string | null = null;

  for (let dayIndex = 0; dayIndex < 30; dayIndex += 1) {
    const currentDate = addDays(start, dayIndex);
    let inflowMinor = 0;
    let outflowMinor = 0;

    for (const item of incomeItems) {
      if (occursOnDate(item.timing, currentDate)) {
        inflowMinor += item.amount.expectedMinor;
      }
    }

    for (const item of expenseItems) {
      if (occursOnDate(item.timing, currentDate)) {
        outflowMinor += item.amount.expectedMinor;
      }
    }

    for (const item of liabilityItems) {
      if (occursOnDate(item.timing, currentDate)) {
        outflowMinor += item.minimumPaymentMinor;
      }
    }

    const closingMinor = runningBalance + inflowMinor - outflowMinor;

    if (closingMinor < 0 && firstShortageDay === null) {
      firstShortageDay = toIsoDateKey(currentDate);
    }

    if (closingMinor < peakDeficitMinor) {
      peakDeficitMinor = closingMinor;
    }

    if (firstShortageDay && recoveryDay === null && closingMinor >= 0) {
      recoveryDay = toIsoDateKey(currentDate);
    }

    runningBalance = closingMinor;
  }

  const shortageDate = firstShortageDay ? new Date(`${firstShortageDay}T00:00:00.000Z`) : null;
  const computedRecovery = recoveryDay ? new Date(`${recoveryDay}T00:00:00.000Z`) : null;

  return {
    firstShortageDay,
    peakDeficitMinor,
    recoveryDay: shortageDate && computedRecovery && sameDay(shortageDate, computedRecovery) ? null : recoveryDay
  };
}

function computeDebtPrioritization(liabilityItems: LiabilityItem[]): FinancialResults['debtPrioritization'] {
  const activeItems = liabilityItems.filter(
    (item) => item.outstandingBalanceMinor > 0 || item.minimumPaymentMinor > 0
  );

  const toPriorityItem = (
    item: LiabilityItem,
    index: number,
    strategy: 'minimum_first' | 'closure_first'
  ) => ({
    rank: index + 1,
    liabilityId: item.id,
    name: item.name,
    type: item.type,
    outstandingBalanceMinor: item.outstandingBalanceMinor,
    minimumPaymentMinor: item.minimumPaymentMinor,
    interestRateAnnualBps: item.interestRateAnnualBps,
    strategy
  });

  const minimumFirst = [...activeItems]
    .sort((left, right) => {
      if (left.minimumPaymentMinor !== right.minimumPaymentMinor) {
        return left.minimumPaymentMinor - right.minimumPaymentMinor;
      }

      return left.outstandingBalanceMinor - right.outstandingBalanceMinor;
    })
    .map((item, index) => toPriorityItem(item, index, 'minimum_first'));

  const closureFirst = [...activeItems]
    .sort((left, right) => {
      if (left.outstandingBalanceMinor !== right.outstandingBalanceMinor) {
        return left.outstandingBalanceMinor - right.outstandingBalanceMinor;
      }

      return left.minimumPaymentMinor - right.minimumPaymentMinor;
    })
    .map((item, index) => toPriorityItem(item, index, 'closure_first'));

  return {
    minimumFirst,
    closureFirst
  };
}

export function buildFinancialResults(
  state: Pick<FinancialStateResponse, 'incomeItems' | 'expenseItems' | 'liabilityItems'>
): FinancialResults {
  const totals = computeTotals(state.incomeItems, state.expenseItems, state.liabilityItems);
  const essentialsSplit = computeEssentialsSplit(state.expenseItems);
  const cashflow30 = computeCashflow30Summary(state.incomeItems, state.expenseItems, state.liabilityItems);
  const debtPrioritization = computeDebtPrioritization(state.liabilityItems);

  return {
    generatedAt: toIsoNow(),
    totals,
    essentialsSplit,
    cashflow30,
    debtPrioritization
  };
}
