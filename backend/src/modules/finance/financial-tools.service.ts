import type {
  ExpenseItem,
  FinancialStateResponse,
  Frequency,
  IncomeItem,
  LiabilityItem,
  StageName,
  Timing,
  ToolResult
} from './financial-state.types';
import { FinancialStateRepository } from './financial-state.repository';
import { recomputeConversation } from './intake-stage.engine';

type SourceType = 'voice' | 'chat' | 'manual';

interface UpsertIncomeInput {
  state: FinancialStateResponse;
  text: string;
  normalizedName?: string;
  amountMajor?: number;
  source: SourceType;
}

interface UpsertExpenseInput {
  state: FinancialStateResponse;
  text: string;
  normalizedName?: string;
  amountMajor?: number;
  category: ExpenseItem['category'];
  flexibility: ExpenseItem['flexibility'];
  importance: ExpenseItem['importance'];
  source: SourceType;
}

interface UpsertLiabilityInput {
  state: FinancialStateResponse;
  text: string;
  normalizedName?: string;
  amountMajor?: number;
  outstandingMajor?: number;
  minimumPaymentMajor?: number;
  type: LiabilityItem['type'];
  source: SourceType;
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeKey(value: string) {
  return normalizeText(value).toLowerCase();
}

function parseFrequency(text: string): Frequency {
  const value = normalizeKey(text);

  if (value.includes('weekly') || value.includes('every week')) {
    return 'weekly';
  }

  if (value.includes('one time') || value.includes('one-time') || value.includes('single payment')) {
    return 'one_time';
  }

  return 'monthly';
}

function parseDayOfMonth(text: string) {
  const dayMatch = text.match(/\b(?:on|due|every)\s+([12]?\d|3[01])(?:st|nd|rd|th)?\b/i);

  if (!dayMatch) {
    return undefined;
  }

  const day = Number(dayMatch[1]);
  if (!Number.isFinite(day) || day < 1 || day > 31) {
    return undefined;
  }

  return day;
}

function parseDate(text: string) {
  const value = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  return value ? value[1] : undefined;
}

function parseNumbers(text: string) {
  const matches = [...text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|lakh|lac|crore)?/gi)];

  return matches
    .map((match) => {
      const rawValue = Number((match[1] || '').replace(/,/g, ''));

      if (!Number.isFinite(rawValue)) {
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
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);
}

function selectAmountCandidates(text: string) {
  const parsed = parseNumbers(text);
  const filtered = parsed.filter((value) => value >= 100);
  const candidates = filtered.length > 0 ? filtered : parsed;

  return [...candidates].sort((left, right) => right - left);
}

function toRupeeUnits(amount: number | undefined) {
  if (!amount || amount < 0) {
    return 0;
  }

  return Math.round(amount);
}

function buildTiming(text: string): Timing {
  const frequency = parseFrequency(text);

  return {
    frequency,
    dayOfMonth: frequency === 'monthly' ? parseDayOfMonth(text) : undefined,
    date: frequency === 'one_time' ? parseDate(text) : undefined,
    timezone: 'Asia/Kolkata'
  };
}

function extractLabel(text: string, fallback: string) {
  const cleaned = normalizeText(text);

  if (!cleaned) {
    return fallback;
  }

  const short = cleaned.split(/[,.!?]/)[0] || cleaned;
  return short.slice(0, 80);
}

function resolveItemName(normalizedName: string | undefined, text: string, fallback: string) {
  const cleanName = normalizedName?.trim();

  if (cleanName) {
    return cleanName;
  }

  return extractLabel(text, fallback);
}

function inferIncomeSourceType(text: string): IncomeItem['sourceType'] {
  const value = normalizeKey(text);

  if (value.includes('salary')) {
    return 'salary';
  }

  if (value.includes('business')) {
    return 'business';
  }

  if (value.includes('freelance')) {
    return 'freelance';
  }

  if (value.includes('support') || value.includes('family')) {
    return 'support';
  }

  return 'other';
}

function inferInterestRateBps(text: string) {
  const match = text.match(/(\d{1,2}(?:\.\d+)?)\s*%/);
  if (!match) {
    return undefined;
  }

  const value = Number(match[1]);

  if (!Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return Math.round(value * 100);
}

function nextItemId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function toToolResult(state: FinancialStateResponse): ToolResult {
  return {
    ok: true,
    userNameKey: state.userNameKey,
    currentStage: state.conversation.currentStage,
    pendingFields: state.conversation.pendingFields
  };
}

function isSameName(left: string, right: string) {
  return normalizeKey(left) === normalizeKey(right);
}

function tokenizeName(value: string) {
  const ignored = new Set(['the', 'and', 'for', 'with', 'item', 'expense', 'income', 'loan', 'card', 'bill', 'monthly']);

  return normalizeKey(value)
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !ignored.has(token));
}

function hasSimilarName(left: string, right: string) {
  const leftTokens = tokenizeName(left);
  const rightTokens = tokenizeName(right);

  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return false;
  }

  const rightSet = new Set(rightTokens);
  const overlap = leftTokens.filter((token) => rightSet.has(token)).length;
  const threshold = Math.min(2, leftTokens.length, rightTokens.length);

  return overlap >= threshold;
}

function toIsoNow() {
  return new Date().toISOString();
}

function isLikelySameItemName(left: string, right: string) {
  return isSameName(left, right) || hasSimilarName(left, right);
}

interface CashflowDay {
  date: string;
  openingMinor: number;
  inflowMinor: number;
  outflowMinor: number;
  closingMinor: number;
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

export class FinancialToolsService {
  constructor(private readonly repository: FinancialStateRepository) {}

  async upsertIncomeItem(input: UpsertIncomeInput) {
    const amounts = selectAmountCandidates(input.text);
    const amountMinor = toRupeeUnits(input.amountMajor ?? amounts[0]);
    const fallbackName = `Income item ${input.state.incomeItems.length + 1}`;
    const inferredName = resolveItemName(input.normalizedName, input.text, fallbackName);
    const now = toIsoNow();

    const existingIndex = input.state.incomeItems.findIndex((item) => isLikelySameItemName(item.name, inferredName));

    const nextItem: IncomeItem = {
      id: existingIndex >= 0 ? input.state.incomeItems[existingIndex].id : nextItemId('income'),
      name: inferredName,
      amount: {
        expectedMinor: amountMinor,
        currency: 'INR'
      },
      timing: buildTiming(input.text),
      sourceType: inferIncomeSourceType(input.text),
      confidence: amountMinor > 0 ? 'confirmed' : 'estimated',
      notes: normalizeText(input.text),
      updatedAt: now
    };

    if (existingIndex >= 0) {
      input.state.incomeItems = input.state.incomeItems.map((item, index) => index === existingIndex ? nextItem : item);
    } else {
      input.state.incomeItems = [...input.state.incomeItems, nextItem];
    }

    input.state.conversation = recomputeConversation(input.state);
    const saved = await this.repository.save(input.state);

    await this.repository.appendEvent({
      userNameKey: saved.userNameKey,
      eventType: existingIndex >= 0 ? 'income_updated' : 'income_added',
      toolName: 'upsert_income_item',
      source: input.source,
      payload: {
        itemId: nextItem.id,
        name: nextItem.name,
        expectedMinor: nextItem.amount.expectedMinor
      }
    });

    return {
      state: saved,
      result: toToolResult(saved),
      action: existingIndex >= 0 ? 'updated' as const : 'added' as const,
      item: nextItem
    };
  }

  async upsertExpenseItem(input: UpsertExpenseInput) {
    const amounts = selectAmountCandidates(input.text);
    const amountMinor = toRupeeUnits(input.amountMajor ?? amounts[0]);
    const fallbackName = `${input.category.replace('_', ' ')} item ${input.state.expenseItems.length + 1}`;
    const inferredName = resolveItemName(input.normalizedName, input.text, fallbackName);
    const now = toIsoNow();

    const existingIndex = input.state.expenseItems.findIndex(
      (item) => item.category === input.category && isLikelySameItemName(item.name, inferredName)
    );

    const nextItem: ExpenseItem = {
      id: existingIndex >= 0 ? input.state.expenseItems[existingIndex].id : nextItemId('expense'),
      name: inferredName,
      amount: {
        expectedMinor: amountMinor,
        currency: 'INR'
      },
      timing: buildTiming(input.text),
      category: input.category,
      importance: input.importance,
      flexibility: input.flexibility,
      confidence: amountMinor > 0 ? 'confirmed' : 'estimated',
      notes: normalizeText(input.text),
      updatedAt: now
    };

    if (existingIndex >= 0) {
      input.state.expenseItems = input.state.expenseItems.map((item, index) => index === existingIndex ? nextItem : item);
    } else {
      input.state.expenseItems = [...input.state.expenseItems, nextItem];
    }

    input.state.conversation = recomputeConversation(input.state);
    const saved = await this.repository.save(input.state);

    await this.repository.appendEvent({
      userNameKey: saved.userNameKey,
      eventType: existingIndex >= 0 ? 'expense_updated' : 'expense_added',
      toolName: 'upsert_expense_item',
      source: input.source,
      payload: {
        itemId: nextItem.id,
        name: nextItem.name,
        category: nextItem.category,
        expectedMinor: nextItem.amount.expectedMinor
      }
    });

    return {
      state: saved,
      result: toToolResult(saved),
      action: existingIndex >= 0 ? 'updated' as const : 'added' as const,
      item: nextItem
    };
  }

  async upsertLiabilityItem(input: UpsertLiabilityInput) {
    const amounts = selectAmountCandidates(input.text);
    const outstandingMajor = input.outstandingMajor ?? input.amountMajor ?? amounts[0];
    const minimumMajor = input.minimumPaymentMajor ?? input.amountMajor ?? amounts[1] ?? amounts[0];
    const outstandingMinor = toRupeeUnits(outstandingMajor);
    const minimumPaymentMinor = toRupeeUnits(minimumMajor);
    const fallbackName = `${input.type.replace('_', ' ')} item ${input.state.liabilityItems.length + 1}`;
    const inferredName = resolveItemName(input.normalizedName, input.text, fallbackName);
    const now = toIsoNow();

    const existingIndex = input.state.liabilityItems.findIndex(
      (item) => item.type === input.type && isLikelySameItemName(item.name, inferredName)
    );

    const nextItem: LiabilityItem = {
      id: existingIndex >= 0 ? input.state.liabilityItems[existingIndex].id : nextItemId('liability'),
      type: input.type,
      name: inferredName,
      outstandingBalanceMinor: outstandingMinor,
      minimumPaymentMinor,
      timing: buildTiming(input.text),
      interestRateAnnualBps: inferInterestRateBps(input.text),
      confidence: outstandingMinor > 0 ? 'confirmed' : 'estimated',
      notes: normalizeText(input.text),
      updatedAt: now
    };

    if (existingIndex >= 0) {
      input.state.liabilityItems = input.state.liabilityItems.map((item, index) => index === existingIndex ? nextItem : item);
    } else {
      input.state.liabilityItems = [...input.state.liabilityItems, nextItem];
    }

    input.state.conversation = recomputeConversation(input.state);
    const saved = await this.repository.save(input.state);

    await this.repository.appendEvent({
      userNameKey: saved.userNameKey,
      eventType: existingIndex >= 0 ? 'liability_updated' : 'liability_added',
      toolName: 'upsert_liability_item',
      source: input.source,
      payload: {
        itemId: nextItem.id,
        name: nextItem.name,
        type: nextItem.type,
        outstandingBalanceMinor: nextItem.outstandingBalanceMinor,
        minimumPaymentMinor: nextItem.minimumPaymentMinor
      }
    });

    return {
      state: saved,
      result: toToolResult(saved),
      action: existingIndex >= 0 ? 'updated' as const : 'added' as const,
      item: nextItem
    };
  }

  async deleteIncomeItem(state: FinancialStateResponse, itemId: string, source: SourceType) {
    state.incomeItems = state.incomeItems.filter((item) => item.id !== itemId);
    state.conversation = recomputeConversation(state);
    const saved = await this.repository.save(state);

    await this.repository.appendEvent({
      userNameKey: saved.userNameKey,
      eventType: 'income_deleted',
      toolName: 'delete_income_item',
      source,
      payload: { itemId }
    });

    return {
      state: saved,
      result: toToolResult(saved)
    };
  }

  async deleteExpenseItem(state: FinancialStateResponse, itemId: string, source: SourceType) {
    state.expenseItems = state.expenseItems.filter((item) => item.id !== itemId);
    state.conversation = recomputeConversation(state);
    const saved = await this.repository.save(state);

    await this.repository.appendEvent({
      userNameKey: saved.userNameKey,
      eventType: 'expense_deleted',
      toolName: 'delete_expense_item',
      source,
      payload: { itemId }
    });

    return {
      state: saved,
      result: toToolResult(saved)
    };
  }

  async deleteLiabilityItem(state: FinancialStateResponse, itemId: string, source: SourceType) {
    state.liabilityItems = state.liabilityItems.filter((item) => item.id !== itemId);
    state.conversation = recomputeConversation(state);
    const saved = await this.repository.save(state);

    await this.repository.appendEvent({
      userNameKey: saved.userNameKey,
      eventType: 'liability_deleted',
      toolName: 'delete_liability_item',
      source,
      payload: { itemId }
    });

    return {
      state: saved,
      result: toToolResult(saved)
    };
  }

  async setConversationStage(state: FinancialStateResponse, stage: StageName, source: SourceType) {
    state.conversation.currentStage = stage;
    state.conversation.awaitingMoreItems = false;
    state.conversation = recomputeConversation(state);
    const saved = await this.repository.save(state);

    await this.repository.appendEvent({
      userNameKey: saved.userNameKey,
      eventType: 'stage_set',
      toolName: 'set_conversation_stage',
      source,
      payload: { stage }
    });

    return {
      state: saved,
      result: toToolResult(saved)
    };
  }

  async markFieldUnknown(state: FinancialStateResponse, stage: StageName, field: string, reason: string, source: SourceType) {
    const alreadyMarked = state.unknowns.some((entry) => entry.stage === stage && entry.field === field);

    if (!alreadyMarked) {
      state.unknowns = [
        ...state.unknowns,
        {
          id: this.repository.createEventId('unknown'),
          field,
          stage,
          importance: 'medium',
          reason,
          createdAt: this.repository.createIsoTimestamp()
        }
      ];
    }

    state.conversation = recomputeConversation(state);
    const saved = await this.repository.save(state);

    await this.repository.appendEvent({
      userNameKey: saved.userNameKey,
      eventType: 'unknown_marked',
      toolName: 'mark_field_unknown',
      source,
      payload: { stage, field, reason }
    });

    return {
      state: saved,
      result: toToolResult(saved)
    };
  }

  analyzeEssentialsVsFlexible(state: FinancialStateResponse) {
    let essentialMinor = 0;
    let reducibleMinor = 0;
    let optionalMinor = 0;

    for (const item of state.expenseItems) {
      const amount = item.amount.expectedMinor;

      if (item.flexibility === 'fixed') {
        essentialMinor += amount;
        continue;
      }

      if (item.flexibility === 'reducible') {
        reducibleMinor += amount;
        continue;
      }

      optionalMinor += amount;
    }

    const total = essentialMinor + reducibleMinor + optionalMinor;

    return {
      ok: true,
      userNameKey: state.userNameKey,
      generatedAt: toIsoNow(),
      data: {
        totalMinor: total,
        essentialsMinor: essentialMinor,
        reducibleMinor,
        optionalMinor,
        essentialsShare: total > 0 ? Number((essentialMinor / total).toFixed(4)) : 0,
        reducibleShare: total > 0 ? Number((reducibleMinor / total).toFixed(4)) : 0,
        optionalShare: total > 0 ? Number((optionalMinor / total).toFixed(4)) : 0
      }
    };
  }

  analyzeCashflowWindow(state: FinancialStateResponse, days = 30) {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);

    let runningBalance = 0;
    const rows: CashflowDay[] = [];
    let firstShortageDay: string | null = null;
    let peakDeficitMinor = 0;
    let recoveryDay: string | null = null;

    for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
      const currentDate = addDays(start, dayIndex);
      const openingMinor = runningBalance;

      let inflowMinor = 0;
      let outflowMinor = 0;

      for (const item of state.incomeItems) {
        if (occursOnDate(item.timing, currentDate)) {
          inflowMinor += item.amount.expectedMinor;
        }
      }

      for (const item of state.expenseItems) {
        if (occursOnDate(item.timing, currentDate)) {
          outflowMinor += item.amount.expectedMinor;
        }
      }

      for (const item of state.liabilityItems) {
        if (occursOnDate(item.timing, currentDate)) {
          outflowMinor += item.minimumPaymentMinor;
        }
      }

      const closingMinor = openingMinor + inflowMinor - outflowMinor;

      if (closingMinor < 0 && firstShortageDay === null) {
        firstShortageDay = toIsoDateKey(currentDate);
      }

      if (closingMinor < peakDeficitMinor) {
        peakDeficitMinor = closingMinor;
      }

      if (firstShortageDay && recoveryDay === null && closingMinor >= 0) {
        recoveryDay = toIsoDateKey(currentDate);
      }

      rows.push({
        date: toIsoDateKey(currentDate),
        openingMinor,
        inflowMinor,
        outflowMinor,
        closingMinor
      });

      runningBalance = closingMinor;
    }

    const shortageDate = firstShortageDay ? new Date(`${firstShortageDay}T00:00:00.000Z`) : null;
    const computedRecovery = recoveryDay ? new Date(`${recoveryDay}T00:00:00.000Z`) : null;

    const recoveryIso = shortageDate && computedRecovery && sameDay(shortageDate, computedRecovery)
      ? null
      : recoveryDay;

    return {
      ok: true,
      userNameKey: state.userNameKey,
      generatedAt: toIsoNow(),
      data: {
        windowDays: days,
        rows,
        firstShortageDay,
        peakDeficitMinor,
        recoveryDay: recoveryIso
      }
    };
  }
}
