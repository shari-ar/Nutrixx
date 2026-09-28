import Link from 'next/link';

import { ProductIcon } from '@/components/product-icons';
import type { ProductIconName } from '@/components/product-icons';
import { StarterForm } from '@/components/starter-form';

export default function Home() {
  return (
    <div className="py-12 sm:py-20">
      <section className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-separator bg-surface/70 px-3 py-1.5 text-xs font-semibold text-muted">
            <span className="size-2 rounded-full bg-emerald-500" />
            Private-first nutrition guidance
          </div>
          <h1 className="mt-7 max-w-3xl text-5xl font-semibold tracking-[-0.045em] sm:text-7xl">
            Eat with clarity, not complexity.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted sm:text-xl">
            Nutrixx turns food, activity, and optional health context into a
            practical nutrition plan while keeping daily input effortless.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground"
              href="/start"
            >
              Create my starting point
            </Link>
            <Link
              className="rounded-xl border border-separator bg-surface/70 px-5 py-3 text-sm font-semibold"
              href="/dashboard"
            >
              Explore the preview
            </Link>
          </div>

          <div className="mt-12 grid max-w-xl gap-4 sm:grid-cols-3">
            {[
              ['meal', 'Simple input', 'Log what matters'],
              ['nutrition', 'Deep coverage', 'Beyond macros'],
              ['check', 'Clear actions', 'Useful next steps'],
            ].map(([icon, title, copy]) => (
              <div
                key={title}
                className="rounded-2xl border border-separator bg-surface/55 p-4"
              >
                <ProductIcon
                  className="size-5 text-accent"
                  name={icon as ProductIconName}
                />
                <p className="mt-3 text-sm font-semibold">{title}</p>
                <p className="mt-1 text-xs text-muted">{copy}</p>
              </div>
            ))}
          </div>
        </div>

        <StarterForm heading="See your first dashboard" />
      </section>
    </div>
  );
}
