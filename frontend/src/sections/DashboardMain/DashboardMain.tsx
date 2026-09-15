import { CashFlowPanel } from '../../components/CashFlowPanel/CashFlowPanel';
import { DebtPriorityPanel } from '../../components/DebtPriorityPanel/DebtPriorityPanel';
import { FinancialDetailsPanel } from '../../components/FinancialDetailsPanel/FinancialDetailsPanel';
import { MetricCard } from '../../components/MetricCard/MetricCard';
import { Stepper } from '../../components/Stepper/Stepper';
import { UserMenu } from '../../components/UserMenu/UserMenu';
import type { DashboardData, StepItem } from '../../types/dashboard';
import './DashboardMain.css';

interface DashboardMainProps {
  name: string;
  onNameChange: (name: string) => void;
  steps: StepItem[];
  data: DashboardData;
}

export function DashboardMain({ name, onNameChange, steps, data }: DashboardMainProps) {
  const statusPillText = data.statusPillText.trim() || 'No data available at the moment.';

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
        <div className={`status-pill${data.summaryCards.length === 0 ? ' status-pill--empty' : ''}`}>
          {statusPillText}
        </div>
      </section>

      <section className="metrics-grid">
        {data.summaryCards.length > 0 ? (
          data.summaryCards.map((item) => <MetricCard item={item} key={item.title} />)
        ) : (
          <div className="panel panel-empty metrics-grid__empty">No data available at the moment.</div>
        )}
      </section>

      <section className="detail-grid">
        <CashFlowPanel anytimeItems={data.cashFlowAnytimeItems} items={data.cashFlowItems} />
        <DebtPriorityPanel items={data.debtPriorityItems} />
      </section>

      <FinancialDetailsPanel items={data.financialDetailItems} />
    </main>
  );
}
