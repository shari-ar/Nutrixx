import Link from 'next/link';

import { PageHeader } from '@/components/page-header';
import { ProductIcon } from '@/components/product-icons';
import { mockMeals } from '@/config/mock-data';

export default function MealsPage() {
  return (
    <div className="py-12 sm:py-16">
      <PageHeader
        description="Move through completed and planned meals without losing the context of your day."
        eyebrow="Meal timeline"
        title="Today’s meals"
      />

      <div className="mt-10 space-y-4">
        {mockMeals.map((meal) => (
          <Link
            key={meal.id}
            className="group grid gap-5 rounded-[1.5rem] border border-separator bg-surface/75 p-5 transition hover:border-accent/40 sm:grid-cols-[7rem_1fr_auto] sm:items-center"
            href={`/meals/${meal.id}`}
          >
            <div>
              <p className="text-sm font-semibold">{meal.time}</p>
              <p className="mt-1 text-xs text-muted">{meal.status}</p>
            </div>
            <div>
              <h2 className="text-xl font-semibold">{meal.title}</h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                {meal.description}
              </p>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted">
              <span>{meal.calories} kcal</span>
              <ProductIcon
                className="size-5 transition-transform group-hover:translate-x-1"
                name="arrow"
              />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
