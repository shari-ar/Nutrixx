import { BrandLogo } from '@/components/brand-logo';

export default function Home() {
  return (
    <section className="flex min-h-[calc(100vh-10rem)] items-center py-16">
      <div className="w-full max-w-3xl">
        <div className="mb-10 max-w-xl rounded-3xl border border-separator bg-white px-8 py-7 shadow-sm">
          <BrandLogo
            className="h-auto w-full"
            priority
            sizes="(min-width: 640px) 512px, calc(100vw - 7rem)"
          />
        </div>

        <p className="mb-5 text-sm font-semibold uppercase tracking-[0.24em] text-accent">
          Personalized nutrition
        </p>
        <h1 className="max-w-2xl text-5xl font-semibold tracking-tight sm:text-7xl">
          Nutrition intelligence built around real life.
        </h1>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-muted sm:text-xl">
          Nutrixx turns food, activity, and optional health data into practical,
          confidence-aware nutrition guidance.
        </p>

        <div className="mt-12 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-separator bg-surface/60 p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">
              Web
            </p>
            <p className="mt-2 font-medium">Next.js + HeroUI</p>
          </div>
          <div className="rounded-2xl border border-separator bg-surface/60 p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">
              API
            </p>
            <p className="mt-2 font-medium">NestJS API foundation</p>
          </div>
        </div>
      </div>
    </section>
  );
}
