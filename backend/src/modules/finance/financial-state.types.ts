import type { ObjectId } from 'mongodb';

export type StageName =
  | 'income'
  | 'housing'
  | 'loans'
  | 'credit_cards'
  | 'family_friends'
  | 'travel'
  | 'misc'
  | 'review';

export type Frequency = 'monthly' | 'weekly' | 'one_time';

export interface AmountRange {
  expectedMinor: number;
  minMinor?: number;
  maxMinor?: number;
  currency: 'INR';
}

export interface Timing {
  frequency: Frequency;
  dayOfMonth?: number;
  dayOfWeek?: number;
  date?: string;
  timezone: 'Asia/Kolkata';
}

export interface IncomeItem {
  id: string;
  name: string;
  amount: AmountRange;
  timing: Timing;
  sourceType?: 'salary' | 'business' | 'freelance' | 'support' | 'other';
  confidence: 'confirmed' | 'estimated' | 'unknown';
  notes?: string;
  updatedAt: string;
}

export interface ExpenseItem {
  id: string;
  name: string;
  amount: AmountRange;
  timing: Timing;
  category:
    | 'housing'
    | 'utilities'
    | 'food'
    | 'transport'
    | 'medical'
    | 'family_support'
    | 'travel'
    | 'misc';
  importance: 'critical' | 'high' | 'medium' | 'low';
  flexibility: 'fixed' | 'reducible' | 'optional';
  confidence: 'confirmed' | 'estimated' | 'unknown';
  notes?: string;
  updatedAt: string;
}

export interface LiabilityItem {
  id: string;
  type: 'loan' | 'credit_card' | 'family_friend';
  name: string;
  outstandingBalanceMinor: number;
  minimumPaymentMinor: number;
  timing: Timing;
  interestRateAnnualBps?: number;
  lateFeeMinor?: number;
  confidence: 'confirmed' | 'estimated' | 'unknown';
  notes?: string;
  updatedAt: string;
}

export interface ConversationState {
  introDone: boolean;
  status: 'active' | 'paused' | 'completed';
  currentStage: StageName;
  completedStages: StageName[];
  pendingFields: string[];
  lastQuestionId?: string;
  awaitingConsent: boolean;
  awaitingMoreItems: boolean;
  awaitingCapturedFactConfirmation: boolean;
  pendingFollowUpQuestion?: string;
  noneConfirmedStages: StageName[];
  recentMessages: {
    role: 'user' | 'assistant';
    text: string;
    at: string;
  }[];
}

export interface UnknownFieldMarker {
  id: string;
  field: string;
  stage: StageName;
  importance: 'high' | 'medium' | 'low';
  reason: string;
  createdAt: string;
}

export interface DebtPriorityItem {
  rank: number;
  liabilityId: string;
  name: string;
  type: LiabilityItem['type'];
  outstandingBalanceMinor: number;
  minimumPaymentMinor: number;
  interestRateAnnualBps?: number;
  strategy: 'minimum_first' | 'closure_first';
}

export interface FinancialResults {
  generatedAt: string;
  totals: {
    totalIncomingMinor: number;
    totalExpenseMinor: number;
    totalLiabilityMinimumMinor: number;
    totalOutgoingMinor: number;
    totalOutstandingMinor: number;
    netMinor: number;
    shortfallMinor: number;
    remainingMinor: number;
  };
  essentialsSplit: {
    essentialsMinor: number;
    reducibleMinor: number;
    optionalMinor: number;
  };
  cashflow30: {
    firstShortageDay: string | null;
    peakDeficitMinor: number;
    recoveryDay: string | null;
  };
  debtPrioritization: {
    minimumFirst: DebtPriorityItem[];
    closureFirst: DebtPriorityItem[];
  };
}

export interface FinancialStateDocument {
  _id: ObjectId;
  userName: string;
  userNameKey: string;
  baseCurrency: 'INR';
  amountUnit?: 'paise' | 'rupee';
  incomeItems: IncomeItem[];
  expenseItems: ExpenseItem[];
  liabilityItems: LiabilityItem[];
  unknowns: UnknownFieldMarker[];
  results?: FinancialResults;
  conversation: ConversationState;
  createdAt: Date;
  updatedAt: Date;
}

export interface FinancialStateEventDocument {
  _id: ObjectId;
  userNameKey: string;
  eventType: string;
  toolName: string;
  source: 'voice' | 'chat' | 'manual';
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface FinancialStateResponse {
  id: string;
  userName: string;
  userNameKey: string;
  baseCurrency: 'INR';
  amountUnit: 'paise' | 'rupee';
  incomeItems: IncomeItem[];
  expenseItems: ExpenseItem[];
  liabilityItems: LiabilityItem[];
  unknowns: UnknownFieldMarker[];
  results: FinancialResults;
  conversation: ConversationState;
  createdAt: string;
  updatedAt: string;
}

export interface ToolResult {
  ok: true;
  userNameKey: string;
  currentStage: StageName;
  pendingFields: string[];
}
