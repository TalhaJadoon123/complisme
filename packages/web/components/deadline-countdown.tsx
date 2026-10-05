'use client';

/** Client-side countdown to a regulatory deadline. */
import { useEffect, useState } from 'react';

interface Props {
  date: string;
  label: string;
  frameworkId: string;
  description: string;
  compact?: boolean;
}

const ACCENT: Record<string, { ring: string; text: string; dot: string }> = {
  'eu-ai-act': { ring: 'ring-brand-200', text: 'text-brand-700', dot: 'bg-brand-600' },
  csrd: { ring: 'ring-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-600' },
  gdpr: { ring: 'ring-sky-200', text: 'text-sky-700', dot: 'bg-sky-600' },
  'e-invoicing': { ring: 'ring-amber-200', text: 'text-amber-700', dot: 'bg-amber-600' },
};

function parts(days: number) {
  const clamped = Math.max(0, days);
  return {
    days: clamped,
    weeks: Math.floor(clamped / 7),
    months: Math.floor(clamped / 30),
  };
}

export function DeadlineCountdown({ date, label, frameworkId, description, compact }: Props) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const accent = ACCENT[frameworkId] ?? ACCENT['gdpr'];
  const daysRemaining = now === null ? null : Math.ceil((new Date(date).getTime() - now) / 86_400_000);
  const p = daysRemaining === null ? { days: 0, weeks: 0, months: 0 } : parts(daysRemaining);
  const urgent = daysRemaining !== null && daysRemaining > 0 && daysRemaining <= 120;
  const passed = daysRemaining !== null && daysRemaining <= 0;

  if (compact) {
    return (
      <div className={`rounded-lg px-3 py-2 ring-1 ${accent.ring} bg-white`}>
        <div className={`text-xs font-semibold ${accent.text}`}>{label}</div>
        <div className="mt-0.5 text-sm font-bold text-ink">
          {daysRemaining === null ? '—' : passed ? 'in force' : `${p.days} days`}
        </div>
      </div>
    );
  }

  return (
    <div className={`card-pad ring-1 ${accent.ring}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${accent.text}`}>
            <span className={`h-2 w-2 rounded-full ${accent.dot} ${urgent ? 'animate-pulse-soft' : ''}`} />
            {frameworkId === 'eu-ai-act' ? 'EU AI Act' : frameworkId.toUpperCase()}
          </div>
          <h3 className="mt-1 text-base font-bold text-ink">{label}</h3>
        </div>
        <div className="shrink-0 text-right">
          {daysRemaining === null ? (
            <div className="text-2xl font-black text-ink">—</div>
          ) : passed ? (
            <>
              <div className="text-2xl font-black text-red-600">In force</div>
              <div className="text-xs text-ink-muted">already applying</div>
            </>
          ) : (
            <>
              <div className={`text-3xl font-black tabular-nums ${accent.text}`}>{p.days}</div>
              <div className="text-xs text-ink-muted">days left</div>
            </>
          )}
        </div>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-ink-muted">{description}</p>

      <div className="mt-4 flex gap-4 border-t border-slate-100 pt-3 text-xs text-ink-muted">
        {!passed && (
          <>
            <span>
              <strong className="text-ink">{p.weeks}</strong> weeks
            </span>
            <span>
              <strong className="text-ink">{p.months}</strong> months
            </span>
          </>
        )}
        <span>
          Deadline <strong className="text-ink">{date}</strong>
        </span>
      </div>
    </div>
  );
}