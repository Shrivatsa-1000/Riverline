import './VoiceWave.css';

interface VoiceWaveProps {
  level: number;
  isActive: boolean;
}

const BAR_COUNT = 26;

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function VoiceWave({ level, isActive }: VoiceWaveProps) {
  const normalizedLevel = clamp(level);
  const center = (BAR_COUNT - 1) / 2;

  return (
    <div aria-hidden className={`voice-wave ${isActive ? 'voice-wave--active' : ''}`}>
      {Array.from({ length: BAR_COUNT }, (_, index) => {
        const distanceFromCenter = Math.abs(index - center);
        const envelope = 1 - distanceFromCenter / center;
        const texture = 0.78 + ((index * 7) % 9) / 20;

        const minHeight = 4 + envelope * 3;
        const maxHeight = 8 + envelope * 28;
        const barHeight = minHeight + normalizedLevel * maxHeight * texture;

        return <span className="voice-wave__bar" key={index} style={{ height: `${barHeight}px` }} />;
      })}
    </div>
  );
}
