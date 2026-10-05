/** Score ring + bar used across the dashboard and marketing pages. */
import { clamp } from '@/lib/format';

export function ScoreRing({
  score,
  size = 96,
  label,
  grade,
}: {
  score: number;
  size?: number;
  label?: string;
  grade?: string;
}) {
  const value = clamp(score, 0, 100);
  const radius = size / 2 - 7;
  const circumference = 2 * Math.PI * radius;
  const dash = (value / 100) * circumference;
  const colour = value >= 80 ? '#059669' : value >= 60 ? '#d97706' : '#dc2626';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`${label ?? 'Score'} ${value}%`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={7} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colour}
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-black tabular-nums text-ink">{Math.round(value)}</span>
        {grade && <span className="text-[10px] font-semibold uppercase text-ink-muted">{grade}</span>}
      </div>
    </div>
  );
}

export function ScoreBar({ score, className = '' }: { score: number; className?: string }) {
  const value = clamp(score, 0, 100);
  const colour =
    value >= 80 ? 'bg-emerald-500' : value >= 60 ? 'bg-amber-500' : value >= 40 ? 'bg-orange-500' : 'bg-red-500';
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-slate-200 ${className}`}>
      <div className={`h-full rounded-full ${colour}`} style={{ width: `${value}%` }} />
    </div>
  );
}