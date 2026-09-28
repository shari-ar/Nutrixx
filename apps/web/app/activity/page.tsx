import { PageHeader } from '@/components/page-header';

const signals = [
  { label: 'Active time', value: '42 min', note: '8 min to today’s target' },
  {
    label: 'Sleep',
    value: '7 h 18 m',
    note: 'Consistent with your recent pattern',
  },
  { label: 'Recovery', value: 'Steady', note: 'No adjustment suggested' },
];

export default function ActivityPage() {
  return (
    <div className="py-12 sm:py-16">
      <PageHeader
        description="Movement, sleep, and recovery provide context for nutrition decisions. They remain understandable as separate signals."
        eyebrow="Activity and recovery"
        title="Context beyond food"
      />

      <section className="mt-10 grid gap-4 md:grid-cols-3">
        {signals.map((signal) => (
          <article
            key={signal.label}
            className="rounded-[1.5rem] border border-separator bg-surface/75 p-6"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              {signal.label}
            </p>
            <h2 className="mt-3 text-3xl font-semibold">{signal.value}</h2>
            <p className="mt-3 text-sm leading-6 text-muted">{signal.note}</p>
          </article>
        ))}
      </section>

      <section className="mt-6 rounded-[1.5rem] border border-separator bg-surface/75 p-6">
        <h2 className="text-2xl font-semibold">Today’s timeline</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-background/60 p-4">
            <p className="font-medium">Morning walk</p>
            <p className="mt-1 text-sm text-muted">
              28 minutes · Moderate pace
            </p>
          </div>
          <div className="rounded-2xl bg-background/60 p-4">
            <p className="font-medium">Mobility session</p>
            <p className="mt-1 text-sm text-muted">14 minutes · Light effort</p>
          </div>
        </div>
      </section>
    </div>
  );
}
