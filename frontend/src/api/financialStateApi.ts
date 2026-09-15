import type {
  CashFlowAnytimeItem,
  CashFlowItem,
  DashboardData,
  DebtPriorityItem,
  FinancialDetailItem,
  MetricTone,
  SummaryCard
} from '../types/dashboard';
import { getApiBaseUrl } from './apiBaseUrl';
import { httpJson } from './httpJson';

type Frequency = 'monthly' | 'weekly' | 'one_time';

interface Timing {
  frequency: Frequency;
  dayOfMonth?: number;
  dayOfWeek?: number;
  date?: string;
}

interface IncomeItem {
  id: string;
  name: string;
  amount: {
    expectedMinor: number;
  };
  timing: Timing;
}

interface ExpenseItem {
  id: string;
  name: string;
  amount: {
    expectedMinor: number;
  };
  timing: Timing;
  flexibility: 'fixed' | 'reducible' | 'optional';
  category: 'housing' | 'utilities' | 'food' | 'transport' | 'medical' | 'family_support' | 'travel' | 'misc';
}

interface LiabilityItem {
  id: string;
  name: string;
  type: 'loan' | 'credit_card' | 'family_friend';
  outstandingBalanceMinor: number;
  minimumPaymentMinor: number;
  interestRateAnnualBps?: number;
  timing: Timing;
}

interface FinancialResults {
  totals: {
    totalIncomingMinor: number;
    totalExpenseMinor: number;
    totalLiabilityMinimumMinor: number;
    totalOutgoingMinor: number;
    netMinor: number;
    shortfallMinor: number;
    remainingMinor: number;
  };
  debtPrioritization: {
    minimumFirst: Array<{
      rank: number;
      liabilityId: string;
      name: string;
      minimumPaymentMinor: number;
      outstandingBalanceMinor: number;
      interestRateAnnualBps?: number;
    }>;
  };
}

interface FinancialStatePayload {
  state: {
    incomeItems: IncomeItem[];
    expenseItems: ExpenseItem[];
    liabilityItems: LiabilityItem[];
    results: FinancialResults;
  };
}

export const emptyDashboardData: DashboardData = {
  statusPillText: 'No data available at the moment.',
  summaryCards: [],
  cashFlowItems: [],
  cashFlowAnytimeItems: [],
  debtPriorityItems: [],
  financialDetailItems: []
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toInr(amount: number) {
  const rounded = Math.round(Math.abs(amount));
  return `₹${rounded.toLocaleString('en-IN')}`;
}

function toSignedInr(amount: number) {
  const prefix = amount < 0 ? '-' : '+';
  return `${prefix}${toInr(amount)}`;
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

function hasSpecificDate(timing: Timing) {
  if (timing.frequency === 'monthly') {
    return typeof timing.dayOfMonth === 'number';
  }

  if (timing.frequency === 'weekly') {
    return typeof timing.dayOfWeek === 'number';
  }

  return Boolean(timing.date);
}

function formatDateLabel(timing: Timing) {
  if (timing.frequency === 'monthly' && typeof timing.dayOfMonth === 'number') {
    return `Day ${timing.dayOfMonth}`;
  }

  if (timing.frequency === 'weekly' && typeof timing.dayOfWeek === 'number') {
    return `Every ${WEEKDAY_LABELS[timing.dayOfWeek] || 'week'}`;
  }

  if (timing.frequency === 'one_time' && timing.date) {
    const date = new Date(`${timing.date}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  }

  return '--';
}

function timingSortKey(timing: Timing) {
  if (timing.frequency === 'monthly' && typeof timing.dayOfMonth === 'number') {
    return timing.dayOfMonth;
  }

  if (timing.frequency === 'one_time' && timing.date) {
    const date = new Date(`${timing.date}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      return date.getDate();
    }
  }

  if (timing.frequency === 'weekly' && typeof timing.dayOfWeek === 'number') {
    return 40 + timing.dayOfWeek;
  }

  return 99;
}

function priorityLabel(rank: number): DebtPriorityItem['priority'] {
  if (rank <= 1) {
    return 'Highest';
  }

  if (rank <= 2) {
    return 'High';
  }

  if (rank <= 4) {
    return 'Medium';
  }

  return 'Low';
}

function dueLabel(timing: Timing) {
  if (timing.frequency === 'monthly' && typeof timing.dayOfMonth === 'number') {
    return `Due every month on ${timing.dayOfMonth}`;
  }

  if (timing.frequency === 'weekly' && typeof timing.dayOfWeek === 'number') {
    return `Due every ${WEEKDAY_LABELS[timing.dayOfWeek] || 'week'}`;
  }

  if (timing.frequency === 'one_time' && timing.date) {
    const date = new Date(`${timing.date}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      return `Due ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
    }
  }

  return 'Due date not set';
}

function aprLabel(interestRateAnnualBps?: number) {
  if (!interestRateAnnualBps || interestRateAnnualBps <= 0) {
    return '-- APR';
  }

  const percent = (interestRateAnnualBps / 100).toFixed(1).replace(/\.0$/, '');
  return `${percent}% APR`;
}

function buildSummaryCards(results: FinancialResults): SummaryCard[] {
  const moneyLeftTone: MetricTone = results.totals.shortfallMinor > 0 ? 'warning' : 'positive';
  const moneyLeftAmount = results.totals.shortfallMinor > 0
    ? `-${toInr(results.totals.shortfallMinor)}`
    : toInr(results.totals.remainingMinor);

  return [
    {
      title: 'Total Income',
      amount: toInr(results.totals.totalIncomingMinor),
      period: 'per month',
      tone: 'positive'
    },
    {
      title: 'Total Expenses',
      amount: toInr(results.totals.totalExpenseMinor),
      period: 'per month',
      tone: 'warning'
    },
    {
      title: 'Debt Payments',
      amount: toInr(results.totals.totalLiabilityMinimumMinor),
      period: 'per month',
      tone: 'neutral'
    },
    {
      title: 'Money Left',
      amount: moneyLeftAmount,
      period: 'per month',
      tone: moneyLeftTone
    }
  ];
}

function buildCashflow(
  incomeItems: IncomeItem[],
  expenseItems: ExpenseItem[],
  liabilityItems: LiabilityItem[]
): { items: CashFlowItem[]; anytimeItems: CashFlowAnytimeItem[] } {
  const dated: Array<CashFlowItem & { sort: number }> = [];
  const anytime: CashFlowAnytimeItem[] = [];

  for (const item of incomeItems) {
    const entry: CashFlowAnytimeItem = {
      label: item.name,
      amount: toSignedInr(item.amount.expectedMinor),
      kind: 'in'
    };

    if (hasSpecificDate(item.timing)) {
      dated.push({
        ...entry,
        date: formatDateLabel(item.timing),
        sort: timingSortKey(item.timing)
      });
      continue;
    }

    anytime.push(entry);
  }

  for (const item of expenseItems) {
    const amountMinor = -item.amount.expectedMinor;
    const entry: CashFlowAnytimeItem = {
      label: item.name,
      amount: toSignedInr(amountMinor),
      kind: 'out'
    };

    if (hasSpecificDate(item.timing)) {
      dated.push({
        ...entry,
        date: formatDateLabel(item.timing),
        sort: timingSortKey(item.timing)
      });
      continue;
    }

    anytime.push(entry);
  }

  for (const item of liabilityItems) {
    const amountMinor = -item.minimumPaymentMinor;
    const entry: CashFlowAnytimeItem = {
      label: `${item.name} (min payment)`,
      amount: toSignedInr(amountMinor),
      kind: 'out'
    };

    if (hasSpecificDate(item.timing)) {
      dated.push({
        ...entry,
        date: formatDateLabel(item.timing),
        sort: timingSortKey(item.timing)
      });
      continue;
    }

    anytime.push(entry);
  }

  return {
    items: dated
      .sort((left, right) => left.sort - right.sort)
      .slice(0, 10)
      .map(({ sort, ...item }) => item),
    anytimeItems: anytime.slice(0, 10)
  };
}

function buildDebtPriorityItems(
  results: FinancialResults,
  liabilityItems: LiabilityItem[]
): DebtPriorityItem[] {
  const liabilitiesById = new Map<string, LiabilityItem>(liabilityItems.map((item) => [item.id, item]));

  return results.debtPrioritization.minimumFirst.slice(0, 8).map((item) => {
    const liability = liabilitiesById.get(item.liabilityId);

    return {
      label: item.name,
      due: liability ? dueLabel(liability.timing) : 'Due date not set',
      apr: aprLabel(item.interestRateAnnualBps),
      amount: toInr(item.minimumPaymentMinor),
      priority: priorityLabel(item.rank)
    };
  });
}

function sumLiabilityMinimum(liabilityItems: LiabilityItem[], type: LiabilityItem['type']) {
  return liabilityItems
    .filter((item) => item.type === type)
    .reduce((sum, item) => sum + toMonthlyEquivalentMinor(item.minimumPaymentMinor, item.timing), 0);
}

function buildFinancialDetails(
  incomeItems: IncomeItem[],
  expenseItems: ExpenseItem[],
  liabilityItems: LiabilityItem[],
  results: FinancialResults
): FinancialDetailItem[] {
  const loanCount = liabilityItems.filter((item) => item.type === 'loan').length;
  const cardCount = liabilityItems.filter((item) => item.type === 'credit_card').length;

  return [
    {
      type: 'income',
      title: `Income Sources (${incomeItems.length})`,
      amount: toInr(results.totals.totalIncomingMinor),
      period: '/ month'
    },
    {
      type: 'expenses',
      title: `Monthly Expenses (${expenseItems.length})`,
      amount: toInr(results.totals.totalExpenseMinor),
      period: '/ month'
    },
    {
      type: 'loans',
      title: `Loans (${loanCount})`,
      amount: toInr(sumLiabilityMinimum(liabilityItems, 'loan')),
      period: '/ month'
    },
    {
      type: 'creditCards',
      title: `Credit Cards (${cardCount})`,
      amount: toInr(sumLiabilityMinimum(liabilityItems, 'credit_card')),
      period: '/ month'
    }
  ];
}

function mapStateToDashboardData(payload: FinancialStatePayload): DashboardData {
  const state = payload.state;

  if (
    state.incomeItems.length === 0 &&
    state.expenseItems.length === 0 &&
    state.liabilityItems.length === 0
  ) {
    return emptyDashboardData;
  }

  const cashflow = buildCashflow(state.incomeItems, state.expenseItems, state.liabilityItems);

  return {
    statusPillText: state.results.totals.shortfallMinor > 0
      ? `Short by ${toInr(state.results.totals.shortfallMinor)} per month.`
      : `You have ${toInr(state.results.totals.remainingMinor)} left per month.`,
    summaryCards: buildSummaryCards(state.results),
    cashFlowItems: cashflow.items,
    cashFlowAnytimeItems: cashflow.anytimeItems,
    debtPriorityItems: buildDebtPriorityItems(state.results, state.liabilityItems),
    financialDetailItems: buildFinancialDetails(
      state.incomeItems,
      state.expenseItems,
      state.liabilityItems,
      state.results
    )
  };
}

function isFinancialStatePayload(payload: unknown): payload is FinancialStatePayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const value = payload as { state?: unknown };

  if (!value.state || typeof value.state !== 'object') {
    return false;
  }

  const state = value.state as {
    incomeItems?: unknown;
    expenseItems?: unknown;
    liabilityItems?: unknown;
    results?: unknown;
  };

  return (
    Array.isArray(state.incomeItems) &&
    Array.isArray(state.expenseItems) &&
    Array.isArray(state.liabilityItems) &&
    Boolean(state.results && typeof state.results === 'object')
  );
}

export async function fetchDashboardData(userName?: string): Promise<DashboardData> {
  try {
    const query = new URLSearchParams();

    if (userName && userName.trim()) {
      query.set('userName', userName.trim());
    }

    const queryString = query.toString();
    const url = `${getApiBaseUrl()}/api/financial-state${queryString ? `?${queryString}` : ''}`;

    const payload = await httpJson<unknown>(url, undefined, {
      fallbackError: 'Unable to load financial dashboard'
    });

    if (!isFinancialStatePayload(payload)) {
      return emptyDashboardData;
    }

    return mapStateToDashboardData(payload);
  } catch {
    return emptyDashboardData;
  }
}
