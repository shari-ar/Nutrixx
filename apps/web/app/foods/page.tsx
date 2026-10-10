import { FoodWorkspace } from '@/components/food-workspace';
import { PageHeader } from '@/components/page-header';

export default function FoodsPage() {
  return (
    <div className="py-12 sm:py-16">
      <PageHeader
        description="Inspect food evidence or add an exact label-derived food without turning missing values into zero. Reference catalog installation belongs in your dashboard."
        eyebrow="Local food knowledge"
        title="Foods and composition"
      />
      <div className="mt-10">
        <FoodWorkspace />
      </div>
    </div>
  );
}
