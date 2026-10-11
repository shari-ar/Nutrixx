import { NutritionWorkspace } from '@/components/nutrition-workspace';
import { PageHeader } from '@/components/page-header';

export default function NutritionPage() {
  return (
    <div className="py-12 sm:py-16">
      <PageHeader
        description="Explore the nutrients in your recorded meals, the evidence behind each amount, and comparable days in your local history."
        eyebrow="Recorded nutrition"
        title="Your intake, with context"
      />
      <div className="mt-10">
        <NutritionWorkspace />
      </div>
    </div>
  );
}
