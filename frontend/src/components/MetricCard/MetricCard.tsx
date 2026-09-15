import { CircleDollarSign, CreditCard, ShoppingCart, TrendingUp, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { SummaryCard } from '../../types/dashboard';
import './MetricCard.css';

interface MetricCardProps {
  item: SummaryCard;
}

const metricIcons: Record<string, LucideIcon> = {
  'Total Income': TrendingUp,
  'Total Expenses': ShoppingCart,
  'Debt Payments': CreditCard,
  'Money Left': Wallet
};

export function MetricCard({ item }: MetricCardProps) {
  const Icon = metricIcons[item.title] || CircleDollarSign;

  return (
    <article className={`metric-card metric-card--${item.tone}`}>
      <div className="metric-card__icon">
        <Icon size={16} />
      </div>
      <h3>{item.title}</h3>
      <div className="metric-card__amount">{item.amount}</div>
      <div className="metric-card__period">{item.period}</div>
    </article>
  );
}
