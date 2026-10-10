'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { CatalogInstaller } from '@/components/catalog-installer';
import { DashboardCard } from '@/components/dashboard-card';
import { BrowserOnboardingStore } from '@/lib/browser-onboarding';

import type { StartingProfileV1 } from '@nutrixx/user-context';

type OnboardingReader = Pick<BrowserOnboardingStore, 'load'>;

const goalLabels = {
  gain: 'Gain weight',
  lose: 'Lose weight',
  maintain: 'Maintain weight',
} as const;

export function DashboardShell({ store }: { store?: OnboardingReader }) {
  const router = useRouter();
  const [profile, setProfile] = useState<StartingProfileV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    void (store ?? new BrowserOnboardingStore())
      .load()
      .then((result) => {
        if (!active) return;
        if (result === null) {
          router.replace('/start');
          return;
        }
        setProfile(result);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [retry, router, store]);

  if (loading) return <p role="status">Opening your local dashboard…</p>;

  if (failed) {
    return (
      <section className="my-14 rounded-[2rem] border border-danger/30 bg-surface p-8">
        <h1 className="text-3xl font-semibold">Local data needs attention.</h1>
        <p className="mt-3 text-muted" role="alert">
          Your profile remains in this browser. Retry access or use Storage
          Settings for recovery options.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            className="rounded-xl bg-accent px-4 py-2 font-semibold text-accent-foreground"
            onClick={() => {
              setLoading(true);
              setFailed(false);
              setRetry((value) => value + 1);
            }}
            type="button"
          >
            Retry
          </button>
          <Link
            className="rounded-xl border border-separator px-4 py-2 font-semibold"
            href="/settings"
          >
            Storage settings
          </Link>
        </div>
      </section>
    );
  }

  if (profile === null) {
    return <p role="status">Taking you to your one-time starting profile…</p>;
  }

  const metrics = [
    { label: 'Primary goal', value: goalLabels[profile.primaryGoal] },
    { label: 'Starting profile', value: 'Ready' },
    { label: 'Data location', value: 'This browser' },
  ];

  return (
    <div className="py-10 sm:py-14">
      <header className="rounded-[2rem] border border-separator bg-surface/75 p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
              Your dashboard
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
              Your day, at a glance.
            </h1>
            <p className="mt-3 max-w-2xl leading-7 text-muted">
              Your starting point is ready. Add daily context through the four
              focused areas below.
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

      <CatalogInstaller />

      <section
        aria-label="Daily overview"
        className="mt-6 grid gap-5 md:grid-cols-2"
      >
        <DashboardCard
          accent="orange"
          eyebrow="Meals"
          href="/meals"
          icon="meal"
          title="Log or review meals"
        >
          Record what you eat, then revisit previous and upcoming meals.
        </DashboardCard>
        <DashboardCard
          accent="green"
          eyebrow="Nutrition and health"
          href="/nutrition"
          icon="nutrition"
          title="Build your nutrition state"
        >
          Nutrition insights become available as your real meal history grows.
        </DashboardCard>
        <DashboardCard
          accent="violet"
          eyebrow="Activity and sleep"
          href="/activity"
          icon="activity"
          title="Add movement and recovery"
        >
          Keep activity, sleep, and recovery context together.
        </DashboardCard>
        <DashboardCard
          accent="blue"
          eyebrow="Hydration"
          href="/hydration"
          icon="droplet"
          title="Track water intake"
        >
          Record glasses and review your hydration progress for the day.
        </DashboardCard>
      </section>
    </div>
  );
}
