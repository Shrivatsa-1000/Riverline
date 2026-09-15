import { Check } from 'lucide-react';
import type { StepItem } from '../../types/dashboard';
import './Stepper.css';

interface StepperProps {
  steps: StepItem[];
}

export function Stepper({ steps }: StepperProps) {
  if (steps.length === 0) {
    return (
      <div className="stepper-wrap stepper-wrap--empty">
        <div className="panel-empty">No data available at the moment.</div>
      </div>
    );
  }

  const columns = Math.max(steps.length, 1);

  return (
    <div className="stepper-wrap">
      <div className="stepper-line" />
      <div className="stepper" style={{ gridTemplateColumns: `repeat(${columns}, minmax(70px, 1fr))` }}>
        {steps.map((step) => (
          <div className={`step step--${step.status}`} key={step.id}>
            <div className="step__dot">
              {step.status === 'completed' ? <Check size={14} strokeWidth={3} /> : step.id}
            </div>
            <div className="step__title">{step.title}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
