import { Sparkles } from 'lucide-react';
import './BrandHeader.css';

export function BrandHeader() {
  return (
    <div className="brand">
      <div className="brand__title">
        <span className="brand__logo">
          <Sparkles size={20} />
        </span>
        Paisa
      </div>
      <div className="brand__tag">Your AI Financial Companion</div>
    </div>
  );
}
