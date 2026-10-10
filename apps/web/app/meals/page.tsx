import { MealWorkspace } from '@/components/meal-workspace';
import { PageHeader } from '@/components/page-header';

export default function MealsPage() {
  return (
    <div className="py-12 sm:py-16">
      <PageHeader
        description="Log food manually, correct any detail, and keep an auditable local history."
        eyebrow="Local meal ledger"
        title="Your meals"
      />
      <div className="mt-10">
        <MealWorkspace />
      </div>
    </div>
  );
}
