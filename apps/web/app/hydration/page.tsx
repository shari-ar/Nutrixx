import { PageHeader } from '@/components/page-header';

export default function HydrationPage() {
  return (
    <div className="py-12 sm:py-16">
      <PageHeader
        description="A lightweight view for understanding today’s intake and the factors that may change the target."
        eyebrow="Hydration"
        title="Five of eight glasses"
      />

      <section className="mt-10 rounded-[2rem] border border-separator bg-surface/75 p-6 sm:p-8">
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
          {Array.from({ length: 8 }, (_, index) => (
            <div
              key={index}
              aria-label={`Glass ${index + 1}: ${index < 5 ? 'logged' : 'remaining'}`}
              className={`aspect-[3/4] rounded-b-2xl rounded-t-md border-2 ${
                index < 5
                  ? 'border-blue-400 bg-blue-400/70'
                  : 'border-separator bg-background/40'
              }`}
            />
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-3xl font-semibold">1.25 L logged</p>
            <p className="mt-2 text-sm text-muted">
              About 750 mL remains in this preview target.
            </p>
          </div>
          <span className="rounded-xl border border-separator px-4 py-2.5 text-sm text-muted">
            Quick logging arrives with the data foundation
          </span>
        </div>
      </section>
    </div>
  );
}
