import type { CashFlowAnytimeItem, CashFlowItem } from '../../types/dashboard';
import './CashFlowPanel.css';

interface CashFlowPanelProps {
  items: CashFlowItem[];
  anytimeItems: CashFlowAnytimeItem[];
}

export function CashFlowPanel({ items, anytimeItems }: CashFlowPanelProps) {
  return (
    <article className="panel cash-flow-panel">
      <h2>30-Day Cash Flow</h2>
      <p>Expected inflows and outflows for the next 30 days.</p>

      <div className="cash-flow-panel__body">
        <div className="cash-flow-list">
          {items.map((item) => (
            <div className="cash-flow-row" key={`${item.date}-${item.label}`}>
              <span className="cash-flow-row__left">
                <small>{item.date}</small>
                <strong>{item.label}</strong>
              </span>
              <span className={`cash-flow-row__amount cash-flow-row__amount--${item.kind}`}>{item.amount}</span>
            </div>
          ))}
        </div>

        <div className="cash-flow-subsection">
          <h3>Items without specific dates</h3>

          <div className="cash-flow-list">
            {anytimeItems.map((item) => (
              <div className="cash-flow-row cash-flow-row--compact" key={item.label}>
                <span className="cash-flow-row__left">
                  <strong>{item.label}</strong>
                </span>
                <span className={`cash-flow-row__amount cash-flow-row__amount--${item.kind}`}>{item.amount}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}
