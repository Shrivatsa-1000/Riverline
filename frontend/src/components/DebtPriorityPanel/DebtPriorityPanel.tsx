import type { DebtPriorityItem } from '../../types/dashboard';
import './DebtPriorityPanel.css';

interface DebtPriorityPanelProps {
  items: DebtPriorityItem[];
}

export function DebtPriorityPanel({ items }: DebtPriorityPanelProps) {
  return (
    <article className="panel debt-priority-panel">
      <h2>Debt &amp; Credit Card Prioritization</h2>
      <p>Recommended payment order based on due dates and interest rates.</p>

      <div className="debt-priority-panel__body">
        <div className="debt-priority-list">
          {items.map((item, index) => (
            <div className="debt-priority-row" key={item.label}>
              <div className="debt-priority-row__left">
                <small>#{index + 1}</small>
                <strong>{item.label}</strong>
                <span>{item.due}</span>
                <span>{item.apr}</span>
              </div>

              <div className="debt-priority-row__right">
                <span className="debt-priority-row__tag">{item.priority} Priority</span>
                <span className="debt-priority-row__amount">{item.amount}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
