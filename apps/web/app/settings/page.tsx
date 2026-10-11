import Link from 'next/link';

import { PageHeader } from '@/components/page-header';

import { StorageStatusPanel } from './storage-status-panel';

export default function SettingsPage() {
  return (
    <div className="py-12 sm:py-16">
      <PageHeader
        description="See where your Free data lives, reduce eviction risk, create a recovery copy, or explicitly clear this browser profile."
        eyebrow="Settings · Storage"
        title="Storage and recovery"
      />
      <StorageStatusPanel />
      <section className="mt-8 rounded-[1.5rem] border border-separator bg-surface/75 p-6">
        <h2 className="text-xl font-semibold">Nutrition-day time zone</h2>
        <p className="mt-2 text-sm text-muted">
          Review the device travel time zone and schedule a confirmed change for
          the next nutrition day. Earlier days keep their original zone.
        </p>
        <Link
          className="mt-4 inline-block font-semibold text-accent underline"
          href="/nutrition"
        >
          Open nutrition-day settings
        </Link>
      </section>
    </div>
  );
}
