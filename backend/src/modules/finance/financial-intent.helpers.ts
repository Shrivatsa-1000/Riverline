export function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeKey(value: string) {
  return normalizeText(value).toLowerCase();
}

export function parseNumbers(text: string) {
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

export function isYes(text: string) {
  const value = normalizeKey(text);

  if (/\b(yes|yeah|yep|sure|ready|start|continue|go ahead|ok|okay|correct|right|exactly)\b/.test(value)) {
    return true;
  }

  return value.includes("that's correct")
    || value.includes('thats correct')
    || value.includes('yes yes');
}

export function isNo(text: string) {
  const value = normalizeKey(text);
  return /\b(no|nope|not now|pause|later|stop|none|nothing else|nothing more|no more|that is all|that's all|thats all|that's it|thats it|all good|we are good|we're good|done|done here|good now)\b/.test(value);
}

export function hasFinancialFact(text: string) {
  if (parseNumbers(text).length > 0) {
    return true;
  }

  const value = normalizeKey(text);
  return /\b(salary|income|rent|loan|emi|card|credit|family|friend|travel|fuel|bill|expense|owned|rented|repay|maintenance|internet|electricity|water|subscription|shopping|medical|food|grocery)\b/.test(value);
}

export function isOutOfScope(text: string) {
  const value = normalizeKey(text);

  if (!value) {
    return false;
  }

  const nonFinanceSignal = /\b(weather|movie|sports|cricket|football|recipe|coding|programming|politics)\b/.test(value);
  const financeSignal = hasFinancialFact(value) || isYes(value) || isNo(value);

  return nonFinanceSignal && !financeSignal;
}

export function isDeleteIntent(text: string) {
  const value = normalizeKey(text);
  return /\b(delete|remove|drop|clear)\b/.test(value);
}

export function isSummaryIntent(text: string) {
  const value = normalizeKey(text);
  return /\b(summary|summarize|overall|totals|all payments|cash flow|quick summary)\b/.test(value);
}

export function isShortfallHelpIntent(text: string) {
  const value = normalizeKey(text);
  return /\b(shortfall|deficit|how can i remove|how to remove|how to reduce|reduce this|fix this)\b/.test(value);
}

export function isPrioritizationIntent(text: string) {
  const value = normalizeKey(text);
  const hasAction = /\b(priority|prioritise|prioritize|order|which|whom|pay first|return first|debt first|who first|sequence)\b/.test(value);
  const hasDebtContext = /\b(debt|loan|loans|emi|credit card|credit cards|card due|card dues|liability|repay|repayment|debit and credit|debt and credit)\b/.test(value);

  return hasAction && hasDebtContext;
}

export function isIncomeGrowthAdviceIntent(text: string) {
  const value = normalizeKey(text);
  return /\b(make more money|earn more|increase income|side income|side hustle|new job|job switch|business idea|how do i earn)\b/.test(value);
}
