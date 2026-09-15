import type {
  CashFlowAnytimeItem,
  CashFlowItem,
  DebtPriorityItem,
  FinancialDetailItem,
  StepperConfig,
  SummaryCard
} from '../types/dashboard';

export const defaultStepperConfig: StepperConfig = {
  steps: [
    { id: 1, title: 'Income', status: 'active' },
    { id: 2, title: 'Housing', status: 'pending' },
    { id: 3, title: 'Loans', status: 'pending' },
    { id: 4, title: 'Credit Cards', status: 'pending' },
    { id: 5, title: 'Family & Friends', status: 'pending' },
    { id: 6, title: 'Travel', status: 'pending' },
    { id: 7, title: 'Misc', status: 'pending' },
    { id: 8, title: 'Review', status: 'pending' }
  ]
};

export const summaryCards: SummaryCard[] = [
  {
    title: 'Total Income',
    amount: '₹1,20,000',
    period: 'per month',
    tone: 'positive'
  },
  {
    title: 'Total Expenses',
    amount: '₹75,000',
    period: 'per month',
    tone: 'warning'
  },
  {
    title: 'Debt Payments',
    amount: '₹25,000',
    period: 'per month',
    tone: 'neutral'
  },
  {
    title: 'Money Left',
    amount: '₹20,000',
    period: 'per month',
    tone: 'positive'
  }
];

export const cashFlowItems: CashFlowItem[] = [
  { label: 'Salary Credit', date: 'Dec 1', amount: '+₹1,20,000', kind: 'in' },
  { label: 'Rent', date: 'Dec 4', amount: '-₹35,000', kind: 'out' },
  { label: 'HDFC Credit Card', date: 'Dec 8', amount: '-₹8,500', kind: 'out' },
  { label: 'Personal Loan', date: 'Dec 10', amount: '-₹12,000', kind: 'out' },
  { label: 'Electricity Bill', date: 'Dec 12', amount: '-₹2,000', kind: 'out' },
  { label: 'Internet', date: 'Dec 16', amount: '-₹1,000', kind: 'out' }
];

export const cashFlowAnytimeItems: CashFlowAnytimeItem[] = [
  { label: 'Dining Out', amount: '-₹4,000', kind: 'out' },
  { label: 'Health Insurance', amount: '-₹2,000', kind: 'out' },
  { label: 'Subscriptions (Netflix, Spotify, etc.)', amount: '-₹1,500', kind: 'out' },
  { label: 'Gifts & Miscellaneous', amount: '-₹3,000', kind: 'out' }
];

export const debtPriorityItems: DebtPriorityItem[] = [
  {
    label: 'HDFC Credit Card',
    due: 'Due in 11 days',
    apr: '36% APR',
    amount: '₹8,500',
    priority: 'Highest'
  },
  {
    label: 'Personal Loan',
    due: 'Due in 9 days',
    apr: '11% APR',
    amount: '₹12,000',
    priority: 'High'
  },
  {
    label: 'SBI Credit Card',
    due: 'Due in 18 days',
    apr: '28% APR',
    amount: '₹6,000',
    priority: 'Medium'
  },
  {
    label: 'ICICI Credit Card',
    due: 'Due in 24 days',
    apr: '24% APR',
    amount: '₹3,500',
    priority: 'Low'
  }
];

export const financialDetailItems: FinancialDetailItem[] = [
  {
    type: 'income',
    title: 'Income Sources (2)',
    amount: '₹1,20,000',
    period: '/ month'
  },
  {
    type: 'expenses',
    title: 'Monthly Expenses (8)',
    amount: '₹75,000',
    period: '/ month'
  },
  {
    type: 'loans',
    title: 'Loans (1)',
    amount: '₹12,000',
    period: '/ month'
  },
  {
    type: 'creditCards',
    title: 'Credit Cards (2)',
    amount: '₹14,500',
    period: '/ month'
  }
];
