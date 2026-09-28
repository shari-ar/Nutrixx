import Link from 'next/link';

import { DashboardCard } from '@/components/dashboard-card';

const metrics = [
  { label: 'Planned energy', value: '1,570 kcal' },
  { label: 'Protein', value: '94 g' },
  { label: 'Daily coverage', value: '78%' },
];

export default function DashboardPage() {
  return (
    <div className="py-10 sm:py-14">
      <header className="rounded-[2rem] border border-separator bg-surface/75 p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
                Today
              </p>
              <span className="rounded-full bg-warning/15 px-2.5 py-1 text-xs font-medium text-warning-700 dark:text-warning-300">
                Preview data
              </span>
            </div>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
              Your day, at a glance.
            </h1>
            <p className="mt-3 max-w-2xl leading-7 text-muted">
              A calm overview of the decisions that matter now. Deeper detail
              stays one click away.
            </p>
          </div>
          <Link
            className="rounded-xl border border-separator bg-background/60 px-4 py-2.5 text-sm font-semibold"
            href="/start"
          >
            Update starting profile
          </Link>
        </div>

        <dl className="mt-8 grid gap-3 sm:grid-cols-3">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-2xl bg-background/60 p-4"
            >
              <dt className="text-xs font-medium text-muted">{metric.label}</dt>
              <dd className="mt-1 text-xl font-semibold">{metric.value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <section
        aria-label="Daily overview"
        className="mt-6 grid gap-5 md:grid-cols-2"
      >
        <DashboardCard
          accent="orange"
          eyebrow="Next meal · 12:30 PM"
          href="/meals"
          icon="meal"
          title="Roasted salmon bowl"
        >
          Salmon, brown rice, greens, and lemon-tahini dressing. View previous
          and upcoming meals.
        </DashboardCard>
        <DashboardCard
          accent="green"
          eyebrow="Nutrition state"
          href="/nutrition"
          icon="nutrition"
          title="Most targets are on track"
        >
          Protein and calcium look strong. Iron needs attention in the remaining
          meals.
        </DashboardCard>
        <DashboardCard
          accent="violet"
          eyebrow="Movement and recovery"
          href="/activity"
          icon="activity"
          title="42 active minutes"
        >
          Activity is on target. Last night&apos;s sleep was 7 hours and 18
          minutes.
        </DashboardCard>
        <DashboardCard
          accent="blue"
          eyebrow="Hydration"
          href="/hydration"
          icon="droplet"
          title="5 of 8 glasses"
        >
          Three glasses remain in today&apos;s flexible hydration target.
        </DashboardCard>
      </section>
    </div>
  );
}
