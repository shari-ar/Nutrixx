import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getMockMeal, mockMeals } from '@/config/mock-data';

export function generateStaticParams() {
  return mockMeals.map((meal) => ({ mealId: meal.id }));
}

export default async function MealDetailPage({
  params,
}: {
  params: Promise<{ mealId: string }>;
}) {
  const { mealId } = await params;
  const meal = getMockMeal(mealId);

  if (!meal) notFound();

  return (
    <div className="py-12 sm:py-16">
      <Link className="text-sm font-semibold text-accent" href="/meals">
        ← Back to meals
      </Link>
      <header className="mt-7 max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
          {meal.dateLabel} · {meal.time} · {meal.status}
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          {meal.title}
        </h1>
        <p className="mt-4 text-lg leading-7 text-muted">{meal.description}</p>
      </header>

      <dl className="mt-8 grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
        <div className="rounded-2xl border border-separator bg-surface/75 p-5">
          <dt className="text-xs text-muted">Energy</dt>
          <dd className="mt-1 text-2xl font-semibold">{meal.calories} kcal</dd>
        </div>
        <div className="rounded-2xl border border-separator bg-surface/75 p-5">
          <dt className="text-xs text-muted">Protein</dt>
          <dd className="mt-1 text-2xl font-semibold">{meal.protein} g</dd>
        </div>
      </dl>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-[1.5rem] border border-separator bg-surface/75 p-6">
          <h2 className="text-2xl font-semibold">Ingredients</h2>
          <ul className="mt-5 space-y-3 text-muted">
            {meal.ingredients.map((ingredient) => (
              <li key={ingredient}>• {ingredient}</li>
            ))}
          </ul>
        </section>
        <section className="rounded-[1.5rem] border border-separator bg-surface/75 p-6">
          <h2 className="text-2xl font-semibold">Preparation</h2>
          <ol className="mt-5 space-y-3 text-muted">
            {meal.steps.map((step, index) => (
              <li key={step}>
                {index + 1}. {step}
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="mt-6 rounded-[1.5rem] border border-separator bg-surface/75 p-6">
        <h2 className="text-2xl font-semibold">Nutrition snapshot</h2>
        <dl className="mt-5 grid gap-3 sm:grid-cols-3">
          {meal.nutrients.map((nutrient) => (
            <div
              key={nutrient.label}
              className="rounded-2xl bg-background/60 p-4"
            >
              <dt className="text-xs text-muted">{nutrient.label}</dt>
              <dd className="mt-1 font-semibold">{nutrient.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
