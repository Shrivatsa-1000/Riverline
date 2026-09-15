import { FinancialStateRepository } from './financial-state.repository';
import { FinancialToolsService } from './financial-tools.service';
import {
  getAnythingElsePrompt,
  getStagePrompt,
  getStageTitle,
  moveToNextStage,
  recomputeConversation
} from './intake-stage.engine';
import type { OpenAiAgentService } from '../agent/openai-agent.service';
import type {
  ExpenseItem,
  FinancialStateResponse,
  LiabilityItem,
  StageName
} from './financial-state.types';

interface OpenConversationResult {
  replyText: string;
  state: FinancialStateResponse;
}

interface HandleTurnInput {
  userName: string;
  message: string;
  source: 'voice' | 'chat' | 'manual';
}

interface HandleTurnResult {
  replyText: string;
  state: FinancialStateResponse;
}

interface AgentStateContextItem {
  id: string;
  name: string;
  stage: StageName;
  category?: ExpenseItem['category'];
  liabilityType?: LiabilityItem['type'];
  expectedMajor?: number;
  outstandingMajor?: number;
  minimumPaymentMajor?: number;
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeKey(value: string) {
  return normalizeText(value).toLowerCase();
}

function parseNumbers(text: string) {
  const matches = [...text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|lakh|lac|crore)?/gi)];

  return matches
    .map((match) => {
      const rawValue = Number((match[1] || '').replace(/,/g, ''));

      if (!Number.isFinite(rawValue) || rawValue <= 0) {
        return null;
      }

      const suffix = (match[2] || '').toLowerCase();
      const multiplier = suffix === 'k' || suffix === 'thousand'
        ? 1_000
        : suffix === 'lakh' || suffix === 'lac'
          ? 100_000
          : suffix === 'crore'
            ? 10_000_000
            : 1;

      return Math.round(rawValue * multiplier);
    })
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

function isYes(text: string) {
  const value = normalizeKey(text);
  if (/\b(yes|yeah|yep|sure|ready|start|continue|go ahead|ok|okay|correct|right|exactly)\b/.test(value)) {
    return true;
  }

  return value.includes("that's correct")
    || value.includes('thats correct')
    || value.includes('yes yes');
}

function isNo(text: string) {
  const value = normalizeKey(text);
  return /\b(no|nope|not now|pause|later|stop|none|nothing else|nothing more|no more|that is all|that's all|thats all|that's it|thats it|all good|we are good|we're good|done|done here|good now)\b/.test(value);
}


function hasFinancialFact(text: string) {
  if (parseNumbers(text).length > 0) {
    return true;
  }

  const value = normalizeKey(text);
  return /\b(salary|income|rent|loan|emi|card|credit|family|friend|travel|fuel|bill|expense|owned|rented|repay|maintenance|internet|electricity|water|subscription|shopping|medical|food|grocery)\b/.test(value);
}

function isOutOfScope(text: string) {
  const value = normalizeKey(text);

  if (!value) {
    return false;
  }

  const nonFinanceSignal = /\b(weather|movie|sports|cricket|football|recipe|coding|programming|politics)\b/.test(value);
  const financeSignal = hasFinancialFact(value) || isYes(value) || isNo(value);

  return nonFinanceSignal && !financeSignal;
}

function isDeleteIntent(text: string) {
  const value = normalizeKey(text);
  return /\b(delete|remove|drop|clear)\b/.test(value);
}

function isSummaryIntent(text: string) {
  const value = normalizeKey(text);
  return /\b(summary|summarize|overall|totals|all payments|cash flow|quick summary)\b/.test(value);
}

function isShortfallHelpIntent(text: string) {
  const value = normalizeKey(text);
  return /\b(shortfall|deficit|how can i remove|how to remove|how to reduce|reduce this|fix this)\b/.test(value);
}

function isPrioritizationIntent(text: string) {
  const value = normalizeKey(text);

  const hasAction = /\b(priority|prioritise|prioritize|order|which|whom|pay first|return first|debt first|who first|sequence)\b/.test(value);
  const hasDebtContext = /\b(debt|loan|loans|emi|credit card|credit cards|card due|card dues|liability|repay|repayment|debit and credit|debt and credit)\b/.test(value);

  return hasAction && hasDebtContext;
}

function isIncomeGrowthAdviceIntent(text: string) {
  const value = normalizeKey(text);
  return /\b(make more money|earn more|increase income|side income|side hustle|new job|job switch|business idea|how do i earn)\b/.test(value);
}

function scoreItemMatch(message: string, itemName: string, itemNotes?: string) {
  const messageKey = normalizeKey(message);
  const itemKey = normalizeKey(`${itemName} ${itemNotes || ''}`);

  let score = 0;

  if (messageKey.includes(normalizeKey(itemName))) {
    score += 5;
  }

  const messageTokens = new Set(
    messageKey
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 2)
  );

  const itemTokens = itemKey
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);

  for (const token of itemTokens) {
    if (messageTokens.has(token)) {
      score += 1;
    }
  }

  return score;
}

function matchesAmountInMessage(message: string, value: number) {
  const numbers = parseNumbers(message);

  if (numbers.length === 0) {
    return true;
  }

  return numbers.some((amount) => amount === Math.round(Math.abs(value)));
}

function defaultExpenseCategoryForStage(stage: StageName): ExpenseItem['category'] {
  if (stage === 'housing') {
    return 'housing';
  }

  if (stage === 'travel') {
    return 'travel';
  }

  return 'misc';
}

function defaultExpenseFlexibility(category: ExpenseItem['category']): ExpenseItem['flexibility'] {
  return category === 'housing' ? 'fixed' : category === 'misc' ? 'optional' : 'reducible';
}

function defaultExpenseImportance(category: ExpenseItem['category']): ExpenseItem['importance'] {
  return category === 'housing' ? 'critical' : category === 'utilities' ? 'high' : category === 'misc' ? 'low' : 'medium';
}

interface SegmentFact {
  stage: StageName;
  text: string;
  targetItemId?: string;
  itemName?: string;
  amountMajor?: number;
  outstandingMajor?: number;
  minimumPaymentMajor?: number;
  timingText?: string;
  expenseCategory?: ExpenseItem['category'];
  liabilityType?: LiabilityItem['type'];
}

interface CaptureSummary {
  state: FinancialStateResponse;
  stage: StageName;
  preview: string;
}

interface DeleteTarget {
  type: 'income' | 'expense' | 'liability';
  id: string;
  name: string;
}

interface AgentExtractionResult {
  intent: 'facts' | 'none_for_stage' | 'finish_stage' | 'unknown' | 'out_of_scope';
  noneStage: StageName | null;
  facts: SegmentFact[];
}

const STAGE_VALUES: StageName[] = [
  'income',
  'housing',
  'loans',
  'credit_cards',
  'family_friends',
  'travel',
  'misc',
  'review'
];

const EXPENSE_CATEGORY_VALUES: ExpenseItem['category'][] = [
  'housing',
  'utilities',
  'food',
  'transport',
  'medical',
  'family_support',
  'travel',
  'misc'
];

const LIABILITY_TYPE_VALUES: LiabilityItem['type'][] = ['loan', 'credit_card', 'family_friend'];

const OUT_OF_SCOPE_REPLY =
  'I am not fully sure about that area. I can help with your financial intake, edits, and factual budget analysis.';

const CONFIRM_YES_NO_REPLY = 'Please confirm with yes or no. You can also directly say the correction.';

const REVIEW_ANYTHING_ELSE_REPLY = 'Great. Anything else you want to add or edit?';

const DELETE_NEEDS_DETAILS_REPLY = 'I can delete it. Please share the exact item name and amount so I remove the right record.';

function formatMinorInr(amountMinor: number) {
  const absolute = Math.abs(Math.round(amountMinor));
  return `₹${absolute.toLocaleString('en-IN')}`;
}

function toStageName(value: unknown): StageName | null {
  if (typeof value !== 'string') {
    return null;
  }

  return STAGE_VALUES.includes(value as StageName) ? (value as StageName) : null;
}

function toExpenseCategory(value: unknown): ExpenseItem['category'] | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  return EXPENSE_CATEGORY_VALUES.includes(value as ExpenseItem['category'])
    ? (value as ExpenseItem['category'])
    : undefined;
}

function toLiabilityType(value: unknown): LiabilityItem['type'] | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  return LIABILITY_TYPE_VALUES.includes(value as LiabilityItem['type'])
    ? (value as LiabilityItem['type'])
    : undefined;
}

function parseJsonFromAgentText(rawText: string): unknown {
  const trimmed = rawText.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return null;
    }

    try {
      return JSON.parse(jsonMatch[0]) as unknown;
    } catch {
      return null;
    }
  }
}

function stageToLiabilityType(stage: StageName) {
  if (stage === 'loans') {
    return 'loan' as const;
  }

  if (stage === 'credit_cards') {
    return 'credit_card' as const;
  }

  return 'family_friend' as const;
}

function stageFromLiabilityType(type: LiabilityItem['type']): StageName {
  if (type === 'loan') {
    return 'loans';
  }

  if (type === 'credit_card') {
    return 'credit_cards';
  }

  return 'family_friends';
}

function stageFromExpenseCategory(category: ExpenseItem['category']): StageName {
  if (category === 'housing' || category === 'utilities') {
    return 'housing';
  }

  if (category === 'travel' || category === 'transport') {
    return 'travel';
  }

  return 'misc';
}

function inferStageFromText(text: string): StageName {
  const value = normalizeKey(text);

  if (/\b(salary|income|earning|earn|business|freelance)\b/.test(value)) {
    return 'income';
  }

  if (/\b(rent|house|housing|maintenance|electricity|internet|water|gas|utility|utilities)\b/.test(value)) {
    return 'housing';
  }

  if (/\b(loan|emi|installment)\b/.test(value)) {
    return 'loans';
  }

  if (/\b(credit card|card due|minimum due|card bill)\b/.test(value)) {
    return 'credit_cards';
  }

  if (/\b(family|friend|borrowed|support|repay)\b/.test(value)) {
    return 'family_friends';
  }

  if (/\b(travel|fuel|petrol|diesel|bus|train|flight|cab|taxi|parking|toll|commute)\b/.test(value)) {
    return 'travel';
  }

  return 'misc';
}

function resolveStageForFact(input: {
  currentStage: StageName;
  extractedStage: StageName | null;
  targetItemId?: string;
  text: string;
  expenseCategory?: ExpenseItem['category'];
  liabilityType?: LiabilityItem['type'];
  state: FinancialStateResponse;
}): StageName {
  if (input.extractedStage && input.extractedStage !== 'review') {
    return input.extractedStage;
  }

  const targetItemId = input.targetItemId;

  if (targetItemId) {
    const incomeItem = input.state.incomeItems.find((item) => item.id === targetItemId);
    if (incomeItem) {
      return 'income';
    }

    const expenseItem = input.state.expenseItems.find((item) => item.id === targetItemId);
    if (expenseItem) {
      return stageFromExpenseCategory(expenseItem.category);
    }

    const liabilityItem = input.state.liabilityItems.find((item) => item.id === targetItemId);
    if (liabilityItem) {
      return stageFromLiabilityType(liabilityItem.type);
    }
  }

  if (input.liabilityType) {
    return stageFromLiabilityType(input.liabilityType);
  }

  if (input.expenseCategory) {
    return stageFromExpenseCategory(input.expenseCategory);
  }

  if (input.currentStage !== 'review') {
    return input.currentStage;
  }

  return inferStageFromText(input.text);
}

function buildClarificationPrompt(stage: StageName, attempt: number) {
  const first = `I may have missed that. Please share one ${getStageTitle(stage)} item with amount and timing if possible.`;
  const second = `Could you give just one clear ${getStageTitle(stage)} entry, for example name plus amount?`;

  return attempt <= 1 ? first : second;
}

function buildMissingAmountPrompt(stage: StageName) {
  return `Got it. Please share the amount for that ${getStageTitle(stage)} item so I can save it.`;
}

function toPositiveNumber(value: unknown) {
  const numericValue = typeof value === 'number'
    ? value
    : typeof value === 'string' && Number.isFinite(Number(value))
      ? Number(value)
      : undefined;

  if (!numericValue || !Number.isFinite(numericValue) || numericValue <= 0) {
    return undefined;
  }

  return numericValue;
}

function factHasAmountSignal(fact: SegmentFact) {
  if ((fact.amountMajor ?? 0) > 0 || (fact.outstandingMajor ?? 0) > 0 || (fact.minimumPaymentMajor ?? 0) > 0) {
    return true;
  }

  return parseNumbers(fact.text).length > 0;
}

function buildDeterministicReviewSummary(state: FinancialStateResponse) {
  const totals = state.results.totals;
  const essentials = state.results.essentialsSplit;
  const cashflow = state.results.cashflow30;

  const minimumFirstTop = state.results.debtPrioritization.minimumFirst
    .slice(0, 3)
    .map((item) => `${item.rank}) ${item.name} ${formatMinorInr(item.minimumPaymentMinor)} min`)
    .join(', ');

  return [
    `Here is your factual summary. Income is ${formatMinorInr(totals.totalIncomingMinor)} and total outgoing is ${formatMinorInr(totals.totalOutgoingMinor)}.`,
    `Expenses are ${formatMinorInr(totals.totalExpenseMinor)} and liability minimums are ${formatMinorInr(totals.totalLiabilityMinimumMinor)}.`,
    `Net is ${formatMinorInr(totals.netMinor)} with shortfall ${formatMinorInr(totals.shortfallMinor)} and remaining ${formatMinorInr(totals.remainingMinor)}.`,
    `Essentials ${formatMinorInr(essentials.essentialsMinor)}, reducible ${formatMinorInr(essentials.reducibleMinor)}, optional ${formatMinorInr(essentials.optionalMinor)}.`,
    cashflow.firstShortageDay ? `First shortage day is ${cashflow.firstShortageDay}.` : 'No shortage day in 30 days.',
    `Minimum-first payment order: ${minimumFirstTop || 'no active liabilities'}.`
  ].join(' ');
}

function buildDebtPriorityResponse(state: FinancialStateResponse) {
  const minimumFirst = state.results.debtPrioritization.minimumFirst;
  const closureFirst = state.results.debtPrioritization.closureFirst;

  if (minimumFirst.length === 0) {
    return 'You have no active loans or credit card dues right now, so there is no payment priority list.';
  }

  const minimumTop = minimumFirst
    .slice(0, 5)
    .map((item) => `${item.rank}) ${item.name} — min ${formatMinorInr(item.minimumPaymentMinor)}`)
    .join(', ');

  const closureTop = closureFirst
    .slice(0, 5)
    .map((item) => `${item.rank}) ${item.name} — outstanding ${formatMinorInr(item.outstandingBalanceMinor)}`)
    .join(', ');

  return [
    `For minimum-payment-first, the order is: ${minimumTop}.`,
    `For quickest-closure-first, the order is: ${closureTop}.`,
    'Tell me which method you want to follow, and I can keep future edits aligned to that order.'
  ].join(' ');
}

function sanitizeStoredItems(state: FinancialStateResponse) {
  const validIncome = state.incomeItems.filter((item) => item.amount.expectedMinor > 0);
  const validExpenses = state.expenseItems.filter((item) => item.amount.expectedMinor > 0);
  const validLiabilities = state.liabilityItems;

  const changed = validIncome.length !== state.incomeItems.length
    || validExpenses.length !== state.expenseItems.length
    || validLiabilities.length !== state.liabilityItems.length;

  if (!changed) {
    return false;
  }

  state.incomeItems = validIncome;
  state.expenseItems = validExpenses;
  state.liabilityItems = validLiabilities;

  return true;
}

function buildAgentStateContext(state: FinancialStateResponse): AgentStateContextItem[] {
  const incomeItems: AgentStateContextItem[] = state.incomeItems.map((item) => ({
    id: item.id,
    name: item.name,
    stage: 'income',
    expectedMajor: Math.round(item.amount.expectedMinor)
  }));

  const expenseItems: AgentStateContextItem[] = state.expenseItems.map((item) => ({
    id: item.id,
    name: item.name,
    stage: item.category === 'housing' || item.category === 'utilities'
      ? 'housing'
      : item.category === 'travel' || item.category === 'transport'
        ? 'travel'
        : 'misc',
    category: item.category,
    expectedMajor: Math.round(item.amount.expectedMinor)
  }));

  const liabilityItems: AgentStateContextItem[] = state.liabilityItems.map((item) => ({
    id: item.id,
    name: item.name,
    stage: item.type === 'loan' ? 'loans' : item.type === 'credit_card' ? 'credit_cards' : 'family_friends',
    liabilityType: item.type,
    outstandingMajor: Math.round(item.outstandingBalanceMinor),
    minimumPaymentMajor: Math.round(item.minimumPaymentMinor)
  }));

  return [...incomeItems, ...expenseItems, ...liabilityItems];
}

const RECENT_CONTEXT_MESSAGES_LIMIT = 4;
const RECENT_CONTEXT_TEXT_LIMIT = 220;

function compactContextText(text: string) {
  const compact = normalizeText(text);

  if (compact.length <= RECENT_CONTEXT_TEXT_LIMIT) {
    return compact;
  }

  return `${compact.slice(0, RECENT_CONTEXT_TEXT_LIMIT - 1)}…`;
}

export class FinancialIntakeService {
  constructor(
    private readonly repository: FinancialStateRepository,
    private readonly tools: FinancialToolsService,
    private readonly openAiAgentService: OpenAiAgentService
  ) {}

  private ensureRecentMessages(state: FinancialStateResponse) {
    if (!Array.isArray(state.conversation.recentMessages)) {
      state.conversation.recentMessages = [];
      return true;
    }

    return false;
  }

  private appendRecentMessages(
    state: FinancialStateResponse,
    entries: Array<{ role: 'user' | 'assistant'; text: string }>
  ) {
    const normalizedEntries = entries
      .map((entry) => ({
        role: entry.role,
        text: compactContextText(entry.text),
        at: new Date().toISOString()
      }))
      .filter((entry) => entry.text.length > 0);

    if (normalizedEntries.length === 0) {
      return;
    }

    const merged = [...state.conversation.recentMessages, ...normalizedEntries];
    state.conversation.recentMessages = merged.slice(-RECENT_CONTEXT_MESSAGES_LIMIT);
  }

  private getRecentConversationContext(state: FinancialStateResponse) {
    if (!Array.isArray(state.conversation.recentMessages)) {
      return [];
    }

    return state.conversation.recentMessages.slice(-RECENT_CONTEXT_MESSAGES_LIMIT);
  }

  private buildFallbackFactsFromMessage(
    state: FinancialStateResponse,
    currentStage: StageName,
    message: string
  ): SegmentFact[] {
    if (!hasFinancialFact(message)) {
      return [];
    }

    const numbers = parseNumbers(message).filter((value) => value > 0);

    if (numbers.length === 0) {
      return [];
    }

    const stage = resolveStageForFact({
      currentStage,
      extractedStage: null,
      text: message,
      state
    });

    const amount = numbers[0];
    const liabilityType = stage === 'loans' || stage === 'credit_cards' || stage === 'family_friends'
      ? stageToLiabilityType(stage)
      : undefined;

    const minimumPaymentMajor = liabilityType === 'credit_card'
      ? (numbers[1] ?? amount)
      : liabilityType === 'loan' || liabilityType === 'family_friend'
        ? amount
        : undefined;

    return [
      {
        stage,
        text: message,
        amountMajor: amount,
        outstandingMajor: liabilityType ? amount : undefined,
        minimumPaymentMajor,
        expenseCategory: stage === 'housing' || stage === 'travel' || stage === 'misc'
          ? defaultExpenseCategoryForStage(stage)
          : undefined,
        liabilityType
      }
    ];
  }

  private findDeleteTargets(state: FinancialStateResponse, message: string) {
    const value = normalizeKey(message);
    const mentionsIncome = /\b(income|salary|earning|earnings)\b/.test(value);
    const mentionsLiability = /\b(loan|emi|credit|card|friend|family|repay|liability)\b/.test(value);
    const mentionsExpense = /\b(expense|bill|rent|internet|electricity|gas|travel|shopping|subscription|misc)\b/.test(value);

    const typeLock = mentionsIncome
      ? 'income'
      : mentionsLiability
        ? 'liability'
        : mentionsExpense
          ? 'expense'
          : null;

    const scored: Array<DeleteTarget & { score: number }> = [];

    if (!typeLock || typeLock === 'income') {
      for (const item of state.incomeItems) {
        if (!matchesAmountInMessage(message, item.amount.expectedMinor)) {
          continue;
        }

        const score = scoreItemMatch(message, item.name, item.notes);
        if (score > 0) {
          scored.push({ type: 'income', id: item.id, name: item.name, score });
        }
      }
    }

    if (!typeLock || typeLock === 'expense') {
      for (const item of state.expenseItems) {
        if (!matchesAmountInMessage(message, item.amount.expectedMinor)) {
          continue;
        }

        const score = scoreItemMatch(message, item.name, item.notes);
        if (score > 0) {
          scored.push({ type: 'expense', id: item.id, name: item.name, score });
        }
      }
    }

    if (!typeLock || typeLock === 'liability') {
      for (const item of state.liabilityItems) {
        const amountMatched = matchesAmountInMessage(message, item.outstandingBalanceMinor)
          || matchesAmountInMessage(message, item.minimumPaymentMinor);

        if (!amountMatched) {
          continue;
        }

        const score = scoreItemMatch(message, item.name, item.notes);
        if (score > 0) {
          scored.push({ type: 'liability', id: item.id, name: item.name, score });
        }
      }
    }

    return scored.sort((left, right) => right.score - left.score);
  }

  private async deleteByTarget(
    state: FinancialStateResponse,
    target: DeleteTarget,
    source: 'voice' | 'chat' | 'manual'
  ) {
    if (target.type === 'income') {
      return this.tools.deleteIncomeItem(state, target.id, source);
    }

    if (target.type === 'expense') {
      return this.tools.deleteExpenseItem(state, target.id, source);
    }

    return this.tools.deleteLiabilityItem(state, target.id, source);
  }

  private async handleDeleteIntent(
    state: FinancialStateResponse,
    message: string,
    source: 'voice' | 'chat' | 'manual',
    mode: 'review' | 'stage',
    stage?: StageName
  ): Promise<HandleTurnResult> {
    let targets = this.findDeleteTargets(state, message);

    if (mode === 'stage' && stage) {
      targets = targets.filter((target) => this.matchesStageForDeleteTarget(state, target, stage));
    }

    if (targets.length === 0) {
      if (mode === 'stage' && stage) {
        return {
          state,
          replyText: `I can delete it. Please share the exact ${getStageTitle(stage)} item name, and amount if possible.`
        };
      }

      return {
        state,
        replyText: DELETE_NEEDS_DETAILS_REPLY
      };
    }

    const best = targets[0];
    const hasAmbiguity = targets.length > 1 && targets[1].score === best.score;

    if (hasAmbiguity) {
      const options = targets
        .slice(0, 3)
        .map((target) => target.name)
        .join(', ');

      return {
        state,
        replyText: `I found multiple matches: ${options}. Please tell me the exact one to delete.`
      };
    }

    const deleted = await this.deleteByTarget(state, best, source);
    deleted.state.conversation.awaitingCapturedFactConfirmation = false;
    deleted.state.conversation.awaitingMoreItems = mode === 'stage';
    deleted.state.conversation.pendingFollowUpQuestion = undefined;

    if (mode === 'stage' && stage) {
      return {
        state: deleted.state,
        replyText: `Done. I removed ${best.name}. ${getAnythingElsePrompt(stage)}`
      };
    }

    return {
      state: deleted.state,
      replyText: `Done. I removed ${best.name}. Anything else you want to add, edit, or delete?`
    };
  }

  private matchesStageForDeleteTarget(
    state: FinancialStateResponse,
    target: DeleteTarget,
    stage: StageName
  ) {
    if (stage === 'review') {
      return true;
    }

    if (target.type === 'income') {
      return stage === 'income';
    }

    if (target.type === 'expense') {
      const item = state.expenseItems.find((entry) => entry.id === target.id);

      if (!item) {
        return false;
      }

      return stageFromExpenseCategory(item.category) === stage;
    }

    const item = state.liabilityItems.find((entry) => entry.id === target.id);

    if (!item) {
      return false;
    }

    return stageFromLiabilityType(item.type) === stage;
  }

  private async finalizeTurn(
    state: FinancialStateResponse,
    userMessage: string,
    replyText: string
  ): Promise<HandleTurnResult> {
    this.ensureRecentMessages(state);
    this.appendRecentMessages(state, [
      { role: 'user', text: userMessage },
      { role: 'assistant', text: replyText }
    ]);

    const saved = await this.repository.save(state);

    return {
      state: saved,
      replyText
    };
  }

  async openConversation(userName: string): Promise<OpenConversationResult> {
    let state = await this.repository.createOrLoad(userName);

    if (sanitizeStoredItems(state)) {
      state = await this.repository.save(state);
    }

    if (typeof state.conversation.awaitingCapturedFactConfirmation !== 'boolean') {
      state.conversation.awaitingCapturedFactConfirmation = false;
      state.conversation.pendingFollowUpQuestion = undefined;
      state = await this.repository.save(state);
    }

    if (this.ensureRecentMessages(state)) {
      state = await this.repository.save(state);
    }

    state.conversation = recomputeConversation(state);

    if (!state.conversation.introDone) {
      state.conversation.introDone = true;
      state.conversation.awaitingConsent = true;
      state.conversation.awaitingMoreItems = false;
      state.conversation.awaitingCapturedFactConfirmation = false;
      state.conversation.pendingFollowUpQuestion = undefined;
      state.conversation.status = 'active';
      state = await this.repository.save(state);

      return {
        state,
        replyText: `Hi ${state.userName}, I am Paisa. I can help you capture your income, expenses, loans, and dues in a structured way. I will need your financial details and this usually takes about 5 to 10 minutes. Are you ready to start?`
      };
    }

    if (state.conversation.status === 'paused') {
      state.conversation.status = 'active';
    }

    state.conversation.awaitingConsent = false;
    state.conversation.awaitingCapturedFactConfirmation = false;
    state.conversation.pendingFollowUpQuestion = undefined;
    state = await this.repository.save(state);

    const stageTitle = getStageTitle(state.conversation.currentStage);
    const prompt = getStagePrompt(state.conversation.currentStage, state.userName);

    return {
      state,
      replyText: `Welcome back, ${state.userName}. We are resuming from ${stageTitle}. ${prompt}`
    };
  }

  async getStepperConfig(userName: string) {
    let state = await this.repository.createOrLoad(userName);

    if (sanitizeStoredItems(state)) {
      state = await this.repository.save(state);
    }

    state.conversation = recomputeConversation(state);
    state = await this.repository.save(state);

    const steps = [
      { id: 1, key: 'income', title: 'Income' },
      { id: 2, key: 'housing', title: 'Housing' },
      { id: 3, key: 'loans', title: 'Loans' },
      { id: 4, key: 'credit_cards', title: 'Credit Cards' },
      { id: 5, key: 'family_friends', title: 'Family & Friends' },
      { id: 6, key: 'travel', title: 'Travel' },
      { id: 7, key: 'misc', title: 'Misc' },
      { id: 8, key: 'review', title: 'Review' }
    ] as const;

    const mappedSteps = steps.map((step) => {
      const isCompleted = state.conversation.completedStages.includes(step.key as StageName);

      if (isCompleted) {
        return {
          id: step.id,
          title: step.title,
          status: 'completed' as const
        };
      }

      if (state.conversation.currentStage === step.key) {
        return {
          id: step.id,
          title: step.title,
          status: 'active' as const
        };
      }

      return {
        id: step.id,
        title: step.title,
        status: 'pending' as const
      };
    });

    return {
      steps: mappedSteps
    };
  }

  async getFinancialState(userName: string) {
    let state = await this.repository.createOrLoad(userName);

    let shouldSave = false;

    if (sanitizeStoredItems(state)) {
      shouldSave = true;
    }

    if (this.ensureRecentMessages(state)) {
      shouldSave = true;
    }

    state.conversation = recomputeConversation(state);

    if (shouldSave) {
      state = await this.repository.save(state);
    }

    return state;
  }

  async handleTurn(input: HandleTurnInput): Promise<HandleTurnResult> {
    let state = await this.repository.createOrLoad(input.userName);
    let shouldSaveState = false;

    if (this.ensureRecentMessages(state)) {
      shouldSaveState = true;
    }

    if (typeof state.conversation.awaitingCapturedFactConfirmation !== 'boolean') {
      state.conversation.awaitingCapturedFactConfirmation = false;
      shouldSaveState = true;
    }

    if (typeof state.conversation.pendingFollowUpQuestion !== 'string') {
      state.conversation.pendingFollowUpQuestion = undefined;
    }

    if (!state.conversation.introDone) {
      state.conversation.introDone = true;
      shouldSaveState = true;
    }

    if (sanitizeStoredItems(state)) {
      shouldSaveState = true;
    }

    state.conversation = recomputeConversation(state);

    if (shouldSaveState) {
      state = await this.repository.save(state);
    }

    const message = normalizeText(input.message);

    if (!message) {
      return this.finalizeTurn(state, message, 'Please tell me one financial detail, and I will record it.');
    }

    if (isOutOfScope(message)) {
      return this.finalizeTurn(
        state,
        message,
        OUT_OF_SCOPE_REPLY
      );
    }

    if (state.conversation.awaitingConsent) {
      if (isYes(message)) {
        state.conversation.awaitingConsent = false;
        state.conversation.status = 'active';
        state = await this.repository.save(state);

        return this.finalizeTurn(state, message, getStagePrompt(state.conversation.currentStage, state.userName));
      }

      if (isNo(message)) {
        state.conversation.status = 'paused';
        state = await this.repository.save(state);

        return this.finalizeTurn(
          state,
          message,
          'No problem. I have paused this session. Say start whenever you want to continue.'
        );
      }

      return this.finalizeTurn(state, message, 'Whenever you are ready, just say yes and we will start with income.');
    }

    if (state.conversation.status === 'paused') {
      if (isYes(message)) {
        state.conversation.status = 'active';
        state = await this.repository.save(state);

        return this.finalizeTurn(
          state,
          message,
          `Great, we are back. ${getStagePrompt(state.conversation.currentStage, state.userName)}`
        );
      }

      return this.finalizeTurn(state, message, 'Session is paused. Say start whenever you want to continue.');
    }

    if (state.conversation.currentStage === 'review') {
      const reviewed = await this.handleReviewTurn(state, message, input.source);
      return this.finalizeTurn(reviewed.state, message, reviewed.replyText);
    }

    const staged = await this.handleStageTurn(state, message, input.source);
    return this.finalizeTurn(staged.state, message, staged.replyText);
  }

  private async handleReviewTurn(
    state: FinancialStateResponse,
    message: string,
    source: 'voice' | 'chat' | 'manual'
  ): Promise<HandleTurnResult> {
    const value = normalizeKey(message);

    if (state.conversation.awaitingCapturedFactConfirmation) {
      if (isDeleteIntent(message)) {
        state.conversation.awaitingCapturedFactConfirmation = false;
        state.conversation.awaitingMoreItems = false;
        state.conversation.pendingFollowUpQuestion = undefined;
        state = await this.repository.save(state);

        return this.handleReviewTurn(state, message, source);
      }

      if (hasFinancialFact(message)) {
        state.conversation.awaitingCapturedFactConfirmation = false;
        state.conversation.awaitingMoreItems = false;
        state.conversation.pendingFollowUpQuestion = undefined;
        state = await this.repository.save(state);

        return this.handleReviewTurn(state, message, source);
      }

      if (isYes(message)) {
        state.conversation.awaitingCapturedFactConfirmation = false;
        state.conversation.awaitingMoreItems = true;
        state.conversation.pendingFollowUpQuestion = undefined;
        state = await this.repository.save(state);

        return {
          state,
          replyText: REVIEW_ANYTHING_ELSE_REPLY
        };
      }

      if (isNo(message)) {
        state.conversation.awaitingCapturedFactConfirmation = false;
        state.conversation.awaitingMoreItems = false;
        state.conversation.pendingFollowUpQuestion = undefined;
        state = await this.repository.save(state);

        return {
          state,
          replyText: 'No problem. Please share the corrected details and I will update it.'
        };
      }

      return {
        state,
        replyText: CONFIRM_YES_NO_REPLY
      };
    }

    if (isSummaryIntent(message)) {
      return {
        state,
        replyText: buildDeterministicReviewSummary(state)
      };
    }

    if (isIncomeGrowthAdviceIntent(message)) {
      return {
        state,
        replyText: OUT_OF_SCOPE_REPLY
      };
    }

    if (isPrioritizationIntent(message)) {
      return {
        state,
        replyText: buildDebtPriorityResponse(state)
      };
    }

    if (isNo(message) && !hasFinancialFact(message)) {
      return {
        state,
        replyText: 'Okay. No more edits. If you want, I can give you a full summary or debt and credit-card priority order.'
      };
    }

    if (isShortfallHelpIntent(message) && !isDeleteIntent(message)) {
      return {
        state,
        replyText: `Your current shortfall is ${formatMinorInr(state.results.totals.shortfallMinor)}. I can help you remove it by updating or deleting specific items. Tell me the exact item name and corrected amount, or say delete and the item name.`
      };
    }

    if (isDeleteIntent(message)) {
      return this.handleDeleteIntent(state, message, source, 'review');
    }

    const extracted = await this.extractFactsWithAgent(message, 'review', state);

    if (extracted.intent === 'out_of_scope') {
      return {
        state,
        replyText: OUT_OF_SCOPE_REPLY
      };
    }

    let facts = extracted.facts.filter((fact) => factHasAmountSignal(fact));

    if (facts.length === 0) {
      facts = this.buildFallbackFactsFromMessage(state, 'review', message);
    }

    if (facts.length > 0) {
      let workingState = state;
      const previews: string[] = [];

      for (const fact of facts) {
        const captured = await this.captureFactForStage(workingState, fact, source);
        workingState = captured.state;
        previews.push(captured.preview);
      }

      workingState.conversation.awaitingMoreItems = false;
      workingState.conversation.awaitingCapturedFactConfirmation = true;
      workingState.conversation.pendingFollowUpQuestion = REVIEW_ANYTHING_ELSE_REPLY;
      workingState.conversation.lastQuestionId = undefined;
      workingState.conversation = recomputeConversation(workingState);
      const saved = await this.repository.save(workingState);

      const confirmationText = previews.length === 1
        ? `Got it. I captured ${previews[0]}.`
        : `Got it. I captured ${previews.length} items: ${previews.map((preview, index) => `${index + 1}) ${preview}`).join(' ')}`;

      return {
        state: saved,
        replyText: `${confirmationText} Is that correct?`
      };
    }

    if (extracted.intent === 'facts' || hasFinancialFact(message)) {
      return {
        state,
        replyText: 'Got it. Please share the amount and item name clearly so I can update it.'
      };
    }

    if (value.includes('done') || value.includes('complete') || value.includes('that is all') || value.includes('thats all')) {
      state.conversation.status = 'completed';
      state = await this.repository.save(state);

      await this.repository.appendEvent({
        userNameKey: state.userNameKey,
        eventType: 'session_completed',
        toolName: 'set_conversation_stage',
        source,
        payload: { stage: 'review' }
      });

      return {
        state,
        replyText: 'Thanks. I have saved everything. You can come back any time to edit details or run analysis.'
      };
    }

    const reviewContext = {
      totals: state.results.totals,
      essentialsSplit: state.results.essentialsSplit,
      cashflow30: state.results.cashflow30,
      debtPrioritization: {
        minimumFirst: state.results.debtPrioritization.minimumFirst.slice(0, 8),
        closureFirst: state.results.debtPrioritization.closureFirst.slice(0, 8)
      }
    };
    const recentContext = this.getRecentConversationContext(state);

    const prompt = [
      'You are Paisa financial review assistant.',
      'Answer only from provided computed results and current state.',
      'If user asks to add, edit, or correct any item, confirm that change is captured and then keep the response short.',
      'Always render money as ₹ with Indian comma format (example: ₹4,55,000). Never use million or billion wording.',
      'Keep response short, factual, and in natural English.',
      'Never suggest products, schemes, investments, or taking new loans.',
      'If user asks outside this scope, say you are not sure and bring them back to financial review.',
      `Recent conversation context: ${JSON.stringify(recentContext)}`,
      `Computed review results: ${JSON.stringify(reviewContext)}`,
      `Current liabilities: ${JSON.stringify(state.liabilityItems.map((item) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        outstandingBalanceMinor: item.outstandingBalanceMinor,
        minimumPaymentMinor: item.minimumPaymentMinor
      })))} `,
      `User question: ${message}`
    ].join('\n');

    try {
      const response = await this.openAiAgentService.generateReply({
        message: prompt,
        userName: state.userName
      });

      return {
        state,
        replyText: response.text
      };
    } catch {
      const totals = state.results.totals;
      const essentials = state.results.essentialsSplit;
      const cashflow = state.results.cashflow30;

      const minimumFirstTop = state.results.debtPrioritization.minimumFirst
        .slice(0, 3)
        .map((item) => `${item.rank}) ${item.name} ${formatMinorInr(item.minimumPaymentMinor)} min`)
        .join(', ');

      const closureFirstTop = state.results.debtPrioritization.closureFirst
        .slice(0, 3)
        .map((item) => `${item.rank}) ${item.name} ${formatMinorInr(item.outstandingBalanceMinor)} outstanding`)
        .join(', ');

      return {
        state,
        replyText: [
          `Total incoming is ${formatMinorInr(totals.totalIncomingMinor)} and total outgoing is ${formatMinorInr(totals.totalOutgoingMinor)}.`,
          `Net is ${formatMinorInr(totals.netMinor)} with shortfall ${formatMinorInr(totals.shortfallMinor)} and remaining ${formatMinorInr(totals.remainingMinor)}.`,
          `Essentials ${formatMinorInr(essentials.essentialsMinor)}, reducible ${formatMinorInr(essentials.reducibleMinor)}, optional ${formatMinorInr(essentials.optionalMinor)}.`,
          cashflow.firstShortageDay ? `First shortage day is ${cashflow.firstShortageDay}.` : 'No shortage day in 30 days.',
          `Minimum-first priority: ${minimumFirstTop || 'no active liabilities'}.`,
          `Closure-first priority: ${closureFirstTop || 'no active liabilities'}.`
        ].join(' ')
      };
    }

  }

  private async extractFactsWithAgent(
    message: string,
    currentStage: StageName,
    state: FinancialStateResponse
  ): Promise<AgentExtractionResult> {
    const recentContext = this.getRecentConversationContext(state);

    const schemaHint = {
      intent: 'facts | none_for_stage | finish_stage | unknown | out_of_scope',
      noneStage: 'income | housing | loans | credit_cards | family_friends | travel | misc | review | null',
      facts: [
        {
          stage: 'income | housing | loans | credit_cards | family_friends | travel | misc',
          targetItemId: 'existing item id or null',
          itemName: 'short clean item label',
          amountMajor: 0,
          outstandingMajor: 0,
          minimumPaymentMajor: 0,
          timingText: 'monthly/weekly/one-time or null',
          expenseCategory: 'housing|utilities|food|transport|medical|family_support|travel|misc|null',
          liabilityType: 'loan|credit_card|family_friend|null',
          text: 'raw user snippet for this fact'
        }
      ]
    };

    const prompt = [
      'You are a finance intake fact extractor.',
      'Return ONLY JSON. No markdown. No explanation.',
      'Use current state to decide whether this is an update to an existing item or a new item.',
      'If it is an update, set targetItemId to the existing id.',
      'If it is a new entry, keep targetItemId null and provide itemName.',
      'Never use stage "review" in facts. Review is only for analysis questions.',
      'If the current stage is review, still map each fact to the true stage (income/housing/loans/credit_cards/family_friends/travel/misc).',
      'Extract all items mentioned in one message.',
      'If user says nothing/none for a stage, use intent none_for_stage.',
      'If user says section finished (for example: that is all, done, we are good), use intent finish_stage.',
      'If message is outside financial intake scope, use out_of_scope.',
      `Current stage: ${currentStage}`,
      `Recent conversation context: ${JSON.stringify(recentContext)}`,
      `Current state items: ${JSON.stringify(buildAgentStateContext(state))}`,
      `Schema: ${JSON.stringify(schemaHint)}`,
      `User message: ${message}`
    ].join('\n');

    let rawText = '';

    try {
      const response = await this.openAiAgentService.generateReply({
        message: prompt,
        userName: 'Extractor'
      });

      rawText = response.text;
    } catch {
      return {
        intent: 'unknown',
        noneStage: null,
        facts: []
      };
    }

    const parsed = parseJsonFromAgentText(rawText);

    if (!parsed || typeof parsed !== 'object') {
      return {
        intent: 'unknown',
        noneStage: null,
        facts: []
      };
    }

    const payload = parsed as {
      intent?: unknown;
      noneStage?: unknown;
      facts?: unknown;
    };

    const intentValue = typeof payload.intent === 'string'
      ? payload.intent
      : 'unknown';

    const intent: AgentExtractionResult['intent'] =
      intentValue === 'facts'
      || intentValue === 'none_for_stage'
      || intentValue === 'finish_stage'
      || intentValue === 'unknown'
      || intentValue === 'out_of_scope'
        ? intentValue
        : 'unknown';

    const noneStage = toStageName(payload.noneStage);

    const facts: SegmentFact[] = Array.isArray(payload.facts)
      ? payload.facts
          .map((value) => {
            if (!value || typeof value !== 'object') {
              return null;
            }

            const fact = value as {
              stage?: unknown;
              targetItemId?: unknown;
              itemName?: unknown;
              amountMajor?: unknown;
              outstandingMajor?: unknown;
              minimumPaymentMajor?: unknown;
              timingText?: unknown;
              expenseCategory?: unknown;
              liabilityType?: unknown;
              text?: unknown;
            };

            const textValue = typeof fact.text === 'string' && fact.text.trim()
              ? fact.text.trim()
              : message;

            const targetItemId = typeof fact.targetItemId === 'string'
              ? normalizeText(fact.targetItemId)
              : undefined;

            const expenseCategory = toExpenseCategory(fact.expenseCategory);
            const liabilityType = toLiabilityType(fact.liabilityType);

            const stage = resolveStageForFact({
              currentStage,
              extractedStage: toStageName(fact.stage),
              targetItemId,
              text: textValue,
              expenseCategory,
              liabilityType,
              state
            });

            const amountMajor = toPositiveNumber(fact.amountMajor);
            const outstandingMajor = toPositiveNumber(fact.outstandingMajor);
            const minimumPaymentMajor = toPositiveNumber(fact.minimumPaymentMajor);

            return {
              stage,
              text: textValue,
              targetItemId,
              itemName: typeof fact.itemName === 'string' ? normalizeText(fact.itemName) : undefined,
              amountMajor,
              outstandingMajor,
              minimumPaymentMajor,
              timingText: typeof fact.timingText === 'string' ? normalizeText(fact.timingText) : undefined,
              expenseCategory,
              liabilityType
            } as SegmentFact;
          })
          .filter((value): value is SegmentFact => Boolean(value))
      : [];

    return {
      intent,
      noneStage,
      facts
    };
  }

  private async handleStageTurn(
    state: FinancialStateResponse,
    message: string,
    source: 'voice' | 'chat' | 'manual'
  ): Promise<HandleTurnResult> {
    const currentStage = state.conversation.currentStage;

    if (state.conversation.awaitingCapturedFactConfirmation) {
      if (isDeleteIntent(message)) {
        state.conversation.awaitingCapturedFactConfirmation = false;
        state.conversation.awaitingMoreItems = false;
        state.conversation.pendingFollowUpQuestion = undefined;
        state = await this.repository.save(state);

        return this.handleStageTurn(state, message, source);
      }

      if (hasFinancialFact(message)) {
        state.conversation.awaitingCapturedFactConfirmation = false;
        state.conversation.awaitingMoreItems = false;
        state.conversation.pendingFollowUpQuestion = undefined;
        state = await this.repository.save(state);

        return this.handleStageTurn(state, message, source);
      }

      if (isYes(message)) {
        state.conversation.awaitingCapturedFactConfirmation = false;
        state.conversation.awaitingMoreItems = true;
        const followUp = state.conversation.pendingFollowUpQuestion || getAnythingElsePrompt(currentStage);
        state.conversation.pendingFollowUpQuestion = undefined;
        state = await this.repository.save(state);

        return {
          state,
          replyText: followUp
        };
      }

      if (isNo(message)) {
        state.conversation.awaitingCapturedFactConfirmation = false;
        state.conversation.awaitingMoreItems = false;
        state.conversation.pendingFollowUpQuestion = undefined;
        state = await this.repository.save(state);

        return {
          state,
          replyText: `No problem. Please tell me the corrected ${getStageTitle(currentStage)} details and I will update it.`
        };
      }

      return {
        state,
        replyText: CONFIRM_YES_NO_REPLY
      };
    }

    if (state.conversation.awaitingMoreItems) {
      if (isNo(message) && !hasFinancialFact(message)) {
        return this.completeCurrentStage(state, source);
      }

      if (isYes(message) && !hasFinancialFact(message)) {
        return {
          state,
          replyText: `Sure. Please share the next item for ${getStageTitle(currentStage)} with amount and timing if possible.`
        };
      }
    }

    if (isDeleteIntent(message)) {
      return this.handleDeleteIntent(state, message, source, 'stage', currentStage);
    }

    const extracted = await this.extractFactsWithAgent(message, currentStage, state);

    if (extracted.intent === 'out_of_scope') {
      return {
        state,
        replyText: OUT_OF_SCOPE_REPLY
      };
    }

    if (
      extracted.intent === 'none_for_stage'
      || extracted.intent === 'finish_stage'
      || (isNo(message) && extracted.facts.length === 0)
    ) {
      const noneStage = extracted.noneStage ?? currentStage;
      const marked = await this.markNoForStage(state, noneStage, source);

      if (noneStage === currentStage) {
        return this.completeCurrentStage(marked, source);
      }

      return {
        state: marked,
        replyText: `Noted. ${getStagePrompt(currentStage, marked.userName)}`
      };
    }

    let facts = extracted.facts.filter((fact) => factHasAmountSignal(fact));

    if (facts.length === 0) {
      facts = this.buildFallbackFactsFromMessage(state, currentStage, message);
    }

    if (facts.length === 0) {
      if (extracted.intent === 'facts' || hasFinancialFact(message)) {
        return {
          state,
          replyText: buildMissingAmountPrompt(currentStage)
        };
      }

      if (isYes(message)) {
        return {
          state,
          replyText: `Sure. Please share one item for ${getStageTitle(currentStage)} with amount and timing if possible.`
        };
      }

      const previousPromptId = state.conversation.lastQuestionId;
      const attempt = previousPromptId === `clarify_${currentStage}_1` ? 2 : 1;
      state.conversation.lastQuestionId = `clarify_${currentStage}_${attempt}`;
      const saved = await this.repository.save(state);

      return {
        state: saved,
        replyText: buildClarificationPrompt(currentStage, attempt)
      };
    }

    let workingState = state;
    const previews: string[] = [];
    let capturedCurrentStage = false;

    for (const fact of facts) {
      const captured = await this.captureFactForStage(workingState, fact, source);
      workingState = captured.state;
      previews.push(captured.preview);

      if (fact.stage === currentStage) {
        capturedCurrentStage = true;
      }
    }

    workingState.conversation.awaitingMoreItems = false;
    workingState.conversation.awaitingCapturedFactConfirmation = true;
    workingState.conversation.pendingFollowUpQuestion = capturedCurrentStage
      ? getAnythingElsePrompt(currentStage)
      : getStagePrompt(currentStage, workingState.userName);
    workingState.conversation.lastQuestionId = undefined;
    workingState.conversation = recomputeConversation(workingState);
    const saved = await this.repository.save(workingState);

    const confirmationText = previews.length === 1
      ? `Got it. I captured ${previews[0]}.`
      : `Got it. I captured ${previews.length} items: ${previews.map((preview, index) => `${index + 1}) ${preview}`).join(' ')}`;

    return {
      state: saved,
      replyText: `${confirmationText} Is that correct?`
    };
  }

  private async captureFactForStage(
    state: FinancialStateResponse,
    fact: SegmentFact,
    source: 'voice' | 'chat' | 'manual'
  ): Promise<CaptureSummary> {
    if (fact.stage === 'income') {
      const targetIncome = fact.targetItemId
        ? state.incomeItems.find((item) => item.id === fact.targetItemId)
        : undefined;

      const result = await this.tools.upsertIncomeItem({
        state,
        text: fact.text,
        normalizedName: targetIncome?.name ?? fact.itemName,
        amountMajor: fact.amountMajor,
        source
      });

      return {
        state: result.state,
        stage: fact.stage,
        preview: `${result.item.name} at ${formatMinorInr(result.item.amount.expectedMinor)}`
      };
    }

    if (fact.stage === 'housing' || fact.stage === 'travel' || fact.stage === 'misc') {
      const targetExpense = fact.targetItemId
        ? state.expenseItems.find((item) => item.id === fact.targetItemId)
        : undefined;
      const category = fact.expenseCategory ?? targetExpense?.category ?? defaultExpenseCategoryForStage(fact.stage);
      const result = await this.tools.upsertExpenseItem({
        state,
        text: fact.text,
        normalizedName: targetExpense?.name ?? fact.itemName,
        amountMajor: fact.amountMajor,
        category,
        flexibility: defaultExpenseFlexibility(category),
        importance: defaultExpenseImportance(category),
        source
      });

      return {
        state: result.state,
        stage: fact.stage,
        preview: `${result.item.name} at ${formatMinorInr(result.item.amount.expectedMinor)}`
      };
    }

    const targetLiability = fact.targetItemId
      ? state.liabilityItems.find((item) => item.id === fact.targetItemId)
      : undefined;
    const liabilityType = fact.liabilityType ?? targetLiability?.type ?? stageToLiabilityType(fact.stage);
    const outstandingMajor = fact.outstandingMajor ?? fact.amountMajor;
    const minimumPaymentMajor = liabilityType === 'credit_card'
      ? (fact.minimumPaymentMajor && fact.minimumPaymentMajor > 0 ? fact.minimumPaymentMajor : outstandingMajor)
      : liabilityType === 'family_friend'
        ? (fact.minimumPaymentMajor && fact.minimumPaymentMajor > 0 ? fact.minimumPaymentMajor : outstandingMajor)
      : fact.minimumPaymentMajor;

    const result = await this.tools.upsertLiabilityItem({
      state,
      text: fact.text,
      normalizedName: targetLiability?.name ?? fact.itemName,
      amountMajor: fact.amountMajor,
      outstandingMajor,
      minimumPaymentMajor,
      type: liabilityType,
      source
    });

    const outstandingText = formatMinorInr(result.item.outstandingBalanceMinor);
    const minimumText = formatMinorInr(result.item.minimumPaymentMinor);
    const preview = result.item.outstandingBalanceMinor !== result.item.minimumPaymentMinor
      ? `${result.item.name}, outstanding ${outstandingText}, monthly payment ${minimumText}`
      : `${result.item.name} at ${outstandingText}`;

    return {
      state: result.state,
      stage: fact.stage,
      preview
    };
  }

  private async markNoForStage(
    state: FinancialStateResponse,
    stage: StageName,
    source: 'voice' | 'chat' | 'manual'
  ) {
    if (!state.conversation.noneConfirmedStages.includes(stage)) {
      state.conversation.noneConfirmedStages = [...state.conversation.noneConfirmedStages, stage];
    }

    state.conversation.awaitingMoreItems = false;
    state.conversation.awaitingCapturedFactConfirmation = false;
    state.conversation.pendingFollowUpQuestion = undefined;
    state.conversation = recomputeConversation(state);
    const saved = await this.repository.save(state);

    await this.repository.appendEvent({
      userNameKey: saved.userNameKey,
      eventType: 'stage_none_confirmed',
      toolName: 'mark_field_unknown',
      source,
      payload: { stage }
    });

    return saved;
  }


  private async completeCurrentStage(
    state: FinancialStateResponse,
    source: 'voice' | 'chat' | 'manual'
  ): Promise<HandleTurnResult> {
    const currentStage = state.conversation.currentStage;
    state.conversation.awaitingCapturedFactConfirmation = false;
    state.conversation.pendingFollowUpQuestion = undefined;
    const nextStage = moveToNextStage(currentStage);

    if (nextStage === 'review') {
      const result = await this.tools.setConversationStage(state, 'review', source);

      return {
        state: result.state,
        replyText: `Done with ${getStageTitle(currentStage)}. ${getStagePrompt('review', result.state.userName)}`
      };
    }

    const moved = await this.tools.setConversationStage(state, nextStage, source);

    return {
      state: moved.state,
      replyText: `Done with ${getStageTitle(currentStage)}. ${getStagePrompt(nextStage, moved.state.userName)}`
    };
  }
}
