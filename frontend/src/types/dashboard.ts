export type StepStatus = 'pending' | 'active' | 'completed';

export interface StepItem {
  id: number;
  title: string;
  status: StepStatus;
}

export interface StepperConfig {
  steps: StepItem[];
}

export type MetricTone = 'positive' | 'warning' | 'neutral';

export interface SummaryCard {
  title: string;
  amount: string;
  period: string;
  tone: MetricTone;
}

export interface CashFlowItem {
  label: string;
  date: string;
  amount: string;
  kind: 'in' | 'out';
}

export interface CashFlowAnytimeItem {
  label: string;
  amount: string;
  kind: 'in' | 'out';
}

export interface DebtPriorityItem {
  label: string;
  due: string;
  apr: string;
  amount: string;
  priority: 'Highest' | 'High' | 'Medium' | 'Low';
}

export interface ChatItem {
  id: string;
  at: string;
  text: string;
  senderRole: 'user' | 'agent';
  senderName: string;
}

export type FinancialDetailType = 'income' | 'expenses' | 'loans' | 'creditCards';

export interface FinancialDetailItem {
  type: FinancialDetailType;
  title: string;
  amount: string;
  period: string;
}
