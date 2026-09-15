import { Banknote, ChevronRight, CreditCard, Landmark, ShoppingCart, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FinancialDetailItem, FinancialDetailType } from '../../types/dashboard';
import './FinancialDetailsPanel.css';

interface FinancialDetailsPanelProps {
  items: FinancialDetailItem[];
}

const financialDetailIcons: Record<FinancialDetailType, LucideIcon> = {
  income: TrendingUp,
  expenses: ShoppingCart,
  loans: Landmark,
  creditCards: CreditCard
};

export function FinancialDetailsPanel({ items }: FinancialDetailsPanelProps) {
  if (items.length === 0) {
    return (
      <section className="panel financial-details-panel">
        <h2>Your Financial Details</h2>
        <p>All your income, expenses, debts and more.</p>
        <div className="panel-empty financial-details-panel__empty">No data available at the moment.</div>
      </section>
    );
  }

  return (
    <section className="panel financial-details-panel">
      <h2>Your Financial Details</h2>
      <p>All your income, expenses, debts and more.</p>

      <div className="financial-details-grid">
        {items.map((item) => {
          const Icon = financialDetailIcons[item.type] || Banknote;

          return (
            <article className="financial-details-card" key={item.type}>
              <div className="financial-details-card__icon">
                <Icon size={16} />
              </div>

              <div className="financial-details-card__body">
                <div className="financial-details-card__title">{item.title}</div>
                <div className="financial-details-card__amount-row">
                  <strong>{item.amount}</strong>
                  <span>{item.period}</span>
                </div>
              </div>

              <div className="financial-details-card__arrow">
                <ChevronRight size={16} />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
