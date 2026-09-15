import { CashFlowPanel } from '../../components/CashFlowPanel/CashFlowPanel';
import { DebtPriorityPanel } from '../../components/DebtPriorityPanel/DebtPriorityPanel';
import { FinancialDetailsPanel } from '../../components/FinancialDetailsPanel/FinancialDetailsPanel';
import { MetricCard } from '../../components/MetricCard/MetricCard';
import { Stepper } from '../../components/Stepper/Stepper';
import { UserMenu } from '../../components/UserMenu/UserMenu';
import {
  cashFlowAnytimeItems,
  cashFlowItems,
  debtPriorityItems,
  financialDetailItems,
  summaryCards
} from '../../data/mockData';
import type { StepItem } from '../../types/dashboard';
import './DashboardMain.css';

interface DashboardMainProps {
  name: string;
  onNameChange: (name: string) => void;
  steps: StepItem[];
}

export function DashboardMain({ name, onNameChange, steps }: DashboardMainProps) {
  return (
    <main className="dashboard-main">
      <header className="topbar">
        <Stepper steps={steps} />
        <UserMenu name={name} onNameChange={onNameChange} />
      </header>

      <section className="welcome">
        <div>
          <h1>Welcome back, {name} 👋</h1>
          <p>You're on track! Here&apos;s your financial overview for the next 30 days.</p>
        </div>
        <div className="status-pill">You have ₹20,000 left per month.</div>
      </section>

      <section className="metrics-grid">
        {summaryCards.map((item) => (
          <MetricCard item={item} key={item.title} />
        ))}
      </section>

      <section className="detail-grid">
        <CashFlowPanel anytimeItems={cashFlowAnytimeItems} items={cashFlowItems} />
        <DebtPriorityPanel items={debtPriorityItems} />
      </section>

      <FinancialDetailsPanel items={financialDetailItems} />
    </main>
  );
}
