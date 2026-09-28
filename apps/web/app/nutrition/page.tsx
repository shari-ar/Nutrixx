import { PageHeader } from '@/components/page-header';

const nutrients = [
  { label: 'Protein', note: 'On track', value: 82 },
  { label: 'Fiber', note: '6 g remaining', value: 71 },
  { label: 'Calcium', note: 'On track', value: 88 },
  { label: 'Iron', note: 'Needs attention', value: 54 },
  { label: 'Vitamin D', note: 'On track', value: 91 },
  { label: 'Magnesium', note: '9% remaining', value: 76 },
];

export default function NutritionPage() {
  return (
    <div className="py-12 sm:py-16">
      <PageHeader
        description="See the nutrients that can meaningfully change your next food decision without turning the day into a spreadsheet."
        eyebrow="Nutrition state"
        title="Coverage you can act on"
      />

      <section className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {nutrients.map((nutrient) => (
          <article
            key={nutrient.label}
            className="rounded-[1.5rem] border border-separator bg-surface/75 p-5"
          >
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-semibold">{nutrient.label}</h2>
              <span className="text-sm font-semibold">{nutrient.value}%</span>
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-background">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${nutrient.value}%` }}
              />
            </div>
            <p className="mt-3 text-sm text-muted">{nutrient.note}</p>
          </article>
        ))}
      </section>

      <aside className="mt-6 rounded-2xl border border-separator bg-surface/55 p-5 text-sm leading-6 text-muted">
        Preview values illustrate the future information hierarchy. Guidance
        will disclose data completeness and confidence before influencing a
        plan.
      </aside>
    </div>
  );
}
