import Link from 'next/link';

import { PageHeader } from '@/components/page-header';
import { StarterForm } from '@/components/starter-form';

export default function StartPage() {
  return (
    <div className="grid gap-10 py-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-start lg:py-20">
      <PageHeader
        description="A short starting profile gives Nutrixx enough context to build a useful first estimate. Everything can be refined later."
        eyebrow="Your starting point"
        title="Begin with what matters most."
      />
      <div>
        <StarterForm />
        <Link
          className="mt-5 inline-block text-sm font-semibold text-accent underline"
          href="/settings"
        >
          Restore an existing local backup
        </Link>
      </div>
    </div>
  );
}
