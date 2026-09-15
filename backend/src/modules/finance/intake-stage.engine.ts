import type {
  ConversationState,
  ExpenseItem,
  FinancialStateResponse,
  LiabilityItem,
  StageName
} from './financial-state.types';

const STAGES: StageName[] = [
  'income',
  'housing',
  'loans',
  'credit_cards',
  'family_friends',
  'travel',
  'misc',
  'review'
];

const STAGE_TITLES: Record<StageName, string> = {
  income: 'Income',
  housing: 'Housing',
  loans: 'Loans',
  credit_cards: 'Credit Cards',
  family_friends: 'Family & Friends',
  travel: 'Travel',
  misc: 'Misc',
  review: 'Review'
};

export function getStageTitle(stage: StageName) {
  return STAGE_TITLES[stage];
}

export function getAllStages() {
  return [...STAGES];
}

export function getStagePrompt(stage: StageName, userName: string) {
  if (stage === 'income') {
    return `Great, ${userName}. Let us start with income. What are your income sources and how much do you receive from each one? If anyone else in your family contributes, please include that too.`;
  }

  if (stage === 'housing') {
    return 'Now housing. Is your home rented or owned, and what are your regular housing costs like rent, maintenance, electricity, internet, or water?';
  }

  if (stage === 'loans') {
    return 'Now loans. Please share each active loan or EMI, including outstanding amount, monthly payment, and due day if you know it.';
  }

  if (stage === 'credit_cards') {
    return 'Now credit cards. Tell me your cards, outstanding balances, minimum due amounts, and due dates if you know them.';
  }

  if (stage === 'family_friends') {
    return 'Do you have any financial commitments to family or friends, like monthly support, repayments, or promised transfers?';
  }

  if (stage === 'travel') {
    return 'Now travel. Please share commute and travel costs, including fuel, cabs, tickets, parking, tolls, or regular trips.';
  }

  if (stage === 'misc') {
    return 'Anything else money-related that we have not captured yet, even if it is occasional?';
  }

  return 'Thanks, we have covered all sections. Do you want a quick factual summary now, or do you want to edit any item first?';
}

export function getAnythingElsePrompt(stage: StageName) {
  if (stage === 'income') {
    return 'Got it. Any other income source, including income from another family member?';
  }

  const title = getStageTitle(stage);
  return `Got it. Anything else in ${title} that you can think of?`;
}

function countHousingItems(expenseItems: ExpenseItem[]) {
  return expenseItems.filter((item) => item.category === 'housing' || item.category === 'utilities').length;
}

function countTravelItems(expenseItems: ExpenseItem[]) {
  return expenseItems.filter((item) => item.category === 'travel' || item.category === 'transport').length;
}

function countMiscItems(expenseItems: ExpenseItem[]) {
  return expenseItems.filter((item) => item.category === 'misc').length;
}

function countLoanItems(liabilityItems: LiabilityItem[]) {
  return liabilityItems.filter((item) => item.type === 'loan').length;
}

function countCreditCardItems(liabilityItems: LiabilityItem[]) {
  return liabilityItems.filter((item) => item.type === 'credit_card').length;
}

function countFamilyFriendItems(liabilityItems: LiabilityItem[]) {
  return liabilityItems.filter((item) => item.type === 'family_friend').length;
}

function hasStageData(state: FinancialStateResponse, stage: StageName) {
  if (stage === 'income') {
    return state.incomeItems.length > 0;
  }

  if (stage === 'housing') {
    return countHousingItems(state.expenseItems) > 0;
  }

  if (stage === 'loans') {
    return countLoanItems(state.liabilityItems) > 0;
  }

  if (stage === 'credit_cards') {
    return countCreditCardItems(state.liabilityItems) > 0;
  }

  if (stage === 'family_friends') {
    return countFamilyFriendItems(state.liabilityItems) > 0;
  }

  if (stage === 'travel') {
    return countTravelItems(state.expenseItems) > 0;
  }

  if (stage === 'misc') {
    return countMiscItems(state.expenseItems) > 0;
  }

  return false;
}

export function recomputeConversation(state: FinancialStateResponse): ConversationState {
  const completedStages: StageName[] = [];

  for (const stage of STAGES) {
    if (stage === 'review') {
      break;
    }

    if (state.conversation.noneConfirmedStages.includes(stage) || hasStageData(state, stage)) {
      completedStages.push(stage);
    }
  }

  const currentStage = STAGES.includes(state.conversation.currentStage)
    ? state.conversation.currentStage
    : 'income';

  const pendingFields = buildPendingFields(state, currentStage);

  return {
    ...state.conversation,
    currentStage,
    completedStages,
    pendingFields,
    status: state.conversation.status
  };
}

function buildPendingFields(state: FinancialStateResponse, stage: StageName) {
  if (stage === 'review') {
    return [];
  }

  if (state.conversation.noneConfirmedStages.includes(stage)) {
    return [];
  }

  if (hasStageData(state, stage)) {
    return [];
  }

  return ['at_least_one_item_or_none_confirmation'];
}

export function moveToNextStage(currentStage: StageName): StageName {
  const currentIndex = STAGES.indexOf(currentStage);

  if (currentIndex < 0 || currentIndex === STAGES.length - 1) {
    return 'review';
  }

  return STAGES[currentIndex + 1];
}
