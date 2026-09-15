import { Collection, ObjectId, type Db } from 'mongodb';
import { buildFinancialResults } from './financial-results.engine';
import type {
  ExpenseItem,
  FinancialStateDocument,
  FinancialStateEventDocument,
  FinancialStateResponse,
  IncomeItem,
  LiabilityItem,
  StageName
} from './financial-state.types';

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, ' ');
}

function nameKey(name: string) {
  return normalizeName(name).toLowerCase();
}

function nowIso() {
  return new Date().toISOString();
}

function toRupee(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.round(value / 100);
}

function convertLegacyPaiseDocument(document: FinancialStateDocument) {
  if (document.amountUnit === 'rupee') {
    return {
      changed: false,
      document
    };
  }

  if (document.amountUnit !== 'paise') {
    return {
      changed: true,
      document: {
        ...document,
        amountUnit: 'rupee' as const
      }
    };
  }

  const incomeItems = document.incomeItems.map((item) => ({
    ...item,
    amount: {
      ...item.amount,
      expectedMinor: toRupee(item.amount.expectedMinor) ?? 0,
      minMinor: toRupee(item.amount.minMinor),
      maxMinor: toRupee(item.amount.maxMinor)
    }
  }));

  const expenseItems = document.expenseItems.map((item) => ({
    ...item,
    amount: {
      ...item.amount,
      expectedMinor: toRupee(item.amount.expectedMinor) ?? 0,
      minMinor: toRupee(item.amount.minMinor),
      maxMinor: toRupee(item.amount.maxMinor)
    }
  }));

  const liabilityItems = document.liabilityItems.map((item) => ({
    ...item,
    outstandingBalanceMinor: toRupee(item.outstandingBalanceMinor) ?? 0,
    minimumPaymentMinor: toRupee(item.minimumPaymentMinor) ?? 0,
    lateFeeMinor: toRupee(item.lateFeeMinor)
  }));

  const convertedResults = document.results
    ? {
        ...document.results,
        totals: {
          ...document.results.totals,
          totalIncomingMinor: toRupee(document.results.totals.totalIncomingMinor) ?? 0,
          totalExpenseMinor: toRupee(document.results.totals.totalExpenseMinor) ?? 0,
          totalLiabilityMinimumMinor: toRupee(document.results.totals.totalLiabilityMinimumMinor) ?? 0,
          totalOutgoingMinor: toRupee(document.results.totals.totalOutgoingMinor) ?? 0,
          totalOutstandingMinor: toRupee(document.results.totals.totalOutstandingMinor) ?? 0,
          netMinor: toRupee(document.results.totals.netMinor) ?? 0,
          shortfallMinor: toRupee(document.results.totals.shortfallMinor) ?? 0,
          remainingMinor: toRupee(document.results.totals.remainingMinor) ?? 0
        },
        essentialsSplit: {
          ...document.results.essentialsSplit,
          essentialsMinor: toRupee(document.results.essentialsSplit.essentialsMinor) ?? 0,
          reducibleMinor: toRupee(document.results.essentialsSplit.reducibleMinor) ?? 0,
          optionalMinor: toRupee(document.results.essentialsSplit.optionalMinor) ?? 0
        },
        cashflow30: {
          ...document.results.cashflow30,
          peakDeficitMinor: toRupee(document.results.cashflow30.peakDeficitMinor) ?? 0
        },
        debtPrioritization: {
          minimumFirst: document.results.debtPrioritization.minimumFirst.map((item) => ({
            ...item,
            outstandingBalanceMinor: toRupee(item.outstandingBalanceMinor) ?? 0,
            minimumPaymentMinor: toRupee(item.minimumPaymentMinor) ?? 0
          })),
          closureFirst: document.results.debtPrioritization.closureFirst.map((item) => ({
            ...item,
            outstandingBalanceMinor: toRupee(item.outstandingBalanceMinor) ?? 0,
            minimumPaymentMinor: toRupee(item.minimumPaymentMinor) ?? 0
          }))
        }
      }
    : undefined;

  return {
    changed: true,
    document: {
      ...document,
      amountUnit: 'rupee' as const,
      incomeItems,
      expenseItems,
      liabilityItems,
      results: convertedResults
    }
  };
}

function createDefaultFinancialState(): Pick<
  FinancialStateDocument,
  'baseCurrency' | 'amountUnit' | 'incomeItems' | 'expenseItems' | 'liabilityItems' | 'unknowns' | 'results' | 'conversation'
> {
  const incomeItems: IncomeItem[] = [];
  const expenseItems: ExpenseItem[] = [];
  const liabilityItems: LiabilityItem[] = [];

  return {
    baseCurrency: 'INR',
    amountUnit: 'rupee',
    incomeItems,
    expenseItems,
    liabilityItems,
    unknowns: [],
    results: buildFinancialResults({
      incomeItems,
      expenseItems,
      liabilityItems
    }),
    conversation: {
      introDone: false,
      status: 'active',
      currentStage: 'income',
      completedStages: [],
      pendingFields: ['at_least_one_item_or_none_confirmation'],
      awaitingConsent: false,
      awaitingMoreItems: false,
      awaitingCapturedFactConfirmation: false,
      noneConfirmedStages: [],
      recentMessages: []
    }
  };
}

function mapFinancialState(document: FinancialStateDocument): FinancialStateResponse {
  const results = document.results ?? buildFinancialResults({
    incomeItems: document.incomeItems,
    expenseItems: document.expenseItems,
    liabilityItems: document.liabilityItems
  });

  return {
    id: document._id.toHexString(),
    userName: document.userName,
    userNameKey: document.userNameKey,
    baseCurrency: document.baseCurrency,
    amountUnit: document.amountUnit === 'rupee' ? 'rupee' : 'paise',
    incomeItems: document.incomeItems,
    expenseItems: document.expenseItems,
    liabilityItems: document.liabilityItems,
    unknowns: document.unknowns,
    results,
    conversation: document.conversation,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString()
  };
}

export class FinancialStateRepository {
  private readonly financialStates: Collection<FinancialStateDocument>;
  private readonly financialStateEvents: Collection<FinancialStateEventDocument>;

  constructor(db: Db) {
    this.financialStates = db.collection<FinancialStateDocument>('financial_states');
    this.financialStateEvents = db.collection<FinancialStateEventDocument>('financial_state_events');
  }

  async ensureIndexes() {
    await this.financialStates.createIndex({ userNameKey: 1 }, { unique: true });
    await this.financialStates.createIndex({ updatedAt: -1 });

    await this.financialStateEvents.createIndex({ userNameKey: 1, createdAt: -1 });
    await this.financialStateEvents.createIndex({ toolName: 1, createdAt: -1 });
  }

  async createOrLoad(userName: string) {
    const safeUserName = normalizeName(userName) || 'User';
    const safeUserNameKey = nameKey(safeUserName);
    const now = new Date();

    const created = await this.financialStates.findOneAndUpdate(
      { userNameKey: safeUserNameKey },
      {
        $set: {
          userName: safeUserName,
          userNameKey: safeUserNameKey,
          updatedAt: now
        },
        $setOnInsert: {
          _id: new ObjectId(),
          ...createDefaultFinancialState(),
          createdAt: now
        }
      },
      {
        upsert: true,
        returnDocument: 'after'
      }
    );

    if (!created) {
      throw new Error('Unable to create or load financial state');
    }

    const normalized = convertLegacyPaiseDocument(created);

    if (normalized.changed) {
      await this.financialStates.findOneAndUpdate(
        { _id: created._id },
        {
          $set: {
            amountUnit: 'rupee',
            incomeItems: normalized.document.incomeItems,
            expenseItems: normalized.document.expenseItems,
            liabilityItems: normalized.document.liabilityItems,
            results: normalized.document.results,
            updatedAt: now
          }
        }
      );
    }

    return mapFinancialState(normalized.document);
  }

  async findByUserNameKey(userNameKeyValue: string) {
    const found = await this.financialStates.findOne({ userNameKey: userNameKeyValue });

    if (!found) {
      return null;
    }

    const normalized = convertLegacyPaiseDocument(found);

    if (normalized.changed) {
      await this.financialStates.findOneAndUpdate(
        { _id: found._id },
        {
          $set: {
            amountUnit: 'rupee',
            incomeItems: normalized.document.incomeItems,
            expenseItems: normalized.document.expenseItems,
            liabilityItems: normalized.document.liabilityItems,
            results: normalized.document.results,
            updatedAt: new Date()
          }
        }
      );
    }

    return mapFinancialState(normalized.document);
  }

  async save(state: FinancialStateResponse) {
    const now = new Date();
    const results = buildFinancialResults(state);

    const updated = await this.financialStates.findOneAndUpdate(
      { _id: new ObjectId(state.id) },
      {
        $set: {
          userName: state.userName,
          userNameKey: state.userNameKey,
          baseCurrency: state.baseCurrency,
          amountUnit: 'rupee',
          incomeItems: state.incomeItems,
          expenseItems: state.expenseItems,
          liabilityItems: state.liabilityItems,
          unknowns: state.unknowns,
          results,
          conversation: state.conversation,
          updatedAt: now
        }
      },
      {
        returnDocument: 'after'
      }
    );

    if (!updated) {
      throw new Error('Unable to save financial state');
    }

    return mapFinancialState(updated);
  }

  async appendEvent(input: {
    userNameKey: string;
    eventType: string;
    toolName: string;
    source: 'voice' | 'chat' | 'manual';
    payload: Record<string, unknown>;
  }) {
    await this.financialStateEvents.insertOne({
      _id: new ObjectId(),
      userNameKey: input.userNameKey,
      eventType: input.eventType,
      toolName: input.toolName,
      source: input.source,
      payload: input.payload,
      createdAt: new Date()
    });
  }

  async markNoneConfirmed(state: FinancialStateResponse, stage: StageName) {
    if (state.conversation.noneConfirmedStages.includes(stage)) {
      return state;
    }

    state.conversation.noneConfirmedStages = [...state.conversation.noneConfirmedStages, stage];
    return this.save(state);
  }

  createEventId(prefix: string) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  createIsoTimestamp() {
    return nowIso();
  }
}
